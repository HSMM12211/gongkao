use super::{command_output, detect_program, output_text, AgentCommandSpec};
use crate::agent::types::{DetectedAgentAdapter, StartMaterialAgentRunRequest};
use std::path::Path;

pub fn detect_claude_adapter() -> DetectedAgentAdapter {
    let mut adapter = detect_program("claude", "Claude Code", "claude", &["--version"]);
    if adapter.available {
        let auth = detect_claude_auth_status();
        adapter.auth_status = auth.status.into();
        adapter.message = format!("{} {}", adapter.message, auth.message);
    }
    adapter
}

pub fn build_claude_command(
    request: &StartMaterialAgentRunRequest,
    cwd: &Path,
) -> AgentCommandSpec {
    let mut args = vec![
        "-p".to_string(),
        "--input-format".to_string(),
        "stream-json".to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--add-dir".to_string(),
        cwd.to_string_lossy().to_string(),
    ];
    if !request.model.trim().is_empty() {
        args.push("--model".to_string());
        args.push(request.model.clone());
    }
    AgentCommandSpec {
        program: "claude".into(),
        args,
    }
}

struct AuthProbe {
    status: &'static str,
    message: &'static str,
}

fn detect_claude_auth_status() -> AuthProbe {
    match command_output("claude", &["auth", "status"]) {
        Ok(output) => parse_claude_auth_status(output.status.success(), &output_text(&output)),
        Err(_) => AuthProbe {
            status: "unknown",
            message: "Auth status could not be verified.",
        },
    }
}

fn parse_claude_auth_status(success: bool, text: &str) -> AuthProbe {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(text) {
        if value
            .get("loggedIn")
            .and_then(|logged_in| logged_in.as_bool())
            .unwrap_or(false)
        {
            return AuthProbe {
                status: "ok",
                message: "Auth status OK.",
            };
        }
        return AuthProbe {
            status: "missing",
            message: "Login is required.",
        };
    }

    let lower = text.to_ascii_lowercase();
    if lower.contains("not logged")
        || lower.contains("not authenticated")
        || lower.contains("login required")
        || lower.contains("missing")
        || lower.contains("unauthorized")
    {
        return AuthProbe {
            status: "missing",
            message: "Login is required.",
        };
    }
    if lower.contains("logged in") || lower.contains("authenticated") {
        return AuthProbe {
            status: "ok",
            message: "Auth status OK.",
        };
    }
    if success {
        AuthProbe {
            status: "unknown",
            message: "Auth status command returned no recognizable result.",
        }
    } else {
        AuthProbe {
            status: "missing",
            message: "Login is required.",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_claude_stream_json_args() {
        let request = StartMaterialAgentRunRequest {
            adapter_id: "claude".into(),
            model: "sonnet".into(),
            reasoning: "default".into(),
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

        let spec = build_claude_command(&request, Path::new("D:/tmp/run"));

        assert_eq!(spec.program, "claude");
        assert!(spec.args.contains(&"--input-format".to_string()));
        assert!(spec.args.contains(&"stream-json".to_string()));
        assert!(spec.args.contains(&"--add-dir".to_string()));
        assert!(spec.args.contains(&"D:/tmp/run".to_string()));
        assert!(spec.args.contains(&"--model".to_string()));
    }

    #[test]
    fn parses_claude_auth_status() {
        let ok = parse_claude_auth_status(
            true,
            r#"{"loggedIn":true,"authMethod":"oauth_token","apiProvider":"firstParty"}"#,
        );
        assert_eq!(ok.status, "ok");

        let missing = parse_claude_auth_status(true, r#"{"loggedIn":false}"#);
        assert_eq!(missing.status, "missing");

        let text = parse_claude_auth_status(false, "Not authenticated. Run claude auth login.");
        assert_eq!(text.status, "missing");
    }
}
