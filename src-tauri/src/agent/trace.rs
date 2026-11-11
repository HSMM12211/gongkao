use super::errors::{AgentError, AgentResult};
use super::types::AgentRunEvent;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

pub const TRACE_FILE_NAME: &str = "trace.jsonl";

pub fn append_trace_event(workspace_path: &Path, event: &AgentRunEvent) -> AgentResult<()> {
    fs::create_dir_all(workspace_path).map_err(AgentError::from)?;
    let line = serde_json::to_string(event)?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(workspace_path.join(TRACE_FILE_NAME))
        .map_err(AgentError::from)?;
    writeln!(file, "{line}").map_err(AgentError::from)
}

pub fn has_trace(workspace_path: &Path) -> bool {
    let path = workspace_path.join(TRACE_FILE_NAME);
    fs::read_to_string(path)
        .map(|raw| raw.lines().any(|line| !line.trim().is_empty()))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::streams::make_event;
    use uuid::Uuid;

    fn temp_workspace() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("gongkao-trace-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn appends_trace_jsonl() {
        let path = temp_workspace();
        let event = make_event("run-1", "running", "Agent run started.");

        append_trace_event(&path, &event).unwrap();

        let raw = fs::read_to_string(path.join(TRACE_FILE_NAME)).unwrap();
        assert!(raw.contains("\"runId\":\"run-1\""));
        assert!(has_trace(&path));
        let _ = fs::remove_dir_all(path);
    }
}
