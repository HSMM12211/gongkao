use super::errors::{AgentError, AgentResult};
use super::types::{ResolvedSkill, RunWorkspace, StartMaterialAgentRunRequest};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

pub fn safe_alias_segment(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
}

pub fn create_run_workspace(app: &AppHandle) -> AgentResult<RunWorkspace> {
    let run_id = Uuid::new_v4().to_string();
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| AgentError::Io(error.to_string()))?
        .join("agent-runs");
    let path = root.join(&run_id);
    fs::create_dir_all(&path).map_err(AgentError::from)?;
    Ok(RunWorkspace { run_id, path })
}

pub fn write_run_input(path: &Path, request: &StartMaterialAgentRunRequest) -> AgentResult<()> {
    let payload = serde_json::to_string_pretty(request)?;
    fs::write(path.join("input.json"), payload).map_err(AgentError::from)
}

pub fn write_output_schema(path: &Path) -> AgentResult<()> {
    let schema = json!({
        "requiredOutput": "material-draft.json",
        "schemaVersion": 1,
        "source": {
            "required": ["title", "sourceType", "text", "references"],
            "sourceType": "One of text, markdown, pdf.",
            "references": {
                "required": ["title", "accessedAt", "excerpt"],
                "optional": ["url", "publisher", "publishedAt", "snapshotPath"],
                "rules": [
                    "At least one provenance reference is required.",
                    "Use accessedAt as an ISO timestamp or yyyy-mm-dd.",
                    "For local files, use the file name as title and a short local excerpt or locator as excerpt."
                ]
            }
        },
        "draft": {
            "required": ["topic", "summary", "tags", "keywords", "goldenSentences", "flashcards", "practiceQuestions", "copybookItems"],
            "flashcards": {
                "required": ["front", "keywords", "category"],
                "category": "One of: 金句, 规范词, 对策.",
                "forbiddenAliases": ["back", "answer"]
            },
            "practiceQuestions": {
                "required": ["type", "title", "material", "prompt", "keywords", "modelAnswer"],
                "type": "One of: 概括题, 对策题, 综合分析, 应用文, 大作文.",
                "forbiddenAliases": ["question", "answer", "difficulty"]
            },
            "copybookItems": {
                "required": ["title", "text", "tags"]
            },
            "longPdfGuidance": {
                "flashcards": "For local PDFs or long documents, create 8-20 items when enough material exists.",
                "practiceQuestions": "For local PDFs, course handouts, or question banks, create 6-12 representative questions when enough material exists.",
                "references": "Cover distinct page ranges or sections instead of only the opening pages."
            }
        },
        "report": {
            "required": ["summary", "warnings", "confidence"]
        }
    });
    fs::write(
        path.join("output-schema.json"),
        serde_json::to_string_pretty(&schema)?,
    )
    .map_err(AgentError::from)
}

fn copy_dir_all(source: &Path, target: &Path) -> AgentResult<()> {
    fs::create_dir_all(target).map_err(AgentError::from)?;
    for entry in fs::read_dir(source).map_err(AgentError::from)? {
        let entry = entry.map_err(AgentError::from)?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if source_path.is_dir() {
            copy_dir_all(&source_path, &target_path)?;
        } else {
            fs::copy(&source_path, &target_path).map_err(AgentError::from)?;
        }
    }
    Ok(())
}

pub fn stage_skill(workspace: &Path, skill: &ResolvedSkill) -> AgentResult<PathBuf> {
    let slug = skill
        .info
        .id
        .replace(|ch: char| !ch.is_ascii_alphanumeric() && ch != '-', "-");
    if !safe_alias_segment(&slug) {
        return Err(AgentError::InvalidRequest("Unsafe skill alias.".into()));
    }
    let mut hasher = Sha256::new();
    hasher.update(skill.root.to_string_lossy().as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    let alias = format!("{}-{}", slug, &hash[..8]);
    let target = workspace.join(".gongkao-skills").join(alias);
    copy_dir_all(&skill.root, &target)?;
    Ok(target)
}

pub fn compose_prompt(
    request: &StartMaterialAgentRunRequest,
    skill: &ResolvedSkill,
    staged_skill_path: &Path,
) -> String {
    let mut parts = vec![
        "You are running inside the Gongkao desktop material-agent runtime.".to_string(),
        "Use the provided SKILL.md instructions and write the final structured result to material-draft.json at the workspace root.".to_string(),
        "Do not write to the app database. The app validates and imports the output after user review.".to_string(),
        String::new(),
        "## Active Skill".to_string(),
        skill.skill_markdown.clone(),
        String::new(),
        "## Staged Skill Path".to_string(),
        staged_skill_path.to_string_lossy().to_string(),
        String::new(),
        "## Run Request".to_string(),
        format!("Title: {}", request.title),
        format!("Topic: {}", request.topic),
        format!("Source type: {}", request.source_type),
        format!("Original name: {}", request.original_name.clone().unwrap_or_default()),
        format!("User instruction: {}", request.user_instruction),
    ];

    if let Some(values) = &request.skill_input_values {
        parts.push(format!("Structured skill inputs: {values}"));
    }
    if let Some(context) = &request.context {
        parts.push(format!("Bound context: {context}"));
    }
    if let Some(capabilities) = &request.required_capabilities {
        parts.push(format!("Required capabilities: {}", capabilities.join(", ")));
    }
    if let Some(capabilities) = &request.adapter_capabilities {
        parts.push(format!("Adapter capabilities: {}", capabilities.join(", ")));
    }
    if let Some(trust) = &request.skill_trust {
        parts.push(format!("Skill trust: {trust}"));
    }
    if let Some(source) = &request.skill_source {
        parts.push(format!("Skill source: {source}"));
    }
    if let Some(permissions) = &request.required_permissions {
        parts.push(format!("Required permissions: {}", permissions.join(", ")));
    }
    if let Some(budget) = &request.prompt_budget {
        parts.push(format!("Prompt budget: {budget}"));
    }

    parts.extend([
        String::new(),
        "## Source Text".to_string(),
        request.source_text.clone(),
        String::new(),
        "## Output Contract".to_string(),
        "Create material-draft.json matching output-schema.json exactly.".to_string(),
        "Do not use alias fields such as flashcards.back, practiceQuestions.question, practiceQuestions.answer, or copybookItems.source.".to_string(),
        "Every source.references item must include title, accessedAt, and excerpt. For local PDFs, use the current run date as accessedAt and the file name plus a short locator or excerpt as provenance.".to_string(),
        "For local PDFs and long documents, do not collapse the whole file into one generic question. Cover the document structure: create 6-12 practiceQuestions when enough material exists, 8-20 flashcards, and references that cite distinct pages or sections.".to_string(),
        "If the PDF is a question bank or course handout, extract representative real questions, tables, formulas, answer requirements, and model-answer assets across the full document instead of producing a single summary exercise.".to_string(),
        "If promptBudget.originalSourceChars is larger than promptBudget.finalSourceChars, mention the truncation in report.warnings and only claim coverage for the retained source text.".to_string(),
    ]);

    parts.join("\n")
}

pub fn prepare_workspace(
    app: &AppHandle,
    request: &StartMaterialAgentRunRequest,
    skill: &ResolvedSkill,
) -> AgentResult<(RunWorkspace, String)> {
    let workspace = create_run_workspace(app)?;
    write_run_input(&workspace.path, request)?;
    write_output_schema(&workspace.path)?;
    let staged_skill_path = stage_skill(&workspace.path, skill)?;
    let prompt = compose_prompt(request, skill, &staged_skill_path);
    fs::write(workspace.path.join("prompt.md"), &prompt).map_err(AgentError::from)?;
    Ok((workspace, prompt))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsafe_alias_segments() {
        assert!(safe_alias_segment("skill-abc"));
        assert!(!safe_alias_segment("../skill"));
        assert!(!safe_alias_segment("a\\b"));
        assert!(!safe_alias_segment(""));
    }

    #[test]
    fn writes_schema_file() {
        let dir = std::env::temp_dir().join("gongkao-agent-workspace-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        write_output_schema(&dir).unwrap();
        let schema = fs::read_to_string(dir.join("output-schema.json")).unwrap();
        assert!(schema.contains("\"material-draft.json\""));
        assert!(schema.contains("\"schemaVersion\""));
    }
}
