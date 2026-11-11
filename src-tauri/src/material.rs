use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::fs;
use std::io::{self, BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager};
use thiserror::Error;
use uuid::Uuid;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const MINERU_PACKAGE: &str = "mineru[all]";
const PYPI_CHINA_MIRROR: &str = "https://mirrors.aliyun.com/pypi/simple";
const MINERU_PARSE_PROGRESS_EVENT: &str = "material://mineru-parse-progress";
const PDF_SKILL_PARSE_PROGRESS_EVENT: &str = "material://pdf-skill-parse-progress";
const PDF_SKILL_RESULT_FILE: &str = "pdf-parse-result.json";
const PDF_SKILL_REPORT_FILE: &str = "pdf-parse-report.md";
const CODEX_PDF_SKILL_PARSER: &str = "codex-pdf-skill";
const MINERU_OCR_SKILL_PARSER: &str = "mineru-ocr-skill";
const MIN_USABLE_PDF_TEXT_CHARS: usize = 80;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", content = "message")]
pub enum MaterialParseError {
    #[serde(rename = "runtime-failed")]
    #[error("PDF parser runtime failed: {0}")]
    RuntimeFailed(String),

    #[serde(rename = "parse-failed")]
    #[error("PDF parse failed: {0}")]
    ParseFailed(String),

    #[serde(rename = "io")]
    #[error("I/O error: {0}")]
    Io(String),
}

pub type MaterialParseResult<T> = Result<T, MaterialParseError>;

#[derive(Debug, Serialize)]
pub struct PdfParseResult {
    pub text: String,
    pub output_dir: String,
    pub markdown_files: Vec<String>,
    pub content_json_files: Vec<String>,
    pub layout_blocks: Vec<MaterialLayoutBlock>,
    pub pages: Vec<MaterialParsedPage>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct MaterialLayoutBlock {
    pub id: String,
    pub page_number: usize,
    pub order: usize,
    pub block_type: String,
    pub text: String,
    pub markdown: Option<String>,
    pub source_path: Option<String>,
    pub bbox: Option<[f64; 4]>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct MaterialParsedPage {
    pub page_number: usize,
    pub text: String,
    pub block_ids: Vec<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct MineruRuntimeStatus {
    pub ready: bool,
    pub source: String,
    pub runtime_dir: String,
    pub executable_path: Option<String>,
    pub version: Option<String>,
    pub message: String,
    pub install_command: String,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct MineruRuntimeInstallResult {
    pub status: MineruRuntimeStatus,
    pub logs: Vec<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct PdfSkillRuntimeStatus {
    pub ready: bool,
    pub codex_available: bool,
    pub codex_path: Option<String>,
    pub codex_version: Option<String>,
    pub pdf_skill_available: bool,
    pub pdf_skill_path: String,
    pub mineru_ocr_skill_available: bool,
    pub mineru_ocr_skill_path: String,
    pub mineru_ocr_token_available: bool,
    pub python_available: bool,
    pub pdfplumber_available: bool,
    pub pypdf_available: bool,
    pub poppler_available: bool,
    pub runtime_dir: String,
    pub message: String,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MineruParseProgressPayload {
    pub run_id: String,
    pub stage: String,
    pub status: String,
    pub message: String,
    pub percentage: Option<f32>,
    pub method: Option<String>,
    pub log_line: Option<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PdfSkillParseProgressPayload {
    pub run_id: String,
    pub parser: String,
    pub stage: String,
    pub status: String,
    pub message: String,
    pub percentage: Option<f32>,
    pub log_line: Option<String>,
    pub workspace_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
struct ProgramCall {
    program: String,
    args: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
struct ProcessLine {
    stream: &'static str,
    line: String,
}

#[derive(Debug, Clone)]
struct CodexSkillRuntime {
    parser_id: &'static str,
    display_name: &'static str,
    skill_name: &'static str,
    skill_path: PathBuf,
}

#[derive(Debug, Deserialize)]
struct CodexPdfSkillResult {
    #[serde(default, alias = "schemaVersion")]
    schema_version: Option<u32>,
    #[serde(default)]
    text: String,
    #[serde(default)]
    pages: Vec<CodexPdfSkillPage>,
    #[serde(default, alias = "layoutBlocks")]
    layout_blocks: Vec<CodexPdfSkillBlock>,
    #[serde(default)]
    warnings: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct CodexPdfSkillPage {
    #[serde(default, alias = "pageNumber")]
    page_number: usize,
    #[serde(default)]
    text: String,
    #[serde(default)]
    markdown: Option<String>,
    #[serde(default, alias = "blockIds")]
    block_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct CodexPdfSkillBlock {
    #[serde(default)]
    id: String,
    #[serde(default, alias = "pageNumber")]
    page_number: usize,
    #[serde(default)]
    order: usize,
    #[serde(default, alias = "blockType")]
    block_type: String,
    #[serde(default)]
    text: String,
    #[serde(default)]
    markdown: Option<String>,
    #[serde(default, alias = "sourcePath")]
    source_path: Option<String>,
    #[serde(default)]
    bbox: Option<[f64; 4]>,
}

#[tauri::command]
pub async fn material_parse_pdf_with_mineru(
    app: tauri::AppHandle,
    file_name: String,
    file_bytes: Vec<u8>,
    run_id: Option<String>,
) -> MaterialParseResult<PdfParseResult> {
    tauri::async_runtime::spawn_blocking(move || {
        parse_pdf_with_mineru(&file_name, &file_bytes, Some(&app), run_id)
    })
    .await
    .map_err(|error| MaterialParseError::RuntimeFailed(error.to_string()))?
}

#[tauri::command]
pub async fn material_parse_pdf_with_codex_skill(
    app: tauri::AppHandle,
    file_name: String,
    file_bytes: Vec<u8>,
    run_id: Option<String>,
) -> MaterialParseResult<PdfParseResult> {
    tauri::async_runtime::spawn_blocking(move || {
        parse_pdf_with_codex_skill(&app, &file_name, &file_bytes, run_id)
    })
    .await
    .map_err(|error| MaterialParseError::RuntimeFailed(error.to_string()))?
}

#[tauri::command]
pub async fn material_get_mineru_runtime_status(
    app: tauri::AppHandle,
) -> MaterialParseResult<MineruRuntimeStatus> {
    tauri::async_runtime::spawn_blocking(move || mineru_runtime_status(&app))
        .await
        .map_err(|error| MaterialParseError::RuntimeFailed(error.to_string()))?
}

#[tauri::command]
pub async fn material_get_pdf_skill_runtime_status(
    app: tauri::AppHandle,
) -> MaterialParseResult<PdfSkillRuntimeStatus> {
    tauri::async_runtime::spawn_blocking(move || pdf_skill_runtime_status(&app))
        .await
        .map_err(|error| MaterialParseError::RuntimeFailed(error.to_string()))?
}

#[tauri::command]
pub async fn material_install_mineru_runtime(
    app: tauri::AppHandle,
    use_china_mirror: Option<bool>,
) -> MaterialParseResult<MineruRuntimeInstallResult> {
    tauri::async_runtime::spawn_blocking(move || {
        install_mineru_runtime(&app, use_china_mirror.unwrap_or(true))
    })
    .await
    .map_err(|error| MaterialParseError::RuntimeFailed(error.to_string()))?
}

fn parse_pdf_with_codex_skill(
    app: &tauri::AppHandle,
    file_name: &str,
    file_bytes: &[u8],
    run_id: Option<String>,
) -> MaterialParseResult<PdfParseResult> {
    let run_id = normalize_parse_run_id(run_id);
    let result = parse_pdf_with_codex_skill_inner(app, file_name, file_bytes, &run_id);
    if let Err(error) = &result {
        emit_pdf_skill_progress(
            Some(app),
            &run_id,
            "failed",
            "failed",
            &truncate_log(&error.to_string()),
            Some(100.0),
            None,
            None,
            CODEX_PDF_SKILL_PARSER,
        );
    }
    result
}

fn parse_pdf_with_codex_skill_inner(
    app: &tauri::AppHandle,
    file_name: &str,
    file_bytes: &[u8],
    run_id: &str,
) -> MaterialParseResult<PdfParseResult> {
    let workspace_dir = pdf_skill_run_workspace_dir(app, run_id)?;
    let input_dir = workspace_dir.join("input");
    let pages_dir = workspace_dir.join("pages");
    let renders_dir = workspace_dir.join("renders");
    let logs_dir = workspace_dir.join("logs");
    for dir in [
        &input_dir,
        &pages_dir,
        &renders_dir,
        &logs_dir,
        &workspace_dir.join(".codex-skills"),
    ] {
        fs::create_dir_all(dir).map_err(|error| MaterialParseError::Io(error.to_string()))?;
    }

    emit_pdf_skill_progress(
        Some(app),
        run_id,
        "preparing",
        "running",
        "Preparing Codex PDF Skill workspace.",
        Some(5.0),
        None,
        Some(&workspace_dir),
        CODEX_PDF_SKILL_PARSER,
    );

    let input_path = input_dir.join(normalize_pdf_name(file_name));
    fs::write(&input_path, file_bytes)
        .map_err(|error| MaterialParseError::Io(error.to_string()))?;

    let status = pdf_skill_runtime_status(app)?;
    if !status.codex_available {
        return Err(MaterialParseError::RuntimeFailed(
            "Codex CLI is not available. Install and log in to Codex CLI first.".to_string(),
        ));
    }

    let codex_program = status
        .codex_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
        .unwrap_or("codex");
    let primary_skill = status.pdf_skill_available.then(|| CodexSkillRuntime {
        parser_id: CODEX_PDF_SKILL_PARSER,
        display_name: "Codex PDF Skill",
        skill_name: "pdf",
        skill_path: PathBuf::from(&status.pdf_skill_path),
    });
    let fallback_skill = status
        .mineru_ocr_skill_available
        .then(|| CodexSkillRuntime {
            parser_id: MINERU_OCR_SKILL_PARSER,
            display_name: "MinerU OCR Skill",
            skill_name: "mineru-ocr",
            skill_path: PathBuf::from(&status.mineru_ocr_skill_path),
        });

    if primary_skill.is_none() && fallback_skill.is_none() {
        return Err(MaterialParseError::RuntimeFailed(format!(
            "No PDF parser skill is available. Missing primary: {}. Missing fallback: {}.",
            status.pdf_skill_path, status.mineru_ocr_skill_path
        )));
    }

    let mut last_error: Option<MaterialParseError> = None;
    if let Some(skill) = primary_skill {
        match run_codex_pdf_parser_skill(
            codex_program,
            &workspace_dir,
            &logs_dir,
            &input_path,
            file_name,
            &skill,
            Some(app),
            run_id,
            None,
        ) {
            Ok(result) => return Ok(result),
            Err(error) => {
                let message = truncate_log(&error.to_string());
                emit_pdf_skill_progress(
                    Some(app),
                    run_id,
                    "fallback",
                    "running",
                    &format!("PDF Skill failed, falling back to MinerU OCR Skill. {message}"),
                    Some(50.0),
                    Some(&message),
                    Some(&workspace_dir),
                    MINERU_OCR_SKILL_PARSER,
                );
                last_error = Some(error);
                cleanup_pdf_skill_output_files(&workspace_dir);
            }
        }
    }

    if let Some(skill) = fallback_skill {
        return run_codex_pdf_parser_skill(
            codex_program,
            &workspace_dir,
            &logs_dir,
            &input_path,
            file_name,
            &skill,
            Some(app),
            run_id,
            last_error.as_ref().map(ToString::to_string).as_deref(),
        );
    }

    Err(last_error.unwrap_or_else(|| {
        MaterialParseError::RuntimeFailed(
            "Codex PDF Skill failed and MinerU OCR fallback skill is not available.".to_string(),
        )
    }))
}

fn run_codex_pdf_skill_cli(
    codex_program: &str,
    workspace_dir: &Path,
    logs_dir: &Path,
    prompt: &str,
    app: Option<&tauri::AppHandle>,
    run_id: &str,
    parser_id: &'static str,
) -> MaterialParseResult<Output> {
    let mut command = Command::new(codex_program);
    command
        .args(codex_pdf_skill_args(workspace_dir))
        .current_dir(workspace_dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    emit_pdf_skill_progress(
        app,
        run_id,
        "starting_codex",
        "running",
        "Starting Codex CLI for PDF parsing.",
        Some(20.0),
        None,
        Some(workspace_dir),
        parser_id,
    );
    let mut child = command.spawn().map_err(|error| {
        MaterialParseError::RuntimeFailed(format!("Failed to start Codex CLI: {error}"))
    })?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(prompt.as_bytes())
            .map_err(|error| MaterialParseError::RuntimeFailed(error.to_string()))?;
    }

    let (sender, receiver) = mpsc::channel::<ProcessLine>();
    let stdout_handle = child
        .stdout
        .take()
        .map(|stdout| spawn_process_log_reader(stdout, "stdout", sender.clone()));
    let stderr_handle = child
        .stderr
        .take()
        .map(|stderr| spawn_process_log_reader(stderr, "stderr", sender.clone()));
    drop(sender);

    let status = loop {
        drain_pdf_skill_process_lines(&receiver, app, run_id, workspace_dir, parser_id);
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(120)),
            Err(error) => {
                return Err(MaterialParseError::RuntimeFailed(format!(
                    "Failed while waiting for Codex CLI: {error}"
                )))
            }
        }
    };

    let stdout = join_process_log_reader(stdout_handle);
    let stderr = join_process_log_reader(stderr_handle);
    drain_pdf_skill_process_lines(&receiver, app, run_id, workspace_dir, parser_id);
    let _ = fs::write(
        logs_dir.join(format!("{parser_id}-codex-jsonl.log")),
        &stdout,
    );
    let _ = fs::write(
        logs_dir.join(format!("{parser_id}-codex-stderr.log")),
        &stderr,
    );

    Ok(Output {
        status,
        stdout,
        stderr,
    })
}

fn run_codex_pdf_parser_skill(
    codex_program: &str,
    workspace_dir: &Path,
    logs_dir: &Path,
    input_path: &Path,
    original_name: &str,
    skill: &CodexSkillRuntime,
    app: Option<&tauri::AppHandle>,
    run_id: &str,
    fallback_reason: Option<&str>,
) -> MaterialParseResult<PdfParseResult> {
    let skill_snapshot_dir = workspace_dir.join(".codex-skills").join(skill.skill_name);
    fs::create_dir_all(&skill_snapshot_dir)
        .map_err(|error| MaterialParseError::Io(error.to_string()))?;

    emit_pdf_skill_progress(
        app,
        run_id,
        "loading_skill",
        "running",
        &format!("Copying local {} snapshot.", skill.display_name),
        Some(if skill.parser_id == CODEX_PDF_SKILL_PARSER {
            14.0
        } else {
            54.0
        }),
        None,
        Some(workspace_dir),
        skill.parser_id,
    );
    copy_skill_snapshot(&skill.skill_path, &skill_snapshot_dir)?;

    let prompt = build_codex_pdf_skill_prompt(
        workspace_dir,
        input_path,
        &skill.skill_path,
        original_name,
        skill,
        fallback_reason,
    );

    let output = run_codex_pdf_skill_cli(
        codex_program,
        workspace_dir,
        logs_dir,
        &prompt,
        app,
        run_id,
        skill.parser_id,
    )?;
    if !output.status.success() {
        return Err(MaterialParseError::RuntimeFailed(format_process_output(
            &output,
        )));
    }

    emit_pdf_skill_progress(
        app,
        run_id,
        "validating_output",
        "running",
        &format!("Validating {} output.", skill.display_name),
        Some(90.0),
        None,
        Some(workspace_dir),
        skill.parser_id,
    );
    let result = build_pdf_parse_result_from_codex_skill(workspace_dir, &output)?;
    emit_pdf_skill_progress(
        app,
        run_id,
        "completed",
        "completed",
        &format!("{} parse completed.", skill.display_name),
        Some(100.0),
        None,
        Some(workspace_dir),
        skill.parser_id,
    );
    Ok(result)
}

fn build_pdf_parse_result_from_codex_skill(
    workspace_dir: &Path,
    output: &Output,
) -> MaterialParseResult<PdfParseResult> {
    let result_path = workspace_dir.join(PDF_SKILL_RESULT_FILE);
    if !result_path.exists() {
        return Err(MaterialParseError::ParseFailed(format!(
            "{} was not found. {}",
            PDF_SKILL_RESULT_FILE,
            format_process_output(output)
        )));
    }
    let raw = fs::read_to_string(&result_path)
        .map_err(|error| MaterialParseError::Io(error.to_string()))?;
    let parsed: CodexPdfSkillResult = serde_json::from_str(&raw).map_err(|error| {
        MaterialParseError::ParseFailed(format!("Invalid {PDF_SKILL_RESULT_FILE}: {error}"))
    })?;
    normalize_codex_pdf_skill_result(workspace_dir, parsed, result_path)
}

fn normalize_codex_pdf_skill_result(
    workspace_dir: &Path,
    parsed: CodexPdfSkillResult,
    result_path: PathBuf,
) -> MaterialParseResult<PdfParseResult> {
    if parsed.schema_version != Some(1) {
        return Err(MaterialParseError::ParseFailed(
            "pdf-parse-result.json schemaVersion must be 1.".to_string(),
        ));
    }

    let mut text = clean_joined_text(&parsed.text);
    if text.trim().is_empty() {
        text = clean_joined_text(
            &parsed
                .pages
                .iter()
                .map(|page| page.markdown.as_deref().unwrap_or(&page.text))
                .collect::<Vec<_>>()
                .join("\n\n"),
        );
    }
    if !has_usable_pdf_text(&text) {
        return Err(MaterialParseError::ParseFailed(format!(
            "Codex PDF Skill returned too little readable text; fewer than {MIN_USABLE_PDF_TEXT_CHARS} non-whitespace characters."
        )));
    }

    let pages = normalize_codex_pages(&parsed, &text);
    let mut layout_blocks = normalize_codex_blocks(&parsed, &pages);
    if layout_blocks.is_empty() {
        layout_blocks = pages
            .iter()
            .enumerate()
            .map(|(index, page)| MaterialLayoutBlock {
                id: format!("p{}-b1", page.page_number),
                page_number: page.page_number,
                order: index + 1,
                block_type: "paragraph".to_string(),
                text: page.text.clone(),
                markdown: None,
                source_path: Some(format!("pages/page-{:03}.md", page.page_number)),
                bbox: None,
            })
            .collect();
    }
    let markdown_files = ensure_codex_page_markdown_files(workspace_dir, &pages)?;
    let mut content_json_files = vec![result_path.to_string_lossy().to_string()];
    let report_path = workspace_dir.join(PDF_SKILL_REPORT_FILE);
    if report_path.exists() {
        content_json_files.push(report_path.to_string_lossy().to_string());
    }
    if !parsed.warnings.is_empty() {
        let _ = fs::write(
            workspace_dir.join("logs").join("pdf-skill-warnings.log"),
            parsed.warnings.join("\n"),
        );
    }

    Ok(PdfParseResult {
        text,
        output_dir: workspace_dir.to_string_lossy().to_string(),
        markdown_files,
        content_json_files,
        layout_blocks,
        pages,
    })
}

fn parse_pdf_with_mineru(
    file_name: &str,
    file_bytes: &[u8],
    app: Option<&tauri::AppHandle>,
    run_id: Option<String>,
) -> MaterialParseResult<PdfParseResult> {
    let run_id = normalize_parse_run_id(run_id);
    let result = parse_pdf_with_mineru_inner(file_name, file_bytes, app, &run_id);
    if let Err(error) = &result {
        emit_mineru_progress(
            app,
            &run_id,
            "failed",
            "failed",
            &truncate_log(&error.to_string()),
            Some(100.0),
            None,
            None,
        );
    }
    result
}

fn parse_pdf_with_mineru_inner(
    file_name: &str,
    file_bytes: &[u8],
    app: Option<&tauri::AppHandle>,
    run_id: &str,
) -> MaterialParseResult<PdfParseResult> {
    let root_dir = std::env::temp_dir().join("gongkao-mineru").join(run_id);
    let input_dir = root_dir.join("input");
    let output_dir = root_dir.join("output");

    emit_mineru_progress(
        app,
        run_id,
        "preparing",
        "running",
        "Preparing local PDF parse workspace.",
        Some(5.0),
        None,
        None,
    );
    fs::create_dir_all(&input_dir).map_err(|error| MaterialParseError::Io(error.to_string()))?;
    fs::create_dir_all(&output_dir).map_err(|error| MaterialParseError::Io(error.to_string()))?;

    let input_path = input_dir.join(normalize_pdf_name(file_name));
    fs::write(&input_path, file_bytes)
        .map_err(|error| MaterialParseError::Io(error.to_string()))?;

    emit_mineru_progress(
        app,
        run_id,
        "preparing",
        "running",
        "Resolving MinerU CLI.",
        Some(10.0),
        None,
        None,
    );
    let mineru_executable = resolve_mineru_executable(app)?;
    let txt_output_dir = output_dir.join("txt");
    fs::create_dir_all(&txt_output_dir)
        .map_err(|error| MaterialParseError::Io(error.to_string()))?;
    let txt_output = run_mineru_cli(
        &mineru_executable,
        &input_path,
        &txt_output_dir,
        "txt",
        app,
        run_id,
    )?;
    if txt_output.status.success() {
        emit_mineru_progress(
            app,
            run_id,
            "reading_output",
            "running",
            "Reading MinerU text extraction output.",
            Some(86.0),
            Some("txt"),
            None,
        );
        if let Ok(result) = build_pdf_parse_result(&txt_output_dir, &txt_output) {
            if !result.text.trim().is_empty() {
                emit_mineru_progress(
                    app,
                    run_id,
                    "completed",
                    "completed",
                    "PDF parse completed.",
                    Some(100.0),
                    Some("txt"),
                    None,
                );
                return Ok(result);
            }
        }
    }

    emit_mineru_progress(
        app,
        run_id,
        "ocr_fallback",
        "running",
        "Text extraction returned no readable text; switching to OCR.",
        Some(55.0),
        Some("ocr"),
        None,
    );
    let ocr_output_dir = output_dir.join("ocr");
    fs::create_dir_all(&ocr_output_dir)
        .map_err(|error| MaterialParseError::Io(error.to_string()))?;
    let output = run_mineru_cli(
        &mineru_executable,
        &input_path,
        &ocr_output_dir,
        "ocr",
        app,
        run_id,
    )?;
    if !output.status.success() {
        return Err(MaterialParseError::RuntimeFailed(format_process_output(
            &output,
        )));
    }

    emit_mineru_progress(
        app,
        run_id,
        "reading_output",
        "running",
        "Reading MinerU OCR output.",
        Some(88.0),
        Some("ocr"),
        None,
    );
    let result = build_pdf_parse_result(&ocr_output_dir, &output)?;
    emit_mineru_progress(
        app,
        run_id,
        "completed",
        "completed",
        "PDF parse completed.",
        Some(100.0),
        Some("ocr"),
        None,
    );
    Ok(result)
}

fn build_pdf_parse_result(
    output_dir: &Path,
    output: &Output,
) -> MaterialParseResult<PdfParseResult> {
    let markdown_files = collect_markdown_files(output_dir)
        .map_err(|error| MaterialParseError::Io(error.to_string()))?;
    if markdown_files.is_empty() {
        return Err(MaterialParseError::ParseFailed(format_process_output(
            &output,
        )));
    }

    let text = read_markdown_files(&markdown_files)?;
    let content_json_files = collect_content_json_files(&output_dir)
        .map_err(|error| MaterialParseError::Io(error.to_string()))?;
    let mut layout_blocks = read_layout_blocks_from_json_files(&content_json_files)?;
    if layout_blocks.is_empty() {
        layout_blocks = infer_layout_blocks_from_markdown_files(&markdown_files)?;
    }
    let pages = build_pages_from_blocks(&layout_blocks);

    Ok(PdfParseResult {
        text: text.trim().to_string(),
        output_dir: output_dir.to_string_lossy().to_string(),
        markdown_files: markdown_files
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
        content_json_files: content_json_files
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
        layout_blocks,
        pages,
    })
}

fn run_mineru_cli(
    mineru_executable: &Path,
    input_path: &Path,
    output_dir: &Path,
    method: &str,
    app: Option<&tauri::AppHandle>,
    run_id: &str,
) -> MaterialParseResult<Output> {
    let start_stage = if method == "txt" {
        "txt_extract"
    } else {
        "parsing"
    };
    emit_mineru_progress(
        app,
        run_id,
        start_stage,
        "running",
        &format!("Starting MinerU {method} parse."),
        Some(if method == "txt" { 20.0 } else { 62.0 }),
        Some(method),
        None,
    );

    let mut command = Command::new(mineru_executable);
    command
        .args(mineru_parse_args(input_path, output_dir, method))
        .current_dir(output_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command.spawn().map_err(|error| {
        MaterialParseError::RuntimeFailed(format!(
            "Failed to start MinerU CLI. Install the local PDF parser first, or make sure `mineru` is available on PATH: {error}"
        ))
    })?;

    let (sender, receiver) = mpsc::channel::<ProcessLine>();
    let stdout_handle = child
        .stdout
        .take()
        .map(|stdout| spawn_process_log_reader(stdout, "stdout", sender.clone()));
    let stderr_handle = child
        .stderr
        .take()
        .map(|stderr| spawn_process_log_reader(stderr, "stderr", sender.clone()));
    drop(sender);

    let status = loop {
        drain_mineru_process_lines(&receiver, app, run_id, method);
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(120)),
            Err(error) => {
                return Err(MaterialParseError::RuntimeFailed(format!(
                    "Failed while waiting for MinerU CLI: {error}"
                )))
            }
        }
    };

    let stdout = join_process_log_reader(stdout_handle);
    let stderr = join_process_log_reader(stderr_handle);
    drain_mineru_process_lines(&receiver, app, run_id, method);

    let finish_stage = if status.success() {
        "writing_output"
    } else {
        "failed"
    };
    let finish_status = if status.success() {
        "running"
    } else {
        "failed"
    };
    let finish_message = if status.success() {
        format!("MinerU {method} parse finished; collecting output files.")
    } else {
        format!("MinerU {method} parse failed.")
    };
    emit_mineru_progress(
        app,
        run_id,
        finish_stage,
        finish_status,
        &finish_message,
        Some(if status.success() { 82.0 } else { 100.0 }),
        Some(method),
        None,
    );

    Ok(Output {
        status,
        stdout,
        stderr,
    })
}

fn spawn_process_log_reader<R>(
    reader: R,
    stream: &'static str,
    sender: mpsc::Sender<ProcessLine>,
) -> thread::JoinHandle<Vec<u8>>
where
    R: io::Read + Send + 'static,
{
    thread::spawn(move || {
        let mut output = Vec::new();
        let mut buffered = BufReader::new(reader);
        loop {
            let mut line = Vec::new();
            match buffered.read_until(b'\n', &mut line) {
                Ok(0) => break,
                Ok(_) => {
                    output.extend_from_slice(&line);
                    let text = String::from_utf8_lossy(&line)
                        .trim_end_matches(|ch| ch == '\r' || ch == '\n')
                        .trim()
                        .to_string();
                    if !text.is_empty() {
                        let _ = sender.send(ProcessLine { stream, line: text });
                    }
                }
                Err(error) => {
                    let _ = sender.send(ProcessLine {
                        stream,
                        line: format!("Failed to read {stream}: {error}"),
                    });
                    break;
                }
            }
        }
        output
    })
}

fn join_process_log_reader(handle: Option<thread::JoinHandle<Vec<u8>>>) -> Vec<u8> {
    handle
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default()
}

fn drain_mineru_process_lines(
    receiver: &mpsc::Receiver<ProcessLine>,
    app: Option<&tauri::AppHandle>,
    run_id: &str,
    method: &str,
) {
    for line in receiver.try_iter() {
        let log_line = if line.stream == "stderr" {
            format!("[stderr] {}", line.line)
        } else {
            line.line
        };
        emit_mineru_log_progress(app, run_id, method, &log_line);
    }
}

fn emit_mineru_log_progress(
    app: Option<&tauri::AppHandle>,
    run_id: &str,
    method: &str,
    log_line: &str,
) {
    let (stage, message, percentage) = classify_mineru_log_line(log_line, method);
    emit_mineru_progress(
        app,
        run_id,
        stage,
        "running",
        message,
        percentage,
        Some(method),
        Some(log_line),
    );
}

fn classify_mineru_log_line(
    log_line: &str,
    method: &str,
) -> (&'static str, &'static str, Option<f32>) {
    let lower = log_line.to_ascii_lowercase();
    if lower.contains("download")
        || lower.contains("modelscope")
        || lower.contains("huggingface")
        || lower.contains("pdf-extract-kit")
    {
        return (
            "model_download",
            "Downloading MinerU model files. First run can take several minutes.",
            Some(35.0),
        );
    }
    if lower.contains("docanalysis")
        || lower.contains("init model")
        || lower.contains("init_models")
        || lower.contains("initializ")
        || lower.contains("loading model")
    {
        return (
            "model_init",
            "Initializing MinerU document analysis models.",
            Some(45.0),
        );
    }
    if lower.contains("ocr")
        || lower.contains("layout")
        || lower.contains("predict")
        || lower.contains("infer")
        || lower.contains("processing")
        || lower.contains("page")
        || lower.contains('%')
    {
        return (
            "parsing",
            "MinerU is analyzing PDF pages.",
            Some(if method == "txt" { 52.0 } else { 70.0 }),
        );
    }
    if lower.contains("output")
        || lower.contains("write")
        || lower.contains("dump")
        || lower.contains(".md")
        || lower.contains(".json")
    {
        return (
            "writing_output",
            "MinerU is writing parsed files.",
            Some(80.0),
        );
    }
    (
        if method == "txt" {
            "txt_extract"
        } else {
            "parsing"
        },
        "MinerU is running.",
        Some(if method == "txt" { 28.0 } else { 64.0 }),
    )
}

fn emit_mineru_progress(
    app: Option<&tauri::AppHandle>,
    run_id: &str,
    stage: &str,
    status: &str,
    message: &str,
    percentage: Option<f32>,
    method: Option<&str>,
    log_line: Option<&str>,
) {
    if let Some(app) = app {
        let _ = app.emit(
            MINERU_PARSE_PROGRESS_EVENT,
            MineruParseProgressPayload {
                run_id: run_id.to_string(),
                stage: stage.to_string(),
                status: status.to_string(),
                message: message.to_string(),
                percentage,
                method: method.map(str::to_string),
                log_line: log_line.map(|line| truncate_log(line)),
            },
        );
    }
}

fn normalize_parse_run_id(run_id: Option<String>) -> String {
    let raw = run_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let normalized = raw
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
        .take(96)
        .collect::<String>();
    if normalized.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        normalized
    }
}

fn pdf_skill_runtime_status(app: &tauri::AppHandle) -> MaterialParseResult<PdfSkillRuntimeStatus> {
    let codex_program = codex_program();
    let codex_probe = probe_command_text(Path::new(&codex_program), &["--version"]);
    let pdf_skill_path = default_pdf_skill_path();
    let mineru_ocr_skill_path = default_mineru_ocr_skill_path();
    let python = first_available_python();
    let python_available = python.is_some();
    let pdfplumber_available = python
        .as_ref()
        .is_some_and(|program| python_import_available(program, "pdfplumber"));
    let pypdf_available = python
        .as_ref()
        .is_some_and(|program| python_import_available(program, "pypdf"));
    let poppler_available = command_starts(Path::new("pdftoppm"), &["-h"]);
    let codex_available = codex_probe.is_some();
    let pdf_skill_available = pdf_skill_path.is_file();
    let mineru_ocr_skill_available = mineru_ocr_skill_path.is_file();
    let mineru_ocr_token_available = std::env::var("MINERU_API_TOKEN")
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let ready = codex_available && (pdf_skill_available || mineru_ocr_skill_available);
    let message = if ready && pdf_skill_available && mineru_ocr_skill_available {
        "Codex PDF Skill parser is ready. MinerU OCR Skill fallback is available.".to_string()
    } else if ready && pdf_skill_available {
        format!(
            "Codex PDF Skill parser is ready. MinerU OCR fallback is missing: {}.",
            mineru_ocr_skill_path.display()
        )
    } else if ready {
        "Primary PDF skill is missing; MinerU OCR Skill fallback is available.".to_string()
    } else if !codex_available {
        "Codex CLI is not available. Install and log in to Codex CLI before using the PDF Skill parser.".to_string()
    } else {
        format!(
            "PDF parser skills are missing. Primary: {}. Fallback: {}.",
            pdf_skill_path.display(),
            mineru_ocr_skill_path.display()
        )
    };

    let runtime_dir = app_pdf_skill_runtime_dir(app)?;
    fs::create_dir_all(&runtime_dir).map_err(|error| MaterialParseError::Io(error.to_string()))?;

    Ok(PdfSkillRuntimeStatus {
        ready,
        codex_available,
        codex_path: codex_available.then_some(codex_program),
        codex_version: codex_probe,
        pdf_skill_available,
        pdf_skill_path: pdf_skill_path.to_string_lossy().to_string(),
        mineru_ocr_skill_available,
        mineru_ocr_skill_path: mineru_ocr_skill_path.to_string_lossy().to_string(),
        mineru_ocr_token_available,
        python_available,
        pdfplumber_available,
        pypdf_available,
        poppler_available,
        runtime_dir: runtime_dir.to_string_lossy().to_string(),
        message,
    })
}

fn pdf_skill_run_workspace_dir(
    app: &tauri::AppHandle,
    run_id: &str,
) -> MaterialParseResult<PathBuf> {
    app_pdf_skill_runtime_dir(app).map(|dir| dir.join("runs").join(run_id))
}

fn app_pdf_skill_runtime_dir(app: &tauri::AppHandle) -> MaterialParseResult<PathBuf> {
    app.path()
        .app_local_data_dir()
        .map(|dir| dir.join("pdf-skill-runtime"))
        .map_err(|error| MaterialParseError::Io(error.to_string()))
}

fn default_pdf_skill_path() -> PathBuf {
    if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        return PathBuf::from(home)
            .join(".codex")
            .join("skills")
            .join("pdf")
            .join("SKILL.md");
    }
    PathBuf::from(".codex")
        .join("skills")
        .join("pdf")
        .join("SKILL.md")
}

fn default_mineru_ocr_skill_path() -> PathBuf {
    if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        return PathBuf::from(home)
            .join(".codex")
            .join("skills")
            .join("mineru-ocr")
            .join("SKILL.md");
    }
    PathBuf::from(".codex")
        .join("skills")
        .join("mineru-ocr")
        .join("SKILL.md")
}

fn copy_skill_snapshot(skill_path: &Path, target_dir: &Path) -> MaterialParseResult<()> {
    fs::create_dir_all(target_dir).map_err(|error| MaterialParseError::Io(error.to_string()))?;
    fs::copy(skill_path, target_dir.join("SKILL.md"))
        .map_err(|error| MaterialParseError::Io(error.to_string()))?;

    for child in ["scripts", "references", "agents"] {
        let source = skill_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(child);
        if source.is_dir() {
            copy_dir_recursive(&source, &target_dir.join(child))?;
        }
    }
    Ok(())
}

fn copy_dir_recursive(source: &Path, target: &Path) -> MaterialParseResult<()> {
    fs::create_dir_all(target).map_err(|error| MaterialParseError::Io(error.to_string()))?;
    for entry in fs::read_dir(source).map_err(|error| MaterialParseError::Io(error.to_string()))? {
        let entry = entry.map_err(|error| MaterialParseError::Io(error.to_string()))?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if source_path.is_dir() {
            copy_dir_recursive(&source_path, &target_path)?;
        } else if source_path.is_file() {
            fs::copy(&source_path, &target_path)
                .map_err(|error| MaterialParseError::Io(error.to_string()))?;
        }
    }
    Ok(())
}

fn cleanup_pdf_skill_output_files(workspace_dir: &Path) {
    for file in [
        PDF_SKILL_RESULT_FILE,
        PDF_SKILL_REPORT_FILE,
        "pdf-parse-result.invalid.json",
    ] {
        let _ = fs::remove_file(workspace_dir.join(file));
    }
}

fn codex_program() -> String {
    if let Ok(value) = std::env::var("CODEX_BIN") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            let candidate = PathBuf::from(appdata).join("npm").join("codex.cmd");
            if candidate.is_file() {
                return candidate.to_string_lossy().to_string();
            }
        }
        "codex.cmd".to_string()
    }
    #[cfg(not(target_os = "windows"))]
    {
        "codex".to_string()
    }
}

fn codex_pdf_skill_args(workspace_dir: &Path) -> Vec<String> {
    let mut args = vec![
        "exec".to_string(),
        "--json".to_string(),
        "--skip-git-repo-check".to_string(),
    ];
    #[cfg(target_os = "windows")]
    {
        args.extend(["--sandbox".to_string(), "danger-full-access".to_string()]);
    }
    #[cfg(not(target_os = "windows"))]
    {
        args.extend([
            "--sandbox".to_string(),
            "workspace-write".to_string(),
            "-c".to_string(),
            "sandbox_workspace_write.network_access=true".to_string(),
        ]);
    }
    args.extend([
        "-C".to_string(),
        workspace_dir.to_string_lossy().to_string(),
    ]);
    args
}

fn build_codex_pdf_skill_prompt(
    workspace_dir: &Path,
    input_path: &Path,
    skill_path: &Path,
    original_name: &str,
    skill: &CodexSkillRuntime,
    fallback_reason: Option<&str>,
) -> String {
    let fallback_note = fallback_reason
        .map(|reason| {
            format!(
                "\n这是 fallback 解析：主 PDF skill 未成功产出有效结果。失败原因：{}\n",
                truncate_log(reason)
            )
        })
        .unwrap_or_default();
    let mineru_note = if skill.parser_id == MINERU_OCR_SKILL_PARSER {
        r#"
当前使用 mineru-ocr skill。请按该 skill 的说明优先使用 MinerU API/脚本处理 OCR-heavy、扫描件、复杂版式 PDF。
如果需要 MINERU_API_TOKEN 但环境变量不存在，必须在 pdf-parse-report.md 写明原因，并尽量使用可用的本地 Python/PDF 工具生成低保真结构化结果；不要编造内容。
"#
    } else {
        ""
    };
    format!(
        r#"你正在为“申论 AI 智能修炼”桌面应用解析 PDF。{fallback_note}

必须使用本地 {skill_name} skill，并先阅读该 skill：
{skill_path}
{mineru_note}

输入 PDF：
{input_path}

工作区：
{workspace_dir}

原始文件名：
{original_name}

任务要求：
1. 按 {skill_name} skill 工作流解析 PDF。
2. 优先使用 pdfplumber 或 pypdf 提取文本。
3. 如果 pdftoppm 可用，渲染前 3 页到 renders/ 做视觉检查。
4. 保留材料、题目、作答要求、参考答案、表格结构。
5. 不要编造 PDF 中不存在的内容。
6. 输出必须统一为简体中文。
7. 必须在工作区根目录写出 pdf-parse-result.json。
8. 必须在工作区根目录写出 pdf-parse-report.md，说明解析质量、警告和失败原因。
9. pages/page-001.md 这类页面 Markdown 可选但推荐写出。

pdf-parse-result.json 必须是 JSON 对象，最低字段：
- schemaVersion: 1
- text: 完整可入库文本，至少 20 个字符
- pages: 数组，每项包含 pageNumber、text，可选 markdown、blockIds
- layoutBlocks: 数组，每项包含 id、pageNumber、order、blockType、text，可选 markdown、sourcePath、bbox
- warnings: 字符串数组

最终回答只简短说明完成情况，不要粘贴大段 PDF 正文。"#,
        fallback_note = fallback_note,
        skill_name = skill.skill_name,
        skill_path = skill_path.display(),
        mineru_note = mineru_note,
        input_path = input_path.display(),
        workspace_dir = workspace_dir.display(),
        original_name = original_name
    )
}

fn drain_pdf_skill_process_lines(
    receiver: &mpsc::Receiver<ProcessLine>,
    app: Option<&tauri::AppHandle>,
    run_id: &str,
    workspace_dir: &Path,
    parser_id: &'static str,
) {
    for line in receiver.try_iter() {
        let raw_line = if line.stream == "stderr" {
            format!("[stderr] {}", line.line)
        } else {
            line.line
        };
        let display_line = codex_pdf_skill_log_message(&raw_line);
        let (stage, message, percentage) = classify_pdf_skill_log_line(&display_line);
        emit_pdf_skill_progress(
            app,
            run_id,
            stage,
            "running",
            message,
            percentage,
            Some(&display_line),
            Some(workspace_dir),
            parser_id,
        );
    }
}

fn codex_pdf_skill_log_message(line: &str) -> String {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return line.to_string();
    };
    value
        .pointer("/message/content")
        .and_then(Value::as_str)
        .or_else(|| {
            value
                .pointer("/message/content/0/text")
                .and_then(Value::as_str)
        })
        .or_else(|| value.get("message").and_then(Value::as_str))
        .or_else(|| value.get("delta").and_then(Value::as_str))
        .or_else(|| value.get("text").and_then(Value::as_str))
        .or_else(|| value.get("result").and_then(Value::as_str))
        .unwrap_or(line)
        .to_string()
}

fn classify_pdf_skill_log_line(log_line: &str) -> (&'static str, &'static str, Option<f32>) {
    let lower = log_line.to_ascii_lowercase();
    if lower.contains("skill") || lower.contains("skill.md") {
        return ("loading_skill", "Loading local PDF skill.", Some(24.0));
    }
    if lower.contains("pdfplumber")
        || lower.contains("pypdf")
        || lower.contains("extract")
        || lower.contains("text")
    {
        return ("extracting_text", "Extracting PDF text.", Some(42.0));
    }
    if lower.contains("pdftoppm")
        || lower.contains("render")
        || lower.contains("png")
        || lower.contains("visual")
    {
        return (
            "rendering_pages",
            "Rendering PDF pages for visual checks.",
            Some(56.0),
        );
    }
    if lower.contains("layout")
        || lower.contains("table")
        || lower.contains("page")
        || lower.contains("block")
    {
        return ("analyzing_layout", "Analyzing PDF layout.", Some(68.0));
    }
    if lower.contains("pdf-parse-result")
        || lower.contains("pdf-parse-report")
        || lower.contains("write")
        || lower.contains(".json")
        || lower.contains(".md")
    {
        return (
            "writing_output",
            "Writing structured PDF parse output.",
            Some(82.0),
        );
    }
    (
        "starting_codex",
        "Codex PDF Skill parser is running.",
        Some(30.0),
    )
}

fn emit_pdf_skill_progress(
    app: Option<&tauri::AppHandle>,
    run_id: &str,
    stage: &str,
    status: &str,
    message: &str,
    percentage: Option<f32>,
    log_line: Option<&str>,
    workspace_path: Option<&Path>,
    parser_id: &'static str,
) {
    if let Some(app) = app {
        let _ = app.emit(
            PDF_SKILL_PARSE_PROGRESS_EVENT,
            PdfSkillParseProgressPayload {
                run_id: run_id.to_string(),
                parser: parser_id.to_string(),
                stage: stage.to_string(),
                status: status.to_string(),
                message: message.to_string(),
                percentage,
                log_line: log_line.map(truncate_log),
                workspace_path: workspace_path.map(|path| path.to_string_lossy().to_string()),
            },
        );
    }
}

fn clean_joined_text(text: &str) -> String {
    let mut output = String::new();
    let mut last_blank = false;
    for line in text.replace("\r\n", "\n").replace('\r', "\n").lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !last_blank && !output.is_empty() {
                output.push('\n');
                output.push('\n');
            }
            last_blank = true;
            continue;
        }
        if !output.is_empty() && !output.ends_with("\n\n") {
            output.push('\n');
        }
        output.push_str(trimmed);
        last_blank = false;
    }
    output.trim().to_string()
}

fn has_usable_pdf_text(text: &str) -> bool {
    text.chars().filter(|ch| !ch.is_whitespace()).count() >= MIN_USABLE_PDF_TEXT_CHARS
}

fn normalize_codex_pages(
    parsed: &CodexPdfSkillResult,
    fallback_text: &str,
) -> Vec<MaterialParsedPage> {
    let mut pages: Vec<MaterialParsedPage> = parsed
        .pages
        .iter()
        .enumerate()
        .map(|(index, page)| {
            let page_number = if page.page_number == 0 {
                index + 1
            } else {
                page.page_number
            };
            let text = clean_joined_text(page.markdown.as_deref().unwrap_or(&page.text));
            MaterialParsedPage {
                page_number,
                text,
                block_ids: page.block_ids.clone(),
            }
        })
        .filter(|page| !page.text.trim().is_empty())
        .collect();
    if pages.is_empty() {
        pages.push(MaterialParsedPage {
            page_number: 1,
            text: fallback_text.to_string(),
            block_ids: Vec::new(),
        });
    }
    pages
}

fn normalize_codex_blocks(
    parsed: &CodexPdfSkillResult,
    pages: &[MaterialParsedPage],
) -> Vec<MaterialLayoutBlock> {
    let mut blocks: Vec<MaterialLayoutBlock> = parsed
        .layout_blocks
        .iter()
        .enumerate()
        .map(|(index, block)| {
            let text = clean_joined_text(&block.text);
            let order = if block.order == 0 {
                index + 1
            } else {
                block.order
            };
            let page_number = if block.page_number == 0 {
                1
            } else {
                block.page_number
            };
            MaterialLayoutBlock {
                id: if block.id.trim().is_empty() {
                    format!("p{page_number}-b{order}")
                } else {
                    block.id.clone()
                },
                page_number,
                order,
                block_type: normalize_block_type(&block.block_type, &text),
                text,
                markdown: block.markdown.clone(),
                source_path: block.source_path.clone(),
                bbox: block.bbox,
            }
        })
        .filter(|block| !block.text.trim().is_empty())
        .collect();
    if blocks.iter().all(|block| block.order == 0) {
        normalize_block_order(&mut blocks);
    }
    if blocks.is_empty() {
        for (index, page) in pages.iter().enumerate() {
            blocks.push(MaterialLayoutBlock {
                id: format!("p{}-b1", page.page_number),
                page_number: page.page_number,
                order: index + 1,
                block_type: "paragraph".to_string(),
                text: page.text.clone(),
                markdown: None,
                source_path: Some(format!("pages/page-{:03}.md", page.page_number)),
                bbox: None,
            });
        }
    }
    blocks
}

fn ensure_codex_page_markdown_files(
    workspace_dir: &Path,
    pages: &[MaterialParsedPage],
) -> MaterialParseResult<Vec<String>> {
    let pages_dir = workspace_dir.join("pages");
    fs::create_dir_all(&pages_dir).map_err(|error| MaterialParseError::Io(error.to_string()))?;
    let mut files = Vec::new();
    for page in pages {
        let path = pages_dir.join(format!("page-{:03}.md", page.page_number));
        if !path.exists() {
            fs::write(&path, &page.text)
                .map_err(|error| MaterialParseError::Io(error.to_string()))?;
        }
        files.push(path.to_string_lossy().to_string());
    }
    Ok(files)
}

fn first_available_python() -> Option<ProgramCall> {
    python_venv_candidates()
        .into_iter()
        .find(|candidate| command_starts(Path::new(&candidate.program), &candidate.args))
}

fn python_import_available(program: &ProgramCall, package: &str) -> bool {
    let mut args = program.args.clone();
    args.extend(["-c".to_string(), format!("import {package}")]);
    command_success(Path::new(&program.program), &args)
}

fn probe_command_text(program: &Path, args: &[&str]) -> Option<String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let text = if stdout.is_empty() { stderr } else { stdout };
    Some(first_non_empty_line(&text).unwrap_or_else(|| "available".to_string()))
}

fn command_success(program: &Path, args: &[String]) -> bool {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    command.output().is_ok_and(|output| output.status.success())
}

fn command_starts(program: &Path, args: &[impl AsRef<OsStr>]) -> bool {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    command.output().is_ok()
}

fn mineru_parse_args(input_path: &Path, output_dir: &Path, method: &str) -> Vec<String> {
    vec![
        "-p".to_string(),
        input_path.to_string_lossy().to_string(),
        "-o".to_string(),
        output_dir.to_string_lossy().to_string(),
        "-b".to_string(),
        "pipeline".to_string(),
        "-m".to_string(),
        method.to_string(),
        "-l".to_string(),
        "ch".to_string(),
        "-d".to_string(),
        "cpu".to_string(),
        "--source".to_string(),
        "modelscope".to_string(),
    ]
}

fn install_mineru_runtime(
    app: &tauri::AppHandle,
    use_china_mirror: bool,
) -> MaterialParseResult<MineruRuntimeInstallResult> {
    let runtime_dir = app_mineru_runtime_dir(app)?;
    fs::create_dir_all(&runtime_dir).map_err(|error| MaterialParseError::Io(error.to_string()))?;
    let venv_dir = managed_venv_dir(&runtime_dir);
    let venv_python = venv_python_path(&venv_dir);
    let mut logs = vec![format!(
        "MinerU runtime directory: {}",
        runtime_dir.display()
    )];

    if !venv_python.exists() {
        create_mineru_venv(&venv_dir, &mut logs)?;
    } else {
        logs.push(format!("Reuse Python venv: {}", venv_dir.display()));
    }

    run_python_installer_step(
        &venv_python,
        &["-m", "pip", "install", "--upgrade", "pip"],
        use_china_mirror,
        "Upgrade pip",
        &mut logs,
    )?;
    run_python_installer_step(
        &venv_python,
        &["-m", "pip", "install", "uv"],
        use_china_mirror,
        "Install uv",
        &mut logs,
    )?;

    let python_arg = venv_python.to_string_lossy().to_string();
    let mut mineru_args = vec![
        "-m".to_string(),
        "uv".to_string(),
        "pip".to_string(),
        "install".to_string(),
        "--python".to_string(),
        python_arg,
        "-U".to_string(),
        MINERU_PACKAGE.to_string(),
    ];
    if use_china_mirror {
        mineru_args.extend(["-i".to_string(), PYPI_CHINA_MIRROR.to_string()]);
    }
    run_logged_command(
        &venv_python,
        &mineru_args,
        Some(&runtime_dir),
        "Install MinerU",
        &mut logs,
    )?;

    let status = mineru_runtime_status(app)?;
    logs.push(status.message.clone());
    Ok(MineruRuntimeInstallResult { status, logs })
}

fn mineru_runtime_status(app: &tauri::AppHandle) -> MaterialParseResult<MineruRuntimeStatus> {
    let runtime_dir = app_mineru_runtime_dir(app)?;
    let install_command = mineru_install_command_summary(&runtime_dir);
    let managed_executable = managed_mineru_executable_path(&runtime_dir);
    if managed_executable.exists() {
        if let Some(version) = probe_mineru_command(&managed_executable) {
            return Ok(MineruRuntimeStatus {
                ready: true,
                source: "managed".to_string(),
                runtime_dir: runtime_dir.to_string_lossy().to_string(),
                executable_path: Some(managed_executable.to_string_lossy().to_string()),
                version: Some(version),
                message: "Managed MinerU runtime is ready.".to_string(),
                install_command,
            });
        }
    }

    let path_executable = PathBuf::from("mineru");
    if let Some(version) = probe_mineru_command(&path_executable) {
        return Ok(MineruRuntimeStatus {
            ready: true,
            source: "path".to_string(),
            runtime_dir: runtime_dir.to_string_lossy().to_string(),
            executable_path: Some("mineru".to_string()),
            version: Some(version),
            message: "System PATH MinerU runtime is ready.".to_string(),
            install_command,
        });
    }

    Ok(MineruRuntimeStatus {
        ready: false,
        source: "missing".to_string(),
        runtime_dir: runtime_dir.to_string_lossy().to_string(),
        executable_path: None,
        version: None,
        message: "MinerU is not installed. Install the local PDF parser before importing scanned or structured PDFs.".to_string(),
        install_command,
    })
}

fn resolve_mineru_executable(app: Option<&tauri::AppHandle>) -> MaterialParseResult<PathBuf> {
    if let Some(app) = app {
        let runtime_dir = app_mineru_runtime_dir(app)?;
        let managed_executable = managed_mineru_executable_path(&runtime_dir);
        if managed_executable.exists() && probe_mineru_command(&managed_executable).is_some() {
            return Ok(managed_executable);
        }
    }

    let path_executable = PathBuf::from("mineru");
    if probe_mineru_command(&path_executable).is_some() {
        return Ok(path_executable);
    }

    Err(MaterialParseError::RuntimeFailed(
        "MinerU is not installed. Use one-click install for the local PDF parser first."
            .to_string(),
    ))
}

fn app_mineru_runtime_dir(app: &tauri::AppHandle) -> MaterialParseResult<PathBuf> {
    app.path()
        .app_local_data_dir()
        .map(|dir| dir.join("mineru-runtime"))
        .map_err(|error| MaterialParseError::Io(error.to_string()))
}

fn managed_venv_dir(runtime_dir: &Path) -> PathBuf {
    runtime_dir.join(".venv")
}

fn managed_mineru_executable_path(runtime_dir: &Path) -> PathBuf {
    let venv_dir = managed_venv_dir(runtime_dir);
    #[cfg(target_os = "windows")]
    {
        venv_dir.join("Scripts").join("mineru.exe")
    }
    #[cfg(not(target_os = "windows"))]
    {
        venv_dir.join("bin").join("mineru")
    }
}

fn venv_python_path(venv_dir: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        venv_dir.join("Scripts").join("python.exe")
    }
    #[cfg(not(target_os = "windows"))]
    {
        venv_dir.join("bin").join("python")
    }
}

fn mineru_install_command_summary(runtime_dir: &Path) -> String {
    let venv_dir = managed_venv_dir(runtime_dir);
    let python = venv_python_path(&venv_dir);
    format!(
        "create venv at {}; then run {} -m uv pip install --python {} -U \"{}\"",
        venv_dir.display(),
        python.display(),
        python.display(),
        MINERU_PACKAGE
    )
}

fn create_mineru_venv(venv_dir: &Path, logs: &mut Vec<String>) -> MaterialParseResult<()> {
    let mut failures = Vec::new();
    for candidate in python_venv_candidates() {
        let mut args = candidate.args.clone();
        args.extend([
            "-m".to_string(),
            "venv".to_string(),
            venv_dir.to_string_lossy().to_string(),
        ]);
        match run_logged_command(
            Path::new(&candidate.program),
            &args,
            venv_dir.parent(),
            "Create Python venv",
            logs,
        ) {
            Ok(()) => return Ok(()),
            Err(error) => failures.push(error.to_string()),
        }
    }
    Err(MaterialParseError::RuntimeFailed(format!(
        "Failed to create Python venv. Install Python 3.10-3.12 first. Attempts: {}",
        failures.join(" | ")
    )))
}

fn python_venv_candidates() -> Vec<ProgramCall> {
    #[cfg(target_os = "windows")]
    {
        vec![
            ProgramCall {
                program: "py".to_string(),
                args: vec!["-3.12".to_string()],
            },
            ProgramCall {
                program: "py".to_string(),
                args: vec!["-3.11".to_string()],
            },
            ProgramCall {
                program: "py".to_string(),
                args: vec!["-3.10".to_string()],
            },
            ProgramCall {
                program: "python".to_string(),
                args: Vec::new(),
            },
        ]
    }
    #[cfg(not(target_os = "windows"))]
    {
        vec![
            ProgramCall {
                program: "python3.12".to_string(),
                args: Vec::new(),
            },
            ProgramCall {
                program: "python3.11".to_string(),
                args: Vec::new(),
            },
            ProgramCall {
                program: "python3.10".to_string(),
                args: Vec::new(),
            },
            ProgramCall {
                program: "python3".to_string(),
                args: Vec::new(),
            },
        ]
    }
}

fn run_python_installer_step(
    python: &Path,
    args: &[&str],
    use_china_mirror: bool,
    label: &str,
    logs: &mut Vec<String>,
) -> MaterialParseResult<()> {
    let mut owned_args = args
        .iter()
        .map(|arg| (*arg).to_string())
        .collect::<Vec<_>>();
    if use_china_mirror {
        owned_args.extend(["-i".to_string(), PYPI_CHINA_MIRROR.to_string()]);
    }
    run_logged_command(python, &owned_args, python.parent(), label, logs)
}

fn run_logged_command(
    program: &Path,
    args: &[String],
    current_dir: Option<&Path>,
    label: &str,
    logs: &mut Vec<String>,
) -> MaterialParseResult<()> {
    logs.push(format!("{label}: {} {}", program.display(), args.join(" ")));
    let mut command = Command::new(program);
    command
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    if let Some(current_dir) = current_dir {
        if current_dir.exists() {
            command.current_dir(current_dir);
        }
    }
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command.output().map_err(|error| {
        MaterialParseError::RuntimeFailed(format!("{label} failed to start: {error}"))
    })?;
    append_process_log(label, &output, logs);
    if output.status.success() {
        Ok(())
    } else {
        Err(MaterialParseError::RuntimeFailed(format!(
            "{label} failed. {}",
            format_process_output(&output)
        )))
    }
}

fn append_process_log(label: &str, output: &Output, logs: &mut Vec<String>) {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    logs.push(format!("{label} status: {}", output.status));
    if !stdout.is_empty() {
        logs.push(format!("{label} stdout: {}", truncate_log(&stdout)));
    }
    if !stderr.is_empty() {
        logs.push(format!("{label} stderr: {}", truncate_log(&stderr)));
    }
}

fn truncate_log(text: &str) -> String {
    const MAX_LEN: usize = 4000;
    if text.chars().count() <= MAX_LEN {
        return text.to_string();
    }
    let mut truncated = text.chars().take(MAX_LEN).collect::<String>();
    truncated.push_str("...");
    truncated
}

fn probe_mineru_command(executable: &Path) -> Option<String> {
    run_probe_command(executable, "--version").or_else(|| run_probe_command(executable, "--help"))
}

fn run_probe_command(executable: &Path, arg: &str) -> Option<String> {
    let mut command = Command::new(executable);
    command
        .arg(arg)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let text = if stdout.is_empty() { stderr } else { stdout };
    Some(first_non_empty_line(&text).unwrap_or_else(|| "MinerU available".to_string()))
}

fn first_non_empty_line(text: &str) -> Option<String> {
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(160).collect())
}

fn normalize_pdf_name(file_name: &str) -> String {
    let candidate = Path::new(file_name)
        .file_name()
        .and_then(OsStr::to_str)
        .map(|name| name.trim())
        .filter(|name| !name.is_empty())
        .unwrap_or("input.pdf");
    if candidate.to_ascii_lowercase().ends_with(".pdf") {
        candidate.to_string()
    } else {
        format!("{candidate}.pdf")
    }
}

fn collect_markdown_files(dir: &Path) -> io::Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    collect_markdown_files_inner(dir, &mut files)?;
    files.sort_by(|left, right| markdown_sort_key(left).cmp(&markdown_sort_key(right)));
    Ok(files)
}

fn collect_markdown_files_inner(dir: &Path, files: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_markdown_files_inner(&path, files)?;
        } else if is_markdown_file(&path) {
            files.push(path);
        }
    }
    Ok(())
}

fn collect_content_json_files(dir: &Path) -> io::Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    collect_content_json_files_inner(dir, &mut files)?;
    files.sort_by(|left, right| left.to_string_lossy().cmp(&right.to_string_lossy()));
    Ok(files)
}

fn collect_content_json_files_inner(dir: &Path, files: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_content_json_files_inner(&path, files)?;
        } else if is_content_json_file(&path) {
            files.push(path);
        }
    }
    Ok(())
}

fn is_content_json_file(path: &Path) -> bool {
    let is_json = path
        .extension()
        .and_then(OsStr::to_str)
        .map(|ext| ext.eq_ignore_ascii_case("json"))
        .unwrap_or(false);
    if !is_json {
        return false;
    }
    let name = path
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    name.contains("content") || name.contains("list")
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "md" | "markdown"))
        .unwrap_or(false)
}

fn markdown_sort_key(path: &Path) -> (u8, String) {
    let name = path
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    let priority = if name == "full.md" {
        0
    } else if name.ends_with("full.md") {
        1
    } else {
        2
    };
    (priority, path.to_string_lossy().to_string())
}

fn read_markdown_files(paths: &[PathBuf]) -> MaterialParseResult<String> {
    let mut sections = Vec::new();
    for path in paths {
        let raw = fs::read_to_string(path)
            .map_err(|error| MaterialParseError::Io(format!("{}: {error}", path.display())))?;
        let cleaned = raw.replace("\r\n", "\n").trim().to_string();
        if !cleaned.is_empty() {
            sections.push(cleaned);
        }
    }
    Ok(sections.join("\n\n"))
}

fn read_layout_blocks_from_json_files(
    paths: &[PathBuf],
) -> MaterialParseResult<Vec<MaterialLayoutBlock>> {
    let mut blocks = Vec::new();
    for path in paths {
        let raw = fs::read_to_string(path)
            .map_err(|error| MaterialParseError::Io(format!("{}: {error}", path.display())))?;
        let Ok(value) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        collect_json_blocks(&value, path, None, &mut blocks);
    }
    normalize_block_order(&mut blocks);
    Ok(blocks)
}

fn collect_json_blocks(
    value: &Value,
    source_path: &Path,
    inherited_page_number: Option<usize>,
    blocks: &mut Vec<MaterialLayoutBlock>,
) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_json_blocks(item, source_path, inherited_page_number, blocks);
            }
        }
        Value::Object(object) => {
            let page_number = json_page_number(object).or(inherited_page_number);
            for key in [
                "pages",
                "content_list",
                "content",
                "blocks",
                "items",
                "paragraphs",
            ] {
                if let Some(child) = object.get(key) {
                    collect_json_blocks(child, source_path, page_number, blocks);
                }
            }
            if json_object_has_block_content(object) {
                push_json_block(object, source_path, page_number.unwrap_or(1), blocks);
            }
        }
        _ => {}
    }
}

fn json_object_has_block_content(object: &serde_json::Map<String, Value>) -> bool {
    [
        "text",
        "content",
        "markdown",
        "table_body",
        "latex",
        "image_caption",
        "table_caption",
    ]
    .iter()
    .any(|key| object.get(*key).is_some())
}

fn push_json_block(
    object: &serde_json::Map<String, Value>,
    source_path: &Path,
    page_number: usize,
    blocks: &mut Vec<MaterialLayoutBlock>,
) {
    let text = json_text(object).trim().to_string();
    if text.is_empty() {
        return;
    }

    let raw_type = object.get("type").and_then(Value::as_str).unwrap_or("");
    let markdown = json_markdown(object);
    let order = blocks.len() + 1;
    blocks.push(MaterialLayoutBlock {
        id: format!("json-{order}"),
        page_number,
        order,
        block_type: normalize_block_type(raw_type, &text),
        text,
        markdown,
        source_path: Some(source_path.to_string_lossy().to_string()),
        bbox: json_bbox(object),
    });
}

fn json_text(object: &serde_json::Map<String, Value>) -> String {
    for key in ["text", "content", "markdown", "table_body", "latex"] {
        if let Some(text) = object.get(key).and_then(value_to_text) {
            if !text.trim().is_empty() {
                return text;
            }
        }
    }
    for key in ["image_caption", "table_caption", "caption"] {
        if let Some(text) = object.get(key).and_then(value_to_text) {
            if !text.trim().is_empty() {
                return text;
            }
        }
    }
    String::new()
}

fn json_markdown(object: &serde_json::Map<String, Value>) -> Option<String> {
    for key in ["markdown", "table_body", "latex"] {
        if let Some(text) = object.get(key).and_then(value_to_text) {
            let trimmed = text.trim().to_string();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }
    None
}

fn value_to_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Array(items) => {
            let parts: Vec<String> = items.iter().filter_map(value_to_text).collect();
            if parts.is_empty() {
                None
            } else {
                Some(parts.join("\n"))
            }
        }
        Value::Object(object) => object
            .get("text")
            .or_else(|| object.get("content"))
            .and_then(value_to_text),
        _ => None,
    }
}

fn json_page_number(object: &serde_json::Map<String, Value>) -> Option<usize> {
    if let Some(page_idx) = object.get("page_idx").and_then(value_to_usize) {
        return Some(page_idx + 1);
    }
    for key in ["page_number", "pageNumber", "page", "page_no"] {
        if let Some(value) = object.get(key).and_then(value_to_usize) {
            return Some(value.max(1));
        }
    }
    None
}

fn value_to_usize(value: &Value) -> Option<usize> {
    value
        .as_u64()
        .and_then(|number| usize::try_from(number).ok())
        .or_else(|| {
            value
                .as_i64()
                .and_then(|number| usize::try_from(number).ok())
        })
}

fn json_bbox(object: &serde_json::Map<String, Value>) -> Option<[f64; 4]> {
    for key in ["bbox", "box", "poly", "polygon"] {
        if let Some(value) = object.get(key) {
            let mut numbers = Vec::new();
            flatten_numbers(value, &mut numbers);
            if numbers.len() == 4 {
                return Some([numbers[0], numbers[1], numbers[2], numbers[3]]);
            }
            if numbers.len() >= 8 {
                let xs: Vec<f64> = numbers.iter().step_by(2).copied().collect();
                let ys: Vec<f64> = numbers.iter().skip(1).step_by(2).copied().collect();
                let min_x = xs.iter().copied().fold(f64::INFINITY, f64::min);
                let min_y = ys.iter().copied().fold(f64::INFINITY, f64::min);
                let max_x = xs.iter().copied().fold(f64::NEG_INFINITY, f64::max);
                let max_y = ys.iter().copied().fold(f64::NEG_INFINITY, f64::max);
                if min_x.is_finite() && min_y.is_finite() && max_x.is_finite() && max_y.is_finite()
                {
                    return Some([min_x, min_y, max_x, max_y]);
                }
            }
        }
    }
    None
}

fn flatten_numbers(value: &Value, output: &mut Vec<f64>) {
    match value {
        Value::Number(number) => {
            if let Some(value) = number.as_f64() {
                output.push(value);
            }
        }
        Value::Array(items) => {
            for item in items {
                flatten_numbers(item, output);
            }
        }
        _ => {}
    }
}

fn infer_layout_blocks_from_markdown_files(
    paths: &[PathBuf],
) -> MaterialParseResult<Vec<MaterialLayoutBlock>> {
    let mut blocks = Vec::new();
    for path in paths {
        let raw = fs::read_to_string(path)
            .map_err(|error| MaterialParseError::Io(format!("{}: {error}", path.display())))?;
        infer_layout_blocks_from_markdown(path, &raw, &mut blocks);
    }
    normalize_block_order(&mut blocks);
    Ok(blocks)
}

fn infer_layout_blocks_from_markdown(
    path: &Path,
    markdown: &str,
    blocks: &mut Vec<MaterialLayoutBlock>,
) {
    let page_number = page_number_from_path(path);
    let mut pending_kind = String::new();
    let mut pending_lines: Vec<String> = Vec::new();

    for line in markdown.replace("\r\n", "\n").lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            flush_markdown_block(
                path,
                page_number,
                &mut pending_kind,
                &mut pending_lines,
                blocks,
            );
            continue;
        }

        if is_markdown_heading(trimmed) || is_exam_heading(trimmed) {
            flush_markdown_block(
                path,
                page_number,
                &mut pending_kind,
                &mut pending_lines,
                blocks,
            );
            let heading = trimmed.trim_start_matches('#').trim().to_string();
            push_markdown_block(path, page_number, "heading", vec![heading], blocks);
            continue;
        }

        let next_kind = if is_markdown_table_line(trimmed) {
            "table"
        } else if is_markdown_list_line(trimmed) {
            "list"
        } else {
            "paragraph"
        };
        if pending_kind != next_kind && !pending_lines.is_empty() {
            flush_markdown_block(
                path,
                page_number,
                &mut pending_kind,
                &mut pending_lines,
                blocks,
            );
        }
        pending_kind = next_kind.to_string();
        pending_lines.push(trimmed.to_string());
    }
    flush_markdown_block(
        path,
        page_number,
        &mut pending_kind,
        &mut pending_lines,
        blocks,
    );
}

fn flush_markdown_block(
    path: &Path,
    page_number: usize,
    pending_kind: &mut String,
    pending_lines: &mut Vec<String>,
    blocks: &mut Vec<MaterialLayoutBlock>,
) {
    if pending_lines.is_empty() {
        return;
    }
    let kind = if pending_kind.is_empty() {
        "paragraph"
    } else {
        pending_kind.as_str()
    };
    let lines = std::mem::take(pending_lines);
    push_markdown_block(path, page_number, kind, lines, blocks);
    pending_kind.clear();
}

fn push_markdown_block(
    path: &Path,
    page_number: usize,
    block_type: &str,
    lines: Vec<String>,
    blocks: &mut Vec<MaterialLayoutBlock>,
) {
    let text = lines.join("\n").trim().to_string();
    if text.is_empty() {
        return;
    }
    let order = blocks.len() + 1;
    blocks.push(MaterialLayoutBlock {
        id: format!("md-{page_number}-{order}"),
        page_number,
        order,
        block_type: block_type.to_string(),
        text: if block_type == "heading" {
            text.trim_start_matches('#').trim().to_string()
        } else {
            text.clone()
        },
        markdown: if matches!(block_type, "table" | "list") {
            Some(text)
        } else {
            None
        },
        source_path: Some(path.to_string_lossy().to_string()),
        bbox: None,
    });
}

fn normalize_block_order(blocks: &mut [MaterialLayoutBlock]) {
    blocks.sort_by(|left, right| {
        left.page_number
            .cmp(&right.page_number)
            .then_with(|| left.order.cmp(&right.order))
    });
    for (index, block) in blocks.iter_mut().enumerate() {
        block.order = index + 1;
    }
}

fn build_pages_from_blocks(blocks: &[MaterialLayoutBlock]) -> Vec<MaterialParsedPage> {
    let mut pages: BTreeMap<usize, (Vec<String>, Vec<String>)> = BTreeMap::new();
    for block in blocks {
        let entry = pages
            .entry(block.page_number)
            .or_insert_with(|| (Vec::new(), Vec::new()));
        entry.0.push(block.text.clone());
        entry.1.push(block.id.clone());
    }
    pages
        .into_iter()
        .map(|(page_number, (texts, block_ids))| MaterialParsedPage {
            page_number,
            text: texts.join("\n\n").trim().to_string(),
            block_ids,
        })
        .filter(|page| !page.text.is_empty())
        .collect()
}

fn normalize_block_type(raw_type: &str, text: &str) -> String {
    let normalized = raw_type.to_ascii_lowercase();
    match normalized.as_str() {
        "title" | "heading" => "heading".to_string(),
        "table" => "table".to_string(),
        "image" => "image".to_string(),
        "equation" | "formula" | "inline_equation" | "interline_equation" => "formula".to_string(),
        "list" => "list".to_string(),
        "text" | "paragraph" => {
            if is_markdown_list_line(text.trim()) {
                "list".to_string()
            } else {
                "paragraph".to_string()
            }
        }
        _ => {
            if is_markdown_table_line(text.trim()) {
                "table".to_string()
            } else if is_exam_heading(text.trim()) {
                "heading".to_string()
            } else {
                "paragraph".to_string()
            }
        }
    }
}

fn page_number_from_path(path: &Path) -> usize {
    let stem = path.file_stem().and_then(OsStr::to_str).unwrap_or("");
    let mut last_small_number = None;
    for part in stem.split(|ch: char| !ch.is_ascii_digit()) {
        if let Ok(value) = part.parse::<usize>() {
            if (1..=500).contains(&value) {
                last_small_number = Some(value);
            }
        }
    }
    last_small_number.unwrap_or(1)
}

fn is_markdown_heading(text: &str) -> bool {
    text.starts_with('#')
}

fn is_exam_heading(text: &str) -> bool {
    let cleaned = text.trim().trim_start_matches('#').trim();
    [
        "材料",
        "问题",
        "题目",
        "作答要求",
        "参考答案",
        "答案",
        "评分要点",
        "采分点",
        "得分点",
    ]
    .iter()
    .any(|prefix| cleaned.starts_with(prefix))
}

fn is_markdown_table_line(text: &str) -> bool {
    let trimmed = text.trim();
    trimmed.starts_with('|') && trimmed.ends_with('|') && trimmed.matches('|').count() >= 2
}

fn is_markdown_list_line(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.starts_with("- ") || trimmed.starts_with("* ") || trimmed.starts_with("+ ") {
        return true;
    }
    let mut chars = trimmed.chars().peekable();
    let mut has_digit = false;
    while matches!(chars.peek(), Some(ch) if ch.is_ascii_digit()) {
        has_digit = true;
        chars.next();
    }
    if !has_digit {
        return false;
    }
    matches!(
        chars.next(),
        Some('.') | Some('、') | Some(')') | Some('）')
    )
}

fn format_process_output(output: &Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let mut parts = vec![format!("MinerU exited with status {}.", output.status)];
    if !stdout.is_empty() {
        parts.push(format!("stdout: {stdout}"));
    }
    if !stderr.is_empty() {
        parts.push(format!("stderr: {stderr}"));
    }
    parts.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        std::env::temp_dir().join(format!("gongkao-mineru-test-{}", Uuid::new_v4()))
    }

    #[test]
    fn normalizes_pdf_name() {
        assert_eq!(normalize_pdf_name("report.pdf"), "report.pdf");
        assert_eq!(normalize_pdf_name("nested/path/report"), "report.pdf");
    }

    #[test]
    fn builds_managed_mineru_runtime_paths() {
        let root = PathBuf::from("C:/Users/test/AppData/Local/Gongkao/mineru-runtime");
        let venv = managed_venv_dir(&root);
        assert_eq!(venv, root.join(".venv"));

        #[cfg(target_os = "windows")]
        {
            assert_eq!(
                managed_mineru_executable_path(&root),
                root.join(".venv").join("Scripts").join("mineru.exe")
            );
            assert_eq!(
                venv_python_path(&venv),
                root.join(".venv").join("Scripts").join("python.exe")
            );
        }
        #[cfg(not(target_os = "windows"))]
        {
            assert_eq!(
                managed_mineru_executable_path(&root),
                root.join(".venv").join("bin").join("mineru")
            );
            assert_eq!(
                venv_python_path(&venv),
                root.join(".venv").join("bin").join("python")
            );
        }
    }

    #[test]
    fn installer_summary_uses_full_mineru_package() {
        let root = PathBuf::from("/tmp/gongkao/mineru-runtime");
        let summary = mineru_install_command_summary(&root);

        assert!(summary.contains("mineru[all]"));
        assert!(summary.contains(".venv"));
        assert!(summary.contains("uv pip install"));
    }

    #[test]
    fn mineru_parse_args_use_stable_local_pipeline_defaults() {
        let input = PathBuf::from("input.pdf");
        let output = PathBuf::from("out");
        let args = mineru_parse_args(&input, &output, "txt");

        assert!(args.windows(2).any(|pair| pair == ["-b", "pipeline"]));
        assert!(args.windows(2).any(|pair| pair == ["-m", "txt"]));
        assert!(args.windows(2).any(|pair| pair == ["-l", "ch"]));
        assert!(args.windows(2).any(|pair| pair == ["-d", "cpu"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--source", "modelscope"]));
    }

    #[test]
    fn normalizes_frontend_parse_run_id_for_temp_paths() {
        assert_eq!(
            normalize_parse_run_id(Some("pdf-abc_123".to_string())),
            "pdf-abc_123"
        );
        assert_ne!(normalize_parse_run_id(Some("../bad".to_string())), "../bad");
    }

    #[test]
    fn default_skill_paths_include_pdf_and_mineru_ocr() {
        assert!(default_pdf_skill_path().ends_with(Path::new("pdf").join("SKILL.md")));
        assert!(default_mineru_ocr_skill_path().ends_with(Path::new("mineru-ocr").join("SKILL.md")));
    }

    #[test]
    fn codex_skill_runtime_ids_are_stable_for_frontend_progress() {
        assert_eq!(CODEX_PDF_SKILL_PARSER, "codex-pdf-skill");
        assert_eq!(MINERU_OCR_SKILL_PARSER, "mineru-ocr-skill");
    }

    #[test]
    fn pdf_skill_text_quality_requires_meaningful_text() {
        assert!(!has_usable_pdf_text(" \n\t"));
        assert!(!has_usable_pdf_text(
            &"x ".repeat(MIN_USABLE_PDF_TEXT_CHARS - 1)
        ));
        assert!(has_usable_pdf_text(&"x".repeat(MIN_USABLE_PDF_TEXT_CHARS)));
    }

    #[test]
    fn rejects_too_short_codex_pdf_skill_text() {
        let root = temp_root();
        fs::create_dir_all(&root).unwrap();
        let result = normalize_codex_pdf_skill_result(
            &root,
            CodexPdfSkillResult {
                schema_version: Some(1),
                text: "too short".to_string(),
                pages: Vec::new(),
                layout_blocks: Vec::new(),
                warnings: Vec::new(),
            },
            root.join(PDF_SKILL_RESULT_FILE),
        );

        assert!(matches!(
            result,
            Err(MaterialParseError::ParseFailed(message)) if message.contains("too little readable text")
        ));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn classifies_model_download_logs() {
        let (stage, _, percentage) =
            classify_mineru_log_line("Downloading ModelScope PDF-Extract-Kit files", "ocr");

        assert_eq!(stage, "model_download");
        assert_eq!(percentage, Some(35.0));
    }

    #[test]
    fn python_candidates_prefer_versioned_python() {
        let candidates = python_venv_candidates();

        assert!(!candidates.is_empty());
        #[cfg(target_os = "windows")]
        assert_eq!(candidates[0].program, "py");
        #[cfg(not(target_os = "windows"))]
        assert!(candidates[0].program.starts_with("python3."));
    }

    #[test]
    fn prefers_full_markdown_files() {
        let root = temp_root();
        fs::create_dir_all(root.join("a")).unwrap();
        fs::create_dir_all(root.join("b")).unwrap();
        fs::write(root.join("a").join("full.md"), "# A").unwrap();
        fs::write(root.join("b").join("notes.md"), "# B").unwrap();

        let files = collect_markdown_files(&root).unwrap();

        assert_eq!(files.len(), 2);
        assert_eq!(
            files[0].file_name().and_then(OsStr::to_str),
            Some("full.md")
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reads_markdown_files_in_order() {
        let root = temp_root();
        fs::create_dir_all(&root).unwrap();
        let first = root.join("full.md");
        let second = root.join("part.md");
        fs::write(&first, "# First").unwrap();
        fs::write(&second, "# Second").unwrap();

        let text = read_markdown_files(&[first, second]).unwrap();

        assert!(text.contains("First"));
        assert!(text.contains("Second"));
        assert!(text.contains("\n\n"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn collects_content_json_files() {
        let root = temp_root();
        fs::create_dir_all(root.join("nested")).unwrap();
        fs::write(root.join("content_list.json"), "[]").unwrap();
        fs::write(root.join("nested").join("page_list.json"), "[]").unwrap();
        fs::write(root.join("model.json"), "{}").unwrap();

        let files = collect_content_json_files(&root).unwrap();

        assert_eq!(files.len(), 2);
        assert!(files
            .iter()
            .any(|path| path.file_name().and_then(OsStr::to_str) == Some("content_list.json")));
        assert!(files
            .iter()
            .all(|path| path.file_name().and_then(OsStr::to_str) != Some("model.json")));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reads_layout_blocks_from_mineru_content_json() {
        let root = temp_root();
        fs::create_dir_all(&root).unwrap();
        let content = root.join("content_list.json");
        fs::write(
            &content,
            r#"[
              {"type":"title","text":"材料一","page_idx":0,"bbox":[1,2,3,4]},
              {"type":"text","text":"数字乡村建设需要补齐基础设施短板。","page_idx":0},
              {"type":"title","text":"问题一","page_idx":1},
              {"type":"text","text":"请提出对策。要求：不超过300字。","page_idx":1}
            ]"#,
        )
        .unwrap();

        let blocks = read_layout_blocks_from_json_files(&[content]).unwrap();
        let pages = build_pages_from_blocks(&blocks);

        assert_eq!(blocks.len(), 4);
        assert_eq!(blocks[0].block_type, "heading");
        assert_eq!(blocks[0].page_number, 1);
        assert_eq!(blocks[0].bbox, Some([1.0, 2.0, 3.0, 4.0]));
        assert_eq!(blocks[2].page_number, 2);
        assert_eq!(pages.len(), 2);
        assert!(pages[1].text.contains("问题一"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn infers_layout_blocks_from_markdown_when_json_is_missing() {
        let root = temp_root();
        fs::create_dir_all(&root).unwrap();
        let markdown = root.join("page_1.md");
        fs::write(
            &markdown,
            "# 材料一\n\n数字乡村建设需要补齐基础设施短板。\n\n| 维度 | 问题 |\n| --- | --- |\n| 基础设施 | 不足 |\n\n1. 推进数字治理\n2. 完善人才支撑",
        )
        .unwrap();

        let blocks = infer_layout_blocks_from_markdown_files(&[markdown]).unwrap();

        assert_eq!(blocks[0].block_type, "heading");
        assert_eq!(blocks[1].block_type, "paragraph");
        assert!(blocks.iter().any(|block| block.block_type == "table"));
        assert!(blocks.iter().any(|block| block.block_type == "list"));
        assert!(blocks.iter().all(|block| block.page_number == 1));
        let _ = fs::remove_dir_all(root);
    }
}
