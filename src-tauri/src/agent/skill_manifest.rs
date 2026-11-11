use super::errors::{AgentError, AgentResult};
use super::types::{
    ManagedSkillInfo, ResolvedSkill, SkillManifestInput, SkillStateEntry, SkillValidationResult,
};
use std::fs;
use std::path::Path;

const BUILTIN_MATERIAL_SKILL_IDS: [&str; 4] = [
    "gongkao-hotspot-collector",
    "gongkao-material-parser",
    "gongkao-smoke-test-skill",
    "gongkao-topic-wiki-curator",
];

pub fn safe_skill_id(value: &str) -> bool {
    (2..=63).contains(&value.len())
        && value
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
        && value
            .chars()
            .next()
            .is_some_and(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit())
}

pub fn validate_manifest(input: &SkillManifestInput) -> SkillValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    if !safe_skill_id(&input.id) {
        errors.push("Skill ID must use 2-63 lowercase letters, digits, and hyphens.".to_string());
    }
    if input.name.trim().is_empty() {
        errors.push("Skill name is required.".to_string());
    }
    if input.description.trim().is_empty() {
        errors.push("Skill description is required.".to_string());
    }
    if !input.skill_markdown.trim_start().starts_with("---") {
        errors.push("SKILL.md must include YAML frontmatter.".to_string());
    }
    if input.source == "external" && input.trust == "trusted" {
        warnings
            .push("External Skills should be reviewed before being marked trusted.".to_string());
    }
    if input
        .required_permissions
        .iter()
        .any(|permission| permission == "network" || permission == "subprocess")
        && input.trust == "trusted"
        && input.source != "built-in"
    {
        warnings.push("This Skill requests high-risk permissions.".to_string());
    }

    SkillValidationResult {
        ok: errors.is_empty(),
        errors,
        warnings,
    }
}

pub fn read_manifest(root: &Path) -> AgentResult<Option<SkillManifestInput>> {
    let path = root.join("gongkao-skill.json");
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path).map_err(AgentError::from)?;
    let mut manifest: SkillManifestInput = serde_json::from_str(&raw).map_err(AgentError::from)?;
    if manifest.skill_markdown.trim().is_empty() {
        manifest.skill_markdown =
            fs::read_to_string(root.join("SKILL.md")).map_err(AgentError::from)?;
    }
    Ok(Some(manifest))
}

pub fn write_user_skill(root: &Path, input: &SkillManifestInput) -> AgentResult<()> {
    let validation = validate_manifest(input);
    if !validation.ok {
        return Err(AgentError::InvalidRequest(validation.errors.join("; ")));
    }

    let skill_dir = root.join(&input.id);
    fs::create_dir_all(&skill_dir).map_err(AgentError::from)?;
    fs::write(skill_dir.join("SKILL.md"), &input.skill_markdown).map_err(AgentError::from)?;
    fs::write(
        skill_dir.join("gongkao-skill.json"),
        serde_json::to_string_pretty(input)?,
    )
    .map_err(AgentError::from)
}

pub fn managed_from_resolved(
    skill: &ResolvedSkill,
    state: Option<&SkillStateEntry>,
    include_markdown: bool,
) -> AgentResult<ManagedSkillInfo> {
    let manifest = read_manifest(&skill.root)?;
    let source = manifest
        .as_ref()
        .map(|item| item.source.clone())
        .unwrap_or_else(|| default_source(&skill.info.id));
    let trust = state
        .map(|item| item.trust.clone())
        .or_else(|| manifest.as_ref().map(|item| item.trust.clone()))
        .unwrap_or_else(|| default_trust(&source));
    let enabled = state
        .map(|item| item.enabled)
        .or_else(|| manifest.as_ref().map(|item| item.enabled))
        .unwrap_or_else(|| trust != "blocked");
    let validation = manifest
        .as_ref()
        .map(validate_manifest)
        .unwrap_or_else(|| validate_markdown_only(&skill.skill_markdown));

    Ok(ManagedSkillInfo {
        id: skill.info.id.clone(),
        name: manifest
            .as_ref()
            .map(|item| item.name.clone())
            .unwrap_or_else(|| skill.info.name.clone()),
        display_name: manifest.as_ref().and_then(|item| item.display_name.clone()),
        description: manifest
            .as_ref()
            .map(|item| item.description.clone())
            .unwrap_or_else(|| skill.info.description.clone()),
        path: skill.info.path.clone(),
        triggers: skill.info.triggers.clone(),
        scenario: manifest
            .as_ref()
            .and_then(|item| item.scenario.clone())
            .or_else(|| skill.info.triggers.first().cloned()),
        source,
        trust,
        enabled,
        inputs: manifest
            .as_ref()
            .map(|item| item.inputs.clone())
            .unwrap_or_default(),
        outputs: manifest
            .as_ref()
            .map(|item| item.outputs.clone())
            .unwrap_or_default(),
        required_capabilities: manifest
            .as_ref()
            .map(|item| item.required_capabilities.clone())
            .unwrap_or_else(|| {
                vec![
                    "fileRead".into(),
                    "fileWrite".into(),
                    "structuredOutput".into(),
                ]
            }),
        required_permissions: manifest
            .as_ref()
            .map(|item| item.required_permissions.clone())
            .unwrap_or_else(|| vec!["promptInject".into(), "fileRead".into(), "fileWrite".into()]),
        validation_status: if validation.ok {
            if validation.warnings.is_empty() {
                "valid".into()
            } else {
                "warning".into()
            }
        } else {
            "invalid".into()
        },
        validation_errors: validation.errors,
        last_test_run_id: state.and_then(|item| item.last_test_run_id.clone()),
        last_validated_at: state.and_then(|item| item.last_validated_at.clone()),
        skill_markdown: include_markdown.then(|| skill.skill_markdown.clone()),
    })
}

fn default_source(skill_id: &str) -> String {
    if BUILTIN_MATERIAL_SKILL_IDS.contains(&skill_id) {
        "built-in".into()
    } else {
        "user-local".into()
    }
}

fn default_trust(source: &str) -> String {
    match source {
        "built-in" => "trusted".into(),
        "external" => "blocked".into(),
        _ => "restricted".into(),
    }
}

fn validate_markdown_only(markdown: &str) -> SkillValidationResult {
    if markdown.trim_start().starts_with("---") {
        SkillValidationResult {
            ok: true,
            errors: Vec::new(),
            warnings: Vec::new(),
        }
    } else {
        SkillValidationResult {
            ok: false,
            errors: vec!["SKILL.md must include YAML frontmatter.".into()],
            warnings: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_like_skill_ids() {
        assert!(safe_skill_id("gongkao-parser"));
        assert!(!safe_skill_id("../parser"));
        assert!(!safe_skill_id("Parser"));
        assert!(!safe_skill_id("a"));
    }

    #[test]
    fn validates_required_manifest_fields() {
        let result = validate_manifest(&SkillManifestInput {
            id: "../bad".into(),
            name: "".into(),
            display_name: None,
            description: "".into(),
            scenario: None,
            source: "external".into(),
            trust: "blocked".into(),
            enabled: false,
            inputs: Vec::new(),
            outputs: Vec::new(),
            required_capabilities: Vec::new(),
            required_permissions: Vec::new(),
            skill_markdown: "# Missing frontmatter".into(),
        });

        assert!(!result.ok);
        assert_eq!(result.errors.len(), 4);
    }
}
