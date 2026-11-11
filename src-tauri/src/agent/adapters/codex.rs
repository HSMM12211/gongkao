use super::{command_output, detect_program, output_text, AgentCommandSpec};
use crate::agent::types::{DetectedAgentAdapter, StartMaterialAgentRunRequest};
use std::path::{Path, PathBuf};

pub fn detect_codex_adapter() -> DetectedAgentAdapter {
    let program = codex_program();
    let mut adapter = detect_program("codex", "Codex CLI", &program, &["--version"]);
    if adapter.available {
        let auth = detect_codex_auth_status(&program);
        adapter.auth_status = auth.status.into();
        adapter.message = format!("{} {}", adapter.message, auth.message);
    }
    adapter
}

pub fn build_codex_command(request: &StartMaterialAgentRunRequest, cwd: &Path) -> AgentCommandSpec {
    let mut args = vec![
        "exec".to_string(),
        "--json".to_string(),
        "--skip-git-repo-check".to_string(),
    ];

    #[cfg(target_os = "windows")]
    {
        // Mirrors Open Design's Windows strategy: Codex cannot enforce its
        // workspace-write sandbox on Windows, so shell/tool calls are blocked
        // unless the run explicitly opts into danger-full-access.
        args.push("--sandbox".to_string());
        args.push("danger-full-access".to_string());
    }

    #[cfg(not(target_os = "windows"))]
    {
        args.push("--sandbox".to_string());
        args.push("workspace-write".to_string());
        args.push("-c".to_string());
        args.push("sandbox_workspace_write.network_access=true".to_string());
    }

    args.extend(["-C".to_string(), cwd.to_string_lossy().to_string()]);
    if !request.model.trim().is_empty() {
        args.push("-m".to_string());
        args.push(request.model.clone());
    }
    if request.reasoning != "default" {
        args.push("-c".to_string());
        args.push(format!("model_reasoning_effort={}", request.reasoning));
    }
    AgentCommandSpec {
        program: codex_program(),
        args,
    }
}

fn codex_program() -> String {
    if let Some(configured) = configured_codex_bin() {
        return configured;
    }
    #[cfg(target_os = "windows")]
    {
        if let Some(npm_shim) = windows_npm_codex_cmd() {
            return npm_shim.to_string_lossy().to_string();
        }
        return "codex.cmd".into();
    }
    #[cfg(not(target_os = "windows"))]
    {
        "codex".into()
    }
}

struct AuthProbe {
    status: &'static str,
    message: &'static str,
}

fn detect_codex_auth_status(program: &str) -> AuthProbe {
    match command_output(program, &["login", "status"]) {
        Ok(output) => parse_codex_auth_status(output.status.success(), &output_text(&output)),
        Err(_) => AuthProbe {
            status: "unknown",
            message: "Login status could not be verified.",
        },
    }
}

fn parse_codex_auth_status(success: bool, text: &str) -> AuthProbe {
    let lower = text.to_ascii_lowercase();
    if lower.contains("not logged")
        || lower.contains("not authenticated")
        || lower.contains("login required")
        || lower.contains("missing authentication")
        || lower.contains("no auth")
    {
        return AuthProbe {
            status: "missing",
            message: "Login is required.",
        };
    }
    if lower.contains("logged in") || lower.contains("authenticated") || lower.contains("api key") {
        return AuthProbe {
            status: "ok",
            message: "Login status OK.",
        };
    }
    if success {
        AuthProbe {
            status: "unknown",
            message: "Login status command returned no recognizable result.",
        }
    } else if lower.contains("unknown command")
        || lower.contains("unrecognized")
        || lower.contains("unexpected argument")
    {
        AuthProbe {
            status: "unknown",
            message: "This Codex CLI version does not expose login status.",
        }
    } else {
        AuthProbe {
            status: "missing",
            message: "Login is required.",
        }
    }
}

fn configured_codex_bin() -> Option<String> {
    std::env::var("CODEX_BIN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(target_os = "windows")]
fn windows_npm_codex_cmd() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    let candidate = PathBuf::from(appdata).join("npm").join("codex.cmd");
    candidate.is_file().then_some(candidate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_codex_exec_args_with_cwd() {
        let request = StartMaterialAgentRunRequest {
            adapter_id: "codex".into(),
            model: "gpt-5.5".into(),
            reasoning: "high".into(),
            skill_id: "gongkao-material-parser".into(),
            title: "Title".into(),
            topic: "Topic".into(),
            source_text: "Long enough source text for tests.".into(),
            source_type: "text".into(),
            original_name: None,
            user_instruction: "Instruction".into(),
            skill_input_values: None,
            context: None,
            required_capabilities: None,
            adapter_capabilities: None,
            skill_trust: None,
            skill_source: None,
            required_permissions: None,
            prompt_budget: None,
        };

        let spec = build_codex_command(&request, Path::new("D:/tmp/run"));

        assert!(spec.program.contains("codex"));
        assert!(spec.args.contains(&"exec".to_string()));
        assert!(spec.args.contains(&"--json".to_string()));
        assert!(spec.args.contains(&"-C".to_string()));
        assert!(spec.args.contains(&"D:/tmp/run".to_string()));
        assert!(spec
            .args
            .contains(&"model_reasoning_effort=high".to_string()));
        #[cfg(target_os = "windows")]
        {
            assert!(spec
                .args
                .windows(2)
                .any(|pair| pair[0] == "--sandbox" && pair[1] == "danger-full-access"));
        }
    }

    #[test]
    fn parses_codex_login_status() {
        let ok = parse_codex_auth_status(true, "Logged in using an API key - gx-***");
        assert_eq!(ok.status, "ok");

        let missing = parse_codex_auth_status(false, "Not logged in. Run codex login.");
        assert_eq!(missing.status, "missing");

        let unknown = parse_codex_auth_status(false, "error: unexpected argument 'status'");
        assert_eq!(unknown.status, "unknown");
    }
}
