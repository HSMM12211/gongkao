use super::adapters::command_for_request;
use super::errors::{AgentError, AgentResult};
use super::skills::resolve_skill;
use super::streams::{make_event, parse_agent_json_line, AGENT_RUN_EVENT};
use super::trace::{append_trace_event, has_trace};
use super::types::{
    AgentRunStatusProbe, MaterialAgentRunResult, ResolvedSkill, RunWorkspace,
    StartMaterialAgentRunRequest, StartedAgentRun,
};
use super::workspace::prepare_workspace;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const STALE_RUN_AFTER: Duration = Duration::from_secs(30 * 60);

#[derive(Debug, Clone)]
struct RunState {
    workspace_path: PathBuf,
    status: String,
    pid: Option<u32>,
    error: Option<String>,
}

#[derive(Debug, Default)]
pub struct AgentRunManager {
    runs: Mutex<HashMap<String, RunState>>,
}

impl AgentRunManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn start_material_run(
        self: &Arc<Self>,
        app: AppHandle,
        request: StartMaterialAgentRunRequest,
    ) -> AgentResult<StartedAgentRun> {
        validate_request(&request)?;
        let skill = resolve_skill(&app, &request.skill_id)?;
        let (workspace, prompt) = prepare_workspace(&app, &request, &skill)?;
        let spec = command_for_request(&request, &workspace.path)?;

        let mut command = Command::new(&spec.program);
        command
            .args(&spec.args)
            .current_dir(&workspace.path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(target_os = "windows")]
        command.creation_flags(CREATE_NO_WINDOW);

        let mut child = command.spawn().map_err(|error| {
            AgentError::AdapterUnavailable(format!("Failed to start {}: {error}", spec.program))
        })?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(prompt.as_bytes())
                .map_err(AgentError::from)?;
            stdin.flush().map_err(AgentError::from)?;
        }

        let run_id = workspace.run_id.clone();
        let workspace_path = workspace.path.clone();
        let pid = child.id();
        self.set_run_state(
            &run_id,
            RunState {
                workspace_path: workspace_path.clone(),
                status: "running".into(),
                pid: Some(pid),
                error: None,
            },
        );
        emit_with_trace(
            &app,
            &workspace_path,
            make_event(&run_id, "running", "Agent run started."),
        );

        let manager = Arc::clone(self);
        let adapter_id = request.adapter_id.clone();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        thread::spawn(move || {
            let stdout_handle = stdout.map(|stream| {
                let app = app.clone();
                let adapter_id = adapter_id.clone();
                let run_id = run_id.clone();
                let workspace_path = workspace_path.clone();
                thread::spawn(move || {
                    read_stream(&app, &adapter_id, &run_id, "stdout", &workspace_path, stream)
                })
            });
            let stderr_handle = stderr.map(|stream| {
                let app = app.clone();
                let run_id = run_id.clone();
                let workspace_path = workspace_path.clone();
                thread::spawn(move || {
                    read_stream(&app, &adapter_id, &run_id, "stderr", &workspace_path, stream)
                })
            });

            let status = child.wait();
            let stdout_log = stdout_handle
                .and_then(|handle| handle.join().ok())
                .unwrap_or_default();
            let stderr_log = stderr_handle
                .and_then(|handle| handle.join().ok())
                .unwrap_or_default();
            let _ = fs::write(workspace_path.join("stdout.log"), stdout_log);
            let _ = fs::write(workspace_path.join("stderr.log"), &stderr_log);

            let existing_status = manager.status(&run_id);
            if existing_status.as_deref() == Some("cancelled") {
                emit_with_trace(
                    &app,
                    &workspace_path,
                    make_event(&run_id, "cancelled", "Agent run cancelled."),
                );
                return;
            }

            match status {
                Ok(exit) if exit.success() => {
                    let output_path = workspace_path.join("material-draft.json");
                    if output_path.exists() {
                        manager.update_status(&run_id, "completed", None);
                        emit_with_trace(
                            &app,
                            &workspace_path,
                            make_event(&run_id, "completed", "Agent run completed."),
                        );
                    } else {
                        let message =
                            "Agent completed but material-draft.json was not found.".to_string();
                        manager.update_status(&run_id, "failed", Some(message.clone()));
                        emit_with_trace(&app, &workspace_path, make_event(&run_id, "failed", message));
                    }
                }
                Ok(exit) => {
                    let message = if stderr_log.trim().is_empty() {
                        format!("Agent process exited with {exit}.")
                    } else {
                        stderr_log.trim().to_string()
                    };
                    manager.update_status(&run_id, "failed", Some(message.clone()));
                    emit_with_trace(&app, &workspace_path, make_event(&run_id, "failed", message));
                }
                Err(error) => {
                    let message = error.to_string();
                    manager.update_status(&run_id, "failed", Some(message.clone()));
                    emit_with_trace(&app, &workspace_path, make_event(&run_id, "failed", message));
                }
            }
        });

        Ok(StartedAgentRun {
            run_id: workspace.run_id,
            workspace_path: workspace.path.to_string_lossy().to_string(),
        })
    }

    pub fn cancel_run(&self, run_id: &str) -> AgentResult<()> {
        let pid = {
            let mut runs = self
                .runs
                .lock()
                .map_err(|_| AgentError::ProcessFailed("Agent run lock poisoned.".into()))?;
            let Some(state) = runs.get_mut(run_id) else {
                return Err(AgentError::RunNotFound(format!("Run not found: {run_id}")));
            };
            state.status = "cancelled".into();
            state.pid
        };

        if let Some(pid) = pid {
            kill_pid(pid)?;
        }
        Ok(())
    }

    pub fn get_material_run_result(&self, run_id: &str) -> AgentResult<MaterialAgentRunResult> {
        let workspace_path = {
            let runs = self
                .runs
                .lock()
                .map_err(|_| AgentError::ProcessFailed("Agent run lock poisoned.".into()))?;
            runs.get(run_id)
                .map(|state| state.workspace_path.clone())
                .ok_or_else(|| AgentError::RunNotFound(format!("Run not found: {run_id}")))?
        };
        let output_path = workspace_path.join("material-draft.json");
        if !output_path.exists() {
            return Err(AgentError::OutputMissing(format!(
                "material-draft.json was not found for run {run_id}"
            )));
        }
        let report_path = workspace_path.join("report.md");
        Ok(MaterialAgentRunResult {
            run_id: run_id.into(),
            workspace_path: workspace_path.to_string_lossy().to_string(),
            output_json: fs::read_to_string(output_path).map_err(AgentError::from)?,
            report_markdown: fs::read_to_string(report_path).ok(),
        })
    }

    pub fn probe_run_status(&self, workspace_path: PathBuf) -> AgentRunStatusProbe {
        probe_run_workspace_status_at(&workspace_path, SystemTime::now())
    }

    fn set_run_state(&self, run_id: &str, state: RunState) {
        if let Ok(mut runs) = self.runs.lock() {
            runs.insert(run_id.to_string(), state);
        }
    }

    fn update_status(&self, run_id: &str, status: &str, error: Option<String>) {
        if let Ok(mut runs) = self.runs.lock() {
            if let Some(state) = runs.get_mut(run_id) {
                state.status = status.into();
                state.error = error;
                state.pid = None;
            }
        }
    }

    fn status(&self, run_id: &str) -> Option<String> {
        self.runs
            .lock()
            .ok()
            .and_then(|runs| runs.get(run_id).map(|state| state.status.clone()))
    }
}

fn probe_run_workspace_status_at(workspace_path: &PathBuf, now: SystemTime) -> AgentRunStatusProbe {
    let material_path = workspace_path.join("material-draft.json");
    let report_path = workspace_path.join("report.md");
    let has_material_draft = material_path.exists();
    let has_report = report_path.exists();
    let has_trace = has_trace(workspace_path);

    if has_material_draft {
        match fs::read_to_string(&material_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(strip_json_bom(&raw)).ok())
        {
            Some(_) => {
                return AgentRunStatusProbe {
                    status: "completed".into(),
                    summary: "material-draft.json 已生成".into(),
                    error: None,
                    has_material_draft,
                    has_report,
                    has_trace,
                };
            }
            None => {
                return AgentRunStatusProbe {
                    status: "failed".into(),
                    summary: "material-draft.json 无法解析".into(),
                    error: Some("material-draft.json is not valid JSON.".into()),
                    has_material_draft,
                    has_report,
                    has_trace,
                };
            }
        }
    }

    let last_write = workspace_last_write(workspace_path);
    if last_write
        .and_then(|modified| now.duration_since(modified).ok())
        .is_some_and(|age| age > STALE_RUN_AFTER)
    {
        return AgentRunStatusProbe {
            status: "failed".into(),
            summary: "material-draft.json 未生成".into(),
            error: Some("Agent run appears stale and did not produce material-draft.json.".into()),
            has_material_draft,
            has_report,
            has_trace,
        };
    }

    AgentRunStatusProbe {
        status: "running".into(),
        summary: "Agent 仍在运行或等待输出".into(),
        error: None,
        has_material_draft,
        has_report,
        has_trace,
    }
}

fn strip_json_bom(raw: &str) -> &str {
    raw.strip_prefix('\u{feff}').unwrap_or(raw)
}

fn workspace_last_write(workspace_path: &PathBuf) -> Option<SystemTime> {
    let mut latest = fs::metadata(workspace_path)
        .and_then(|metadata| metadata.modified())
        .ok();
    if let Ok(entries) = fs::read_dir(workspace_path) {
        for entry in entries.flatten() {
            if let Ok(modified) = entry.metadata().and_then(|metadata| metadata.modified()) {
                latest = Some(latest.map_or(modified, |current| current.max(modified)));
            }
        }
    }
    latest
}

fn validate_request(request: &StartMaterialAgentRunRequest) -> AgentResult<()> {
    if !matches!(request.adapter_id.as_str(), "codex" | "claude") {
        return Err(AgentError::InvalidRequest(
            "adapterId must be codex or claude.".into(),
        ));
    }
    if request.model.trim().is_empty()
        || request.skill_id.trim().is_empty()
        || request.title.trim().is_empty()
        || request.topic.trim().is_empty()
    {
        return Err(AgentError::InvalidRequest(
            "adapter, model, skill, title, and topic are required.".into(),
        ));
    }
    if request.source_text.trim().chars().count() < 20
        && request.user_instruction.trim().chars().count() < 10
    {
        return Err(AgentError::InvalidRequest(
            "Provide material text or a clear collection instruction.".into(),
        ));
    }
    Ok(())
}

fn emit(app: &AppHandle, event: super::types::AgentRunEvent) {
    let _ = app.emit(AGENT_RUN_EVENT, event);
}

fn emit_with_trace(app: &AppHandle, workspace_path: &PathBuf, event: super::types::AgentRunEvent) {
    let _ = append_trace_event(workspace_path, &event);
    emit(app, event);
}

fn read_stream<R: Read + Send + 'static>(
    app: &AppHandle,
    adapter_id: &str,
    run_id: &str,
    kind: &str,
    workspace_path: &PathBuf,
    stream: R,
) -> String {
    let mut collected = String::new();
    for line in BufReader::new(stream).lines().map_while(Result::ok) {
        collected.push_str(&line);
        collected.push('\n');
        let event = if kind == "stdout" {
            parse_agent_json_line(adapter_id, run_id, &line)
                .unwrap_or_else(|| make_event(run_id, kind, line.clone()))
        } else if adapter_id == "codex" && kind == "stderr" && is_codex_status_stderr(&line) {
            make_event(run_id, "log", line.clone())
        } else {
            make_event(run_id, kind, line.clone())
        };
        emit_with_trace(app, workspace_path, event);
    }
    collected
}

fn is_codex_status_stderr(line: &str) -> bool {
    let normalized = line.trim().to_ascii_lowercase();
    matches!(
        normalized.as_str(),
        "reading prompt from stdin..."
            | "thread.started"
            | "turn.started"
            | "turn.completed"
            | "agent run started."
    )
}

fn kill_pid(pid: u32) -> AgentResult<()> {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("taskkill");
        command
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW);
        let _ = command.output().map_err(AgentError::from)?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .output()
            .map_err(AgentError::from)?;
    }

    Ok(())
}

#[allow(dead_code)]
fn _keep_types(_: &ResolvedSkill, _: &RunWorkspace) {}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn request(source_text: &str, instruction: &str) -> StartMaterialAgentRunRequest {
        StartMaterialAgentRunRequest {
            adapter_id: "codex".into(),
            model: "gpt-5.5".into(),
            reasoning: "medium".into(),
            skill_id: "gongkao-material-parser".into(),
            title: "Title".into(),
            topic: "Topic".into(),
            source_text: source_text.into(),
            source_type: "text".into(),
            original_name: None,
            user_instruction: instruction.into(),
            skill_input_values: None,
            context: None,
            required_capabilities: None,
            adapter_capabilities: None,
            skill_trust: None,
            skill_source: None,
            required_permissions: None,
            prompt_budget: None,
        }
    }

    #[test]
    fn validates_material_run_input() {
        assert!(validate_request(&request("short", "short")).is_err());
        assert!(validate_request(&request(
            "This material source text has enough characters for validation.",
            ""
        ))
        .is_ok());
    }

    #[test]
    fn treats_codex_stderr_startup_lines_as_status() {
        assert!(is_codex_status_stderr("Reading prompt from stdin..."));
        assert!(is_codex_status_stderr("thread.started"));
        assert!(!is_codex_status_stderr("error: model failed"));
    }

    fn temp_workspace() -> PathBuf {
        let path = std::env::temp_dir().join(format!("gongkao-run-probe-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn probe_marks_workspace_completed_when_material_draft_exists() {
        let path = temp_workspace();
        fs::write(path.join("material-draft.json"), r#"{"schemaVersion":1}"#).unwrap();
        fs::write(path.join("report.md"), "# Report").unwrap();

        let probe = probe_run_workspace_status_at(&path, SystemTime::now());

        assert_eq!(probe.status, "completed");
        assert!(probe.has_material_draft);
        assert!(probe.has_report);
        assert!(!probe.has_trace);
        let _ = fs::remove_dir_all(path);
    }

    #[test]
    fn probe_accepts_material_draft_with_utf8_bom() {
        let path = temp_workspace();
        fs::write(path.join("material-draft.json"), "\u{feff}{\"schemaVersion\":1}").unwrap();

        let probe = probe_run_workspace_status_at(&path, SystemTime::now());

        assert_eq!(probe.status, "completed");
        assert!(probe.has_material_draft);
        assert!(!probe.has_trace);
        let _ = fs::remove_dir_all(path);
    }

    #[test]
    fn probe_marks_workspace_failed_when_material_draft_is_invalid_json() {
        let path = temp_workspace();
        fs::write(path.join("material-draft.json"), "{not-json").unwrap();

        let probe = probe_run_workspace_status_at(&path, SystemTime::now());

        assert_eq!(probe.status, "failed");
        assert!(probe.error.unwrap().contains("not valid JSON"));
        assert!(!probe.has_trace);
        let _ = fs::remove_dir_all(path);
    }

    #[test]
    fn probe_reports_trace_availability() {
        let path = temp_workspace();
        fs::write(path.join("trace.jsonl"), "{\"runId\":\"run-1\"}\n").unwrap();

        let probe = probe_run_workspace_status_at(&path, SystemTime::now());

        assert_eq!(probe.status, "running");
        assert!(probe.has_trace);
        let _ = fs::remove_dir_all(path);
    }

    #[test]
    fn probe_marks_stale_workspace_failed_when_output_is_missing() {
        let path = temp_workspace();
        fs::write(path.join("stdout.log"), "started").unwrap();

        let probe = probe_run_workspace_status_at(
            &path,
            SystemTime::now() + STALE_RUN_AFTER + Duration::from_secs(1),
        );

        assert_eq!(probe.status, "failed");
        assert!(!probe.has_material_draft);
        assert!(!probe.has_trace);
        let _ = fs::remove_dir_all(path);
    }
}
