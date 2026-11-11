use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, State};

use super::adapters::detect_adapters;
use super::errors::AgentResult;
use super::runner::AgentRunManager;
use super::skills::list_skills;
use super::types::{
    AgentRunStatusProbe, AgentSkillInfo, DetectedAgentAdapter, ManagedSkillInfo,
    MaterialAgentRunResult, SkillManifestInput, SkillTestRunRequest, SkillValidationResult,
    StartMaterialAgentRunRequest, StartedAgentRun,
};

#[tauri::command]
pub fn agent_detect_adapters() -> Vec<DetectedAgentAdapter> {
    detect_adapters()
}

#[tauri::command]
pub fn agent_list_skills(app: AppHandle) -> AgentResult<Vec<AgentSkillInfo>> {
    list_skills(&app)
}

#[tauri::command]
pub fn agent_list_managed_skills(app: AppHandle) -> AgentResult<Vec<ManagedSkillInfo>> {
    super::skill_store::list_managed_skills(&app)
}

#[tauri::command]
pub fn agent_get_skill_detail(app: AppHandle, skill_id: String) -> AgentResult<ManagedSkillInfo> {
    super::skill_store::get_managed_skill(&app, &skill_id)
}

#[tauri::command]
pub fn agent_create_user_skill(
    app: AppHandle,
    input: SkillManifestInput,
) -> AgentResult<ManagedSkillInfo> {
    super::skill_store::create_user_skill(&app, input)
}

#[tauri::command]
pub fn agent_update_user_skill(
    app: AppHandle,
    skill_id: String,
    input: SkillManifestInput,
) -> AgentResult<ManagedSkillInfo> {
    super::skill_store::update_user_skill(&app, &skill_id, input)
}

#[tauri::command]
pub fn agent_duplicate_skill(app: AppHandle, skill_id: String) -> AgentResult<ManagedSkillInfo> {
    super::skill_store::duplicate_skill(&app, &skill_id)
}

#[tauri::command]
pub fn agent_set_skill_state(
    app: AppHandle,
    skill_id: String,
    enabled: bool,
    trust: String,
) -> AgentResult<ManagedSkillInfo> {
    super::skill_store::set_skill_state(&app, &skill_id, enabled, trust)
}

#[tauri::command]
pub fn agent_validate_skill(
    app: AppHandle,
    skill_id: String,
) -> AgentResult<SkillValidationResult> {
    super::skill_store::validate_skill_by_id(&app, &skill_id)
}

#[tauri::command]
pub fn agent_start_material_run(
    app: AppHandle,
    manager: State<'_, Arc<AgentRunManager>>,
    request: StartMaterialAgentRunRequest,
) -> AgentResult<StartedAgentRun> {
    manager.start_material_run(app, request)
}

#[tauri::command]
pub fn agent_start_skill_test_run(
    app: AppHandle,
    manager: State<'_, Arc<AgentRunManager>>,
    request: SkillTestRunRequest,
) -> AgentResult<StartedAgentRun> {
    let skill = super::skill_store::get_managed_skill(&app, &request.skill_id)?;
    if !skill.enabled || skill.trust == "blocked" {
        return Err(super::errors::AgentError::InvalidRequest(
            "Skill is disabled or blocked.".into(),
        ));
    }
    let topic = if request.sample_topic.trim().is_empty() {
        "Skill 测试".to_string()
    } else {
        request.sample_topic
    };
    let instruction = if request.sample_instruction.trim().is_empty() {
        "请基于测试素材生成一份 material-draft.json，用于验证 Skill 输出合同。".to_string()
    } else {
        request.sample_instruction
    };
    let started =
        manager.start_material_run(
            app.clone(),
            StartMaterialAgentRunRequest {
                adapter_id: "codex".into(),
                model: "gpt-5.5".into(),
                reasoning: "medium".into(),
                skill_id: request.skill_id.clone(),
                title: format!("{topic} Skill 测试"),
                topic,
                source_text:
                    "这是一段用于验证公考素材 Skill 的测试文本，包含主题、问题、对策和规范表达。"
                        .into(),
                source_type: "text".into(),
                original_name: None,
                user_instruction: instruction,
                skill_input_values: None,
                context: None,
                required_capabilities: None,
                adapter_capabilities: None,
                skill_trust: None,
                skill_source: None,
                required_permissions: None,
                prompt_budget: None,
            },
        )?;
    super::skill_store::mark_skill_test_run(&app, &request.skill_id, started.run_id.clone())?;
    Ok(started)
}

#[tauri::command]
pub fn agent_cancel_run(
    manager: State<'_, Arc<AgentRunManager>>,
    run_id: String,
) -> AgentResult<()> {
    manager.cancel_run(&run_id)
}

#[tauri::command]
pub fn agent_probe_run_status(
    manager: State<'_, Arc<AgentRunManager>>,
    workspace_path: String,
) -> AgentRunStatusProbe {
    manager.probe_run_status(PathBuf::from(workspace_path))
}

#[tauri::command]
pub fn agent_get_material_run_result(
    manager: State<'_, Arc<AgentRunManager>>,
    run_id: String,
) -> AgentResult<MaterialAgentRunResult> {
    manager.get_material_run_result(&run_id)
}
