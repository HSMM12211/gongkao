#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedSkillMarkdown {
    pub name: Option<String>,
    pub description: Option<String>,
    pub triggers: Vec<String>,
    pub mode: Option<String>,
    pub body: String,
}

pub fn parse_skill_markdown(raw: &str) -> ParsedSkillMarkdown {
    let normalized = raw.trim_start_matches('\u{feff}');
    if !normalized.starts_with("---\n") && !normalized.starts_with("---\r\n") {
        return ParsedSkillMarkdown {
            name: None,
            description: None,
            triggers: Vec::new(),
            mode: None,
            body: normalized.to_string(),
        };
    }

    let line_ending = if normalized.starts_with("---\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let delimiter = format!("{line_ending}---{line_ending}");
    let Some(end) = normalized[3..].find(&delimiter) else {
        return ParsedSkillMarkdown {
            name: None,
            description: None,
            triggers: Vec::new(),
            mode: None,
            body: normalized.to_string(),
        };
    };

    let frontmatter = &normalized[3 + line_ending.len()..3 + end];
    let body_start = 3 + end + delimiter.len();
    let mut parsed = ParsedSkillMarkdown {
        name: None,
        description: None,
        triggers: Vec::new(),
        mode: None,
        body: normalized[body_start..].to_string(),
    };

    let mut lines = frontmatter.lines().peekable();
    while let Some(line) = lines.next() {
        let trimmed = line.trim();
        if let Some(value) = trimmed.strip_prefix("name:") {
            parsed.name = Some(value.trim().trim_matches('"').to_string());
        } else if let Some(value) = trimmed.strip_prefix("mode:") {
            parsed.mode = Some(value.trim().trim_matches('"').to_string());
        } else if let Some(value) = trimmed.strip_prefix("description:") {
            let value = value.trim();
            if value == "|" || value == ">" {
                let mut parts = Vec::new();
                while let Some(next) = lines.peek() {
                    if !next.starts_with(' ') && !next.starts_with('\t') {
                        break;
                    }
                    parts.push(lines.next().unwrap().trim().to_string());
                }
                parsed.description = Some(parts.join("\n").trim().to_string());
            } else {
                parsed.description = Some(value.trim_matches('"').to_string());
            }
        } else if trimmed == "triggers:" {
            while let Some(next) = lines.peek() {
                let value = next.trim();
                if !value.starts_with('-') {
                    break;
                }
                parsed.triggers.push(
                    value
                        .trim_start_matches('-')
                        .trim()
                        .trim_matches('"')
                        .to_string(),
                );
                lines.next();
            }
        }
    }

    parsed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_skill_frontmatter_and_body() {
        let raw = "---\nname: gongkao-material-parser\ndescription: |\n  Parse material.\ntriggers:\n  - pdf\n  - text\n---\n# Workflow\nWrite JSON.";
        let parsed = parse_skill_markdown(raw);

        assert_eq!(parsed.name.as_deref(), Some("gongkao-material-parser"));
        assert_eq!(parsed.description.as_deref(), Some("Parse material."));
        assert_eq!(parsed.triggers, vec!["pdf".to_string(), "text".to_string()]);
        assert_eq!(parsed.body.trim(), "# Workflow\nWrite JSON.");
    }
}
