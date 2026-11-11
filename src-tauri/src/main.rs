#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agent;
mod material;
mod stt;

use agent::commands::{
    agent_cancel_run, agent_create_user_skill, agent_detect_adapters, agent_duplicate_skill,
    agent_get_material_run_result, agent_get_skill_detail, agent_list_managed_skills,
    agent_list_skills, agent_probe_run_status, agent_set_skill_state, agent_start_material_run,
    agent_start_skill_test_run, agent_update_user_skill, agent_validate_skill,
};
use agent::runner::AgentRunManager;
use material::{
    material_get_mineru_runtime_status, material_get_pdf_skill_runtime_status,
    material_install_mineru_runtime, material_parse_pdf_with_codex_skill,
    material_parse_pdf_with_mineru,
};
use std::sync::Arc;
use stt::commands::{
    stt_cancel, stt_cancel_model_download, stt_delete_model, stt_download_model,
    stt_get_selected_model, stt_health, stt_list_input_devices, stt_list_models,
    stt_open_microphone_privacy_settings, stt_restart, stt_save_last_capture_for_debug,
    stt_select_model, stt_start, stt_stop, stt_volc_test_connection, stt_volc_transcribe_pcm,
};
use stt::model_registry::SttModelManager;
use stt::session::SttSessionManager;
use tauri::Manager;

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .setup(|app| {
            let model_manager = Arc::new(SttModelManager::new(&app.handle())?);
            let manager = SttSessionManager::bootstrap(&app.handle(), Arc::clone(&model_manager));
            app.manage(model_manager);
            app.manage(manager);
            app.manage(Arc::new(AgentRunManager::new()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            agent_detect_adapters,
            agent_list_skills,
            agent_list_managed_skills,
            agent_get_skill_detail,
            agent_create_user_skill,
            agent_update_user_skill,
            agent_duplicate_skill,
            agent_set_skill_state,
            agent_validate_skill,
            agent_start_skill_test_run,
            agent_start_material_run,
            agent_cancel_run,
            agent_probe_run_status,
            agent_get_material_run_result,
            material_get_mineru_runtime_status,
            material_get_pdf_skill_runtime_status,
            material_install_mineru_runtime,
            material_parse_pdf_with_codex_skill,
            material_parse_pdf_with_mineru,
            stt_health,
            stt_start,
            stt_stop,
            stt_cancel,
            stt_restart,
            stt_list_input_devices,
            stt_open_microphone_privacy_settings,
            stt_save_last_capture_for_debug,
            stt_list_models,
            stt_get_selected_model,
            stt_download_model,
            stt_cancel_model_download,
            stt_delete_model,
            stt_select_model,
            stt_volc_test_connection,
            stt_volc_transcribe_pcm
        ])
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}
