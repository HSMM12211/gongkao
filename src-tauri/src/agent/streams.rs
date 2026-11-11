use super::types::AgentRunEvent;
use serde_json::{Map, Value};

pub const AGENT_RUN_EVENT: &str = "agent://run-event";

pub fn now_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    millis.to_string()
}

pub fn make_event(run_id: &str, kind: &str, message: impl Into<String>) -> AgentRunEvent {
    AgentRunEvent {
        run_id: run_id.to_string(),
        kind: kind.to_string(),
        message: message.into(),
        timestamp: now_timestamp(),
        event_type: None,
        raw: None,
    }
}

pub fn parse_codex_json_line(run_id: &str, line: &str) -> Option<AgentRunEvent> {
    parse_json_agent_line("codex", run_id, line)
}

pub fn parse_claude_json_line(run_id: &str, line: &str) -> Option<AgentRunEvent> {
    parse_json_agent_line("claude", run_id, line)
}

pub fn parse_agent_json_line(adapter_id: &str, run_id: &str, line: &str) -> Option<AgentRunEvent> {
    match adapter_id {
        "codex" => parse_codex_json_line(run_id, line),
        "claude" => parse_claude_json_line(run_id, line),
        _ => None,
    }
}

fn parse_json_agent_line(adapter_id: &str, run_id: &str, line: &str) -> Option<AgentRunEvent> {
    let value: Value = serde_json::from_str(line).ok()?;
    let object = value.as_object()?;
    let raw_type = first_string(&[
        object.get("type"),
        object.get("event"),
        object.get("kind"),
        nested_value(object, "msg", "type"),
    ])
    .unwrap_or_default();
    let kind = normalize_agent_type(adapter_id, &raw_type, object);
    let message = summarize_agent_frame(&kind, object)?;

    Some(AgentRunEvent {
        run_id: run_id.to_string(),
        kind: kind.clone(),
        message,
        timestamp: now_timestamp(),
        event_type: Some(kind),
        raw: Some(shrink_raw_frame(object)),
    })
}

fn normalize_agent_type(adapter_id: &str, raw_type: &str, object: &Map<String, Value>) -> String {
    let lower = raw_type.to_ascii_lowercase();
    let item = object_value(object.get("item"));
    let item_type = item
        .and_then(|item| first_string(&[item.get("type")]))
        .unwrap_or_default();

    if item_type == "command_execution" {
        return if lower.contains("completed") {
            "tool_result".into()
        } else {
            "tool_call".into()
        };
    }
    if item_type == "file_change" {
        return "file_write".into();
    }
    if item_type == "message" {
        return "text_delta".into();
    }
    if matches!(lower.as_str(), "turn.completed" | "thread.completed") {
        return "done".into();
    }
    if matches!(lower.as_str(), "turn.started" | "thread.started") {
        return "log".into();
    }
    if lower.contains("tool") && lower.contains("result") {
        return "tool_result".into();
    }
    if lower.contains("tool") || object.get("name").is_some() {
        return "tool_call".into();
    }
    if lower.contains("reason") || lower.contains("thinking") {
        return "thinking_delta".into();
    }
    if lower.contains("error") {
        return "agent_error".into();
    }
    if lower.contains("done") || lower.contains("completed") {
        return "done".into();
    }
    if extract_file_path(object).is_some() {
        return "file_write".into();
    }
    if adapter_id == "claude" && lower.contains("assistant") {
        return "text_delta".into();
    }
    "text_delta".into()
}

fn summarize_agent_frame(kind: &str, object: &Map<String, Value>) -> Option<String> {
    let item = object_value(object.get("item"));
    match kind {
        "tool_call" => {
            let name = first_string(&[
                object.get("name"),
                object.get("tool_name"),
                nested_value(object, "tool", "name"),
                item.and_then(|item| item.get("command")),
            ])
            .unwrap_or_else(|| "tool".into());
            let input = object
                .get("input")
                .or_else(|| object.get("arguments"))
                .or_else(|| object.get("tool_input"))
                .or_else(|| item.and_then(|item| item.get("command")));
            Some(match input {
                Some(value) => format!("{name}: {}", truncate(&json_value_to_display(value), 360)),
                None => name,
            })
        }
        "tool_result" => {
            let output = first_string(&[
                object.get("output"),
                object.get("result"),
                object.get("content"),
                item.and_then(|item| item.get("output")),
                item.and_then(|item| item.get("aggregated_output")),
            ]);
            if let Some(output) = output {
                return Some(truncate(&output, 500));
            }
            first_string(&[item.and_then(|item| item.get("command"))])
                .map(|command| format!("completed: {}", truncate(&command, 360)))
                .or_else(|| Some("tool result".into()))
        }
        "file_write" => extract_file_path(object).or_else(|| Some("file written".into())),
        "log" | "done" => first_string(&[
            object.get("type"),
            object.get("event"),
            object.get("kind"),
        ])
        .or_else(|| Some(kind.into())),
        _ => {
            let text = extract_text(&Value::Object(object.clone()))
                .or_else(|| first_string(&[
                    object.get("message"),
                    object.get("delta"),
                    object.get("text"),
                    object.get("result"),
                ]));
            text.map(|text| truncate(&text, 800))
        }
    }
}

fn extract_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) if !text.trim().is_empty() => Some(text.trim().into()),
        Value::Array(items) => {
            let parts: Vec<String> = items.iter().filter_map(extract_text).collect();
            (!parts.is_empty()).then(|| parts.join("\n"))
        }
        Value::Object(object) => {
            first_string(&[
                object.get("text"),
                object.get("delta"),
                object.get("content"),
                object.get("message"),
                object.get("result"),
            ])
            .or_else(|| {
                ["item", "msg", "data", "output", "content", "message"]
                    .iter()
                    .filter_map(|key| object.get(*key))
                    .find_map(extract_text)
            })
        }
        _ => None,
    }
}

fn extract_file_path(object: &Map<String, Value>) -> Option<String> {
    if let Some(path) = first_string(&[
        object.get("path"),
        object.get("file"),
        object.get("file_path"),
        object.get("output_path"),
    ]) {
        return Some(path);
    }

    let item = object_value(object.get("item"))?;
    let changes = item.get("changes")?.as_array()?;
    let paths: Vec<String> = changes
        .iter()
        .filter_map(|change| change.as_object())
        .filter_map(|change| change.get("path").and_then(Value::as_str))
        .map(str::to_string)
        .collect();
    (!paths.is_empty()).then(|| paths.join(", "))
}

fn first_string(values: &[Option<&Value>]) -> Option<String> {
    values
        .iter()
        .flatten()
        .find_map(|value| value.as_str().map(str::trim).filter(|text| !text.is_empty()))
        .map(str::to_string)
}

fn nested_value<'a>(object: &'a Map<String, Value>, key: &str, nested_key: &str) -> Option<&'a Value> {
    object.get(key)?.as_object()?.get(nested_key)
}

fn object_value(value: Option<&Value>) -> Option<&Map<String, Value>> {
    value?.as_object()
}

fn json_value_to_display(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string())
}

fn truncate(value: &str, max: usize) -> String {
    if value.chars().count() <= max {
        return value.into();
    }
    let mut truncated: String = value.chars().take(max).collect();
    truncated.push_str("...");
    truncated
}

fn shrink_raw_frame(object: &Map<String, Value>) -> Value {
    let mut clone = Map::new();
    for key in ["type", "event", "kind", "name", "message", "text", "delta", "path", "item"] {
        if let Some(value) = object.get(key) {
            clone.insert(key.into(), value.clone());
        }
    }
    Value::Object(clone)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_codex_text_json_line() {
        let event = parse_codex_json_line("run-1", r#"{"message":"hello"}"#).unwrap();
        assert_eq!(event.kind, "text_delta");
        assert_eq!(event.message, "hello");
    }

    #[test]
    fn parses_claude_result_json_line() {
        let event = parse_claude_json_line("run-1", r#"{"result":"done"}"#).unwrap();
        assert_eq!(event.kind, "text_delta");
        assert_eq!(event.message, "done");
    }

    #[test]
    fn maps_codex_command_execution_frames() {
        let started = parse_codex_json_line(
            "run-1",
            r#"{"type":"item.started","item":{"type":"command_execution","command":"Get-Content SKILL.md"}}"#,
        )
        .unwrap();
        let completed = parse_codex_json_line(
            "run-1",
            r##"{"type":"item.completed","item":{"type":"command_execution","command":"Get-Content SKILL.md","output":"# Skill"}}"##,
        )
        .unwrap();

        assert_eq!(started.kind, "tool_call");
        assert!(started.message.contains("Get-Content"));
        assert_eq!(completed.kind, "tool_result");
        assert_eq!(completed.message, "# Skill");
    }

    #[test]
    fn maps_codex_file_change_and_lifecycle_frames() {
        let file = parse_codex_json_line(
            "run-1",
            r#"{"type":"item.completed","item":{"type":"file_change","changes":[{"path":"material-draft.json"},{"path":"report.md"}]}}"#,
        )
        .unwrap();
        let started = parse_codex_json_line("run-1", r#"{"type":"turn.started"}"#).unwrap();
        let done = parse_codex_json_line("run-1", r#"{"type":"turn.completed"}"#).unwrap();

        assert_eq!(file.kind, "file_write");
        assert!(file.message.contains("material-draft.json"));
        assert_eq!(started.kind, "log");
        assert_eq!(done.kind, "done");
    }
}
