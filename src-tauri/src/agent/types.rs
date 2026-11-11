use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DetectedAgentAdapter {
    pub id: String,
    pub name: String,
    pub available: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub auth_status: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentSkillInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub path: String,
    pub triggers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillInputField {
    pub name: String,
    pub label: String,
    pub r#type: String,
    pub required: Option<bool>,
    pub values: Option<Vec<String>>,
    pub default: Option<serde_json::Value>,
    pub placeholder: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedSkillInfo {
    pub id: String,
    pub name: String,
    pub display_name: Option<String>,
    pub description: String,
    pub path: String,
    pub triggers: Vec<String>,
    pub scenario: Option<String>,
    pub source: String,
    pub trust: String,
    pub enabled: bool,
    pub inputs: Vec<SkillInputField>,
    pub outputs: Vec<String>,
    pub required_capabilities: Vec<String>,
    pub required_permissions: Vec<String>,
    pub validation_status: String,
    pub validation_errors: Vec<String>,
    pub last_test_run_id: Option<String>,
    pub last_validated_at: Option<String>,
    pub skill_markdown: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillStateEntry {
    pub enabled: bool,
    pub trust: String,
    pub last_test_run_id: Option<String>,
    pub last_validated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillManifestInput {
    pub id: String,
    pub name: String,
    pub display_name: Option<String>,
    pub description: String,
    pub scenario: Option<String>,
    pub source: String,
    pub trust: String,
    pub enabled: bool,
    pub inputs: Vec<SkillInputField>,
    pub outputs: Vec<String>,
    pub required_capabilities: Vec<String>,
    pub required_permissions: Vec<String>,
    #[serde(default)]
    pub skill_markdown: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillValidationResult {
    pub ok: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillTestRunRequest {
    pub skill_id: String,
    pub sample_topic: String,
    pub sample_instruction: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartMaterialAgentRunRequest {
    pub adapter_id: String,
    pub model: String,
    pub reasoning: String,
    pub skill_id: String,
    pub title: String,
    pub topic: String,
    pub source_text: String,
    pub source_type: String,
    pub original_name: Option<String>,
    pub user_instruction: String,
    #[serde(default)]
    pub skill_input_values: Option<serde_json::Value>,
    #[serde(default)]
    pub context: Option<serde_json::Value>,
    #[serde(default)]
    pub required_capabilities: Option<Vec<String>>,
    #[serde(default)]
    pub adapter_capabilities: Option<Vec<String>>,
    #[serde(default)]
    pub skill_trust: Option<String>,
    #[serde(default)]
    pub skill_source: Option<String>,
    #[serde(default)]
    pub required_permissions: Option<Vec<String>>,
    #[serde(default)]
    pub prompt_budget: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartedAgentRun {
    pub run_id: String,
    pub workspace_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MaterialAgentRunResult {
    pub run_id: String,
    pub workspace_path: String,
    pub output_json: String,
    pub report_markdown: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunStatusProbe {
    pub status: String,
    pub summary: String,
    pub error: Option<String>,
    pub has_material_draft: bool,
    pub has_report: bool,
    pub has_trace: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunEvent {
    pub run_id: String,
    pub kind: String,
    pub message: String,
    pub timestamp: String,
    pub event_type: Option<String>,
    pub raw: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct RunWorkspace {
    pub run_id: String,
    pub path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct ResolvedSkill {
    pub info: AgentSkillInfo,
    pub root: PathBuf,
    pub skill_markdown: String,
}
