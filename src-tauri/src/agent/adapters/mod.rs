use super::errors::{AgentError, AgentResult};
use super::types::{DetectedAgentAdapter, StartMaterialAgentRunRequest};
use std::path::Path;
use std::process::{Command, Output};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub mod claude;
pub mod codex;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentCommandSpec {
    pub program: String,
    pub args: Vec<String>,
}

pub fn detect_adapters() -> Vec<DetectedAgentAdapter> {
    vec![
        codex::detect_codex_adapter(),
        claude::detect_claude_adapter(),
    ]
}

pub fn command_for_request(
    request: &StartMaterialAgentRunRequest,
    cwd: &Path,
) -> AgentResult<AgentCommandSpec> {
    match request.adapter_id.as_str() {
        "codex" => Ok(codex::build_codex_command(request, cwd)),
        "claude" => Ok(claude::build_claude_command(request, cwd)),
        other => Err(AgentError::AdapterUnavailable(format!(
            "Unsupported agent adapter: {other}"
        ))),
    }
}

fn detect_program(
    id: &str,
    name: &str,
    program: &str,
    version_args: &[&str],
) -> DetectedAgentAdapter {
    match command_output(program, version_args) {
        Ok(output) if output.status.success() => {
            let version = output_text(&output).trim().to_string();
            DetectedAgentAdapter {
                id: id.into(),
                name: name.into(),
                available: true,
                path: Some(program.into()),
                version: if version.is_empty() {
                    None
                } else {
                    Some(version)
                },
                auth_status: "unknown".into(),
                message: format!("{name} was detected on PATH."),
            }
        }
        Ok(output) => DetectedAgentAdapter {
            id: id.into(),
            name: name.into(),
            available: false,
            path: Some(program.into()),
            version: None,
            auth_status: "unknown".into(),
            message: format!("{name} returned status {}.", output.status),
        },
        Err(error) => DetectedAgentAdapter {
            id: id.into(),
            name: name.into(),
            available: false,
            path: None,
            version: None,
            auth_status: "missing".into(),
            message: error.to_string(),
        },
    }
}

pub(super) fn command_output(program: &str, args: &[&str]) -> std::io::Result<Output> {
    let mut command = Command::new(program);
    command.args(args);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    command.output()
}

pub(super) fn output_text(output: &Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    match (stdout.trim().is_empty(), stderr.trim().is_empty()) {
        (false, false) => format!("{}\n{}", stdout.trim(), stderr.trim()),
        (false, true) => stdout.trim().to_string(),
        (true, false) => stderr.trim().to_string(),
        (true, true) => String::new(),
    }
}
