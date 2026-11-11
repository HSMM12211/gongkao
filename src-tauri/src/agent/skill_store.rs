use super::errors::{AgentError, AgentResult};
use super::skill_manifest::{managed_from_resolved, safe_skill_id, write_user_skill};
use super::skills::{resolve_skill, resolve_skills};
use super::types::{ManagedSkillInfo, SkillManifestInput, SkillStateEntry, SkillValidationResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

#[derive(Debug, Default, Serialize, Deserialize)]
struct SkillStateFile {
    version: u8,
    skills: HashMap<String, SkillStateEntry>,
}

fn user_skill_root(app: &AppHandle) -> AgentResult<PathBuf> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| AgentError::Io(error.to_string()))?
        .join("agent-skills");
    fs::create_dir_all(&root).map_err(AgentError::from)?;
    Ok(root)
}

fn state_path(app: &AppHandle) -> AgentResult<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| AgentError::Io(error.to_string()))?
        .join("agent-skills-state.json"))
}

fn load_state(app: &AppHandle) -> AgentResult<SkillStateFile> {
    let path = state_path(app)?;
    if !path.exists() {
        return Ok(SkillStateFile {
            version: 1,
            skills: HashMap::new(),
        });
    }
    let raw = fs::read_to_string(path).map_err(AgentError::from)?;
    serde_json::from_str(&raw).map_err(AgentError::from)
}

fn save_state(app: &AppHandle, state: &SkillStateFile) -> AgentResult<()> {
    fs::write(state_path(app)?, serde_json::to_string_pretty(state)?).map_err(AgentError::from)
}

pub fn list_managed_skills(app: &AppHandle) -> AgentResult<Vec<ManagedSkillInfo>> {
    let state = load_state(app)?;
    let mut out = Vec::new();
    for skill in resolve_skills(app)? {
        let entry = state.skills.get(&skill.info.id);
        out.push(managed_from_resolved(&skill, entry, false)?);
    }
    out.sort_by(|a, b| {
        source_rank(&a.source)
            .cmp(&source_rank(&b.source))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(out)
}

pub fn get_managed_skill(app: &AppHandle, skill_id: &str) -> AgentResult<ManagedSkillInfo> {
    if !safe_skill_id(skill_id) {
        return Err(AgentError::InvalidRequest("Unsafe skill id.".into()));
    }
    let state = load_state(app)?;
    let resolved = resolve_skill(app, skill_id)?;
    managed_from_resolved(&resolved, state.skills.get(&resolved.info.id), true)
}

pub fn create_user_skill(
    app: &AppHandle,
    input: SkillManifestInput,
) -> AgentResult<ManagedSkillInfo> {
    if !safe_skill_id(&input.id) {
        return Err(AgentError::InvalidRequest("Unsafe skill id.".into()));
    }
    if resolve_skills(app)?
        .into_iter()
        .any(|skill| skill.info.id == input.id)
    {
        return Err(AgentError::InvalidRequest(format!(
            "Skill already exists: {}",
            input.id
        )));
    }
    write_user_skill(&user_skill_root(app)?, &input)?;
    set_skill_state(app, &input.id, input.enabled, input.trust.clone())
}

pub fn update_user_skill(
    app: &AppHandle,
    skill_id: &str,
    input: SkillManifestInput,
) -> AgentResult<ManagedSkillInfo> {
    if skill_id != input.id || !safe_skill_id(skill_id) {
        return Err(AgentError::InvalidRequest(
            "Unsafe or mismatched skill id.".into(),
        ));
    }
    let root = user_skill_root(app)?;
    let skill_dir = root.join(skill_id);
    if !skill_dir.exists() {
        return Err(AgentError::InvalidRequest(
            "Only user-local Skills can be edited directly.".into(),
        ));
    }
    write_user_skill(&root, &input)?;
    set_skill_state(app, &input.id, input.enabled, input.trust.clone())
}

pub fn duplicate_skill(app: &AppHandle, skill_id: &str) -> AgentResult<ManagedSkillInfo> {
    if !safe_skill_id(skill_id) {
        return Err(AgentError::InvalidRequest("Unsafe skill id.".into()));
    }
    let source = resolve_skill(app, skill_id)?;
    let new_id = available_copy_id(app, &source.info.id)?;
    let input = SkillManifestInput {
        id: new_id.clone(),
        name: new_id.clone(),
        display_name: Some(format!("{} 副本", source.info.name)),
        description: source.info.description,
        scenario: source.info.triggers.first().cloned(),
        source: "user-local".into(),
        trust: "restricted".into(),
        enabled: false,
        inputs: Vec::new(),
        outputs: Vec::new(),
        required_capabilities: vec![
            "fileRead".into(),
            "fileWrite".into(),
            "structuredOutput".into(),
        ],
        required_permissions: vec!["promptInject".into(), "fileRead".into(), "fileWrite".into()],
        skill_markdown: source.skill_markdown,
    };
    create_user_skill(app, input)
}

pub fn set_skill_state(
    app: &AppHandle,
    skill_id: &str,
    enabled: bool,
    trust: String,
) -> AgentResult<ManagedSkillInfo> {
    if !safe_skill_id(skill_id) {
        return Err(AgentError::InvalidRequest("Unsafe skill id.".into()));
    }
    if !matches!(trust.as_str(), "trusted" | "restricted" | "blocked") {
        return Err(AgentError::InvalidRequest("Invalid trust value.".into()));
    }
    let _ = resolve_skill(app, skill_id)?;
    let mut state = load_state(app)?;
    let previous = state.skills.get(skill_id).cloned();
    state.skills.insert(
        skill_id.to_string(),
        SkillStateEntry {
            enabled,
            trust,
            last_test_run_id: previous
                .as_ref()
                .and_then(|item| item.last_test_run_id.clone()),
            last_validated_at: previous.and_then(|item| item.last_validated_at),
        },
    );
    save_state(app, &state)?;
    get_managed_skill(app, skill_id)
}

pub fn validate_skill_by_id(app: &AppHandle, skill_id: &str) -> AgentResult<SkillValidationResult> {
    let skill = get_managed_skill(app, skill_id)?;
    Ok(SkillValidationResult {
        ok: skill.validation_errors.is_empty(),
        errors: skill.validation_errors,
        warnings: Vec::new(),
    })
}

pub fn mark_skill_test_run(app: &AppHandle, skill_id: &str, run_id: String) -> AgentResult<()> {
    if !safe_skill_id(skill_id) {
        return Err(AgentError::InvalidRequest("Unsafe skill id.".into()));
    }
    let current = get_managed_skill(app, skill_id)?;
    let mut state = load_state(app)?;
    state.skills.insert(
        skill_id.to_string(),
        SkillStateEntry {
            enabled: current.enabled,
            trust: current.trust,
            last_test_run_id: Some(run_id),
            last_validated_at: Some(now_stamp()),
        },
    );
    save_state(app, &state)
}

fn available_copy_id(app: &AppHandle, skill_id: &str) -> AgentResult<String> {
    let existing: Vec<String> = resolve_skills(app)?
        .into_iter()
        .map(|skill| skill.info.id)
        .collect();
    for index in 1..=99 {
        let candidate = if index == 1 {
            format!("{skill_id}-copy")
        } else {
            format!("{skill_id}-copy-{index}")
        };
        if safe_skill_id(&candidate) && !existing.iter().any(|id| id == &candidate) {
            return Ok(candidate);
        }
    }
    Err(AgentError::InvalidRequest(
        "Unable to find an available copy id.".into(),
    ))
}

fn now_stamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_default()
}

fn source_rank(source: &str) -> u8 {
    match source {
        "built-in" => 0,
        "user-local" => 1,
        "external" => 2,
        _ => 3,
    }
}
