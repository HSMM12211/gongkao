use super::errors::{AgentError, AgentResult};
use super::frontmatter::parse_skill_markdown;
use super::types::{AgentSkillInfo, ResolvedSkill};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const BUILTIN_SKILLS: [&str; 7] = [
    "gongkao-hotspot-collector",
    "gongkao-material-parser",
    "gongkao-source-verifier",
    "gongkao-question-generator",
    "gongkao-copybook-extractor",
    "gongkao-smoke-test-skill",
    "gongkao-topic-wiki-curator",
];

fn candidate_project_skill_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let Ok(mut current) = std::env::current_dir() else {
        return dirs;
    };
    loop {
        let skills = current.join("skills");
        if skills.exists() {
            dirs.push(skills);
        }
        if !current.pop() {
            break;
        }
    }
    dirs
}

fn skill_info_from_dir(dir: &Path) -> AgentResult<Option<ResolvedSkill>> {
    let skill_path = dir.join("SKILL.md");
    if !skill_path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&skill_path).map_err(AgentError::from)?;
    let parsed = parse_skill_markdown(&raw);
    let fallback_id = dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("agent-skill")
        .to_string();
    let id = parsed.name.clone().unwrap_or(fallback_id);
    let description = parsed.description.clone().unwrap_or_default();
    Ok(Some(ResolvedSkill {
        info: AgentSkillInfo {
            id: id.clone(),
            name: id,
            description,
            path: dir.to_string_lossy().to_string(),
            triggers: parsed.triggers,
        },
        root: dir.to_path_buf(),
        skill_markdown: raw,
    }))
}

pub fn list_skills(app: &AppHandle) -> AgentResult<Vec<AgentSkillInfo>> {
    Ok(resolve_skills(app)?
        .into_iter()
        .map(|skill| skill.info)
        .collect())
}

pub fn resolve_skills(app: &AppHandle) -> AgentResult<Vec<ResolvedSkill>> {
    let mut roots = Vec::new();
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let user_root = app_data_dir.join("agent-skills");
        fs::create_dir_all(&user_root).map_err(AgentError::from)?;
        roots.push(user_root);
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push(resource_dir.join("_up_").join("skills"));
    }
    roots.extend(candidate_project_skill_dirs());

    let mut skills = Vec::new();
    for root in roots {
        for slug in BUILTIN_SKILLS {
            if let Some(skill) = skill_info_from_dir(&root.join(slug))? {
                if !skills
                    .iter()
                    .any(|existing: &ResolvedSkill| existing.info.id == skill.info.id)
                {
                    skills.push(skill);
                }
            }
        }

        let Ok(entries) = fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            if let Some(skill) = skill_info_from_dir(&path)? {
                if !skills
                    .iter()
                    .any(|existing| existing.info.id == skill.info.id)
                {
                    skills.push(skill);
                }
            }
        }
    }

    Ok(skills)
}

pub fn resolve_skill(app: &AppHandle, skill_id: &str) -> AgentResult<ResolvedSkill> {
    resolve_skills(app)?
        .into_iter()
        .find(|skill| skill.info.id == skill_id)
        .ok_or_else(|| AgentError::SkillNotFound(format!("Skill not found: {skill_id}")))
}
