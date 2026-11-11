# Skill Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real Skill management center under Materials so Gongkao users can create, import, inspect, authorize, test, and enable material-processing Skills, then use those Skills from the Materials workbench.

**Architecture:** Keep `/materials` as the primary material workbench and add `/materials/skills` as a second-level management page. The React layer owns the Skill management UI and typed validation helpers; the Tauri agent backend owns filesystem-safe Skill CRUD, trust/enabled state, import validation, isolated test runs, and `SKILL.md` reads/writes. Skills still run only inside isolated `agent-runs` workspaces and final material writes still go through Inbox review.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, shadcn UI, lucide-react, Vitest, Tauri 2, Rust `serde`, Rust filesystem APIs, existing CLI Agent runtime.

---

## Current Baseline

Already implemented:

- `app/materials/page.tsx` is the Materials knowledge-base workbench.
- `components/agent/agent-executor-menu.tsx` owns the global Codex CLI / Claude Code selector.
- `lib/agent/skill-inputs.ts` defines built-in material Skill metadata, inputs, permissions, trust, and execution validation.
- `types/agent-runtime.ts` already carries extended Skill metadata on the frontend.
- `src-tauri/src/agent/skills.rs` scans app data, resources, and project `skills/` folders.
- `src-tauri/src/agent/workspace.rs` stages a selected Skill into isolated run workspaces.
- `src-tauri/src/agent/runner.rs` executes selected Skills through the configured Agent Adapter and returns `material-draft.json`.

Missing for this feature:

- A `/materials/skills` page.
- A Materials second-level navigation component.
- Backend commands for Skill detail, create, update, duplicate, import, export, validate, state changes, and test runs.
- Persistent per-Skill enabled/trust state separate from source files.
- A Skill detail schema that can round-trip `SKILL.md`, structured inputs, permissions, output contract, and validation/test state.
- A frontend bridge for the new Tauri Skill management commands.
- Tests that prevent unsafe paths, direct database writes, and external Skill execution without review.

## Product Boundaries

- `Skill 管理` is not a top-level app module. It lives under `素材知识库`.
- The first second-level routes are `素材工作台`, `Skill 管理`, `Agent 运行中心`, and `Inbox 审核`.
- This feature manages Gongkao material Skills. It does not manage Codex development skills under `.codex/skills`.
- Supported Agent Adapters remain Codex CLI and Claude Code.
- Obsidian is out of scope.
- Built-in Skills are read-only. Users can duplicate them into user-local Skills before editing.
- External imported Skills default to `restricted` or `blocked` until the user explicitly reviews trust and permissions.
- Skill execution never writes formal IndexedDB material stores directly. Output goes to `material-draft.json`, schema validation, Inbox, then user-confirmed import.

## File Structure

### Create

- `components/materials/materials-secondary-nav.tsx`  
  Shared second-level navigation for `/materials`, `/materials/skills`, `/materials/runs`, and `/materials/inbox`.

- `app/materials/skills/page.tsx`  
  Skill management page matching the approved HTML mockup: Skill list, filters, detail panel, structured inputs, permissions, prompt budget, test run, and editor preview.

- `app/materials/runs/page.tsx`  
  Lightweight route that hosts the existing run-center concept and can be expanded later. The initial version may show stored run records and links back to `/materials`.

- `app/materials/inbox/page.tsx`  
  Lightweight route for material Inbox review. It reuses existing `materialInboxRepository` data and links back to `/materials`.

- `lib/agent/skill-management.ts`  
  Frontend Skill management bridge, DTOs, normalization helpers, and validation wrappers.

- `test/lib/agent/skill-management.test.ts`  
  Tests for Skill manifest normalization, trust gating, and command payload validation.

- `src-tauri/src/agent/skill_manifest.rs`  
  Rust DTOs and parsers for `gongkao-skill.json` plus fallback metadata from `SKILL.md`.

- `src-tauri/src/agent/skill_store.rs`  
  Filesystem-safe CRUD for user-local Skills and persistent state in app data.

### Modify

- `components/app-shell.tsx`  
  Add second-level navigation below `素材知识库` when the current path starts with `/materials`.

- `app/materials/page.tsx`  
  Add shared secondary nav and ensure the workbench reads only enabled Skills. Add a link to `/materials/skills` from the Skill picker empty/diagnostic state.

- `components/agent/agent-executor-menu.tsx`  
  Keep current global Agent behavior. No page-local Agent selector should be introduced.

- `types/agent-runtime.ts`  
  Add complete Skill management DTOs and Tauri command signatures.

- `lib/agent/skill-inputs.ts`  
  Keep built-in definitions but export conversion helpers for `SkillManifest`.

- `src-tauri/src/agent/types.rs`  
  Add Rust DTOs for complete Skill metadata, Skill state, and management command payloads.

- `src-tauri/src/agent/commands.rs`  
  Register new Skill management commands.

- `src-tauri/src/agent/skills.rs`  
  Merge discovered Skills with manifest/state data and return complete metadata.

- `src-tauri/src/agent/workspace.rs`  
  Reuse existing isolated staging for test runs. No direct DB write permissions are added.

- `src-tauri/src/main.rs`  
  Register new commands if command registration is explicit in this file.

- `src-tauri/Cargo.toml`  
  Add `zip` only if import/export is implemented with zip archives in this phase. Prefer folder import first if the archive dependency is unnecessary.

## Data Contracts

### Skill State File

Store mutable state in app data:

```text
<appData>/agent-skills-state.json
```

Shape:

```json
{
  "version": 1,
  "skills": {
    "gongkao-hotspot-collector": {
      "enabled": true,
      "trust": "trusted",
      "lastTestRunId": "run-id",
      "lastValidatedAt": "2026-05-27T10:00:00.000Z"
    }
  }
}
```

### Optional Skill Manifest File

Each Skill folder may include:

```text
gongkao-skill.json
```

Shape:

```json
{
  "schemaVersion": 1,
  "id": "gongkao-hotspot-collector",
  "displayName": "申论热点采集器",
  "source": "built-in",
  "trust": "trusted",
  "enabled": true,
  "scenario": "热点追踪",
  "inputs": [
    { "name": "topic", "label": "主题", "type": "string", "required": true }
  ],
  "outputs": ["专题摘要", "金句", "温故卡", "申论题"],
  "requiredCapabilities": ["fileRead", "fileWrite", "structuredOutput"],
  "requiredPermissions": ["promptInject", "fileRead", "fileWrite", "network"]
}
```

When `gongkao-skill.json` is missing, the backend falls back to `SKILL.md` frontmatter plus frontend built-in metadata where available.

## Task 1: Add Materials Second-Level Navigation

**Files:**

- Create: `components/materials/materials-secondary-nav.tsx`
- Modify: `components/app-shell.tsx`

- [ ] **Step 1: Create navigation component**

Create `components/materials/materials-secondary-nav.tsx`:

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Inbox, Layers3, WandSparkles } from "lucide-react"
import { cn } from "@/lib/utils"

const MATERIALS_NAV = [
  { href: "/materials", label: "素材工作台", icon: Layers3, exact: true },
  { href: "/materials/skills", label: "Skill 管理", icon: WandSparkles },
  { href: "/materials/runs", label: "Agent 运行中心", icon: Activity },
  { href: "/materials/inbox", label: "Inbox 审核", icon: Inbox },
]

export function MaterialsSecondaryNav({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname()

  return (
    <div className={cn("space-y-1", compact ? "pl-12 pr-2" : "mb-5 flex flex-wrap gap-2")}>
      {MATERIALS_NAV.map((item) => {
        const Icon = item.icon
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              compact
                ? "flex h-8 items-center gap-2 rounded-full px-3 text-xs"
                : "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm",
              active
                ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Render compact nav in the sidebar**

In `components/app-shell.tsx`, import:

```tsx
import { MaterialsSecondaryNav } from "@/components/materials/materials-secondary-nav"
```

Inside the `NAV.map` render, after the `/materials` link, render:

```tsx
{n.href === "/materials" && pathname.startsWith("/materials") ? <MaterialsSecondaryNav compact /> : null}
```

- [ ] **Step 3: Run type check**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: no type errors from the new nav component.

## Task 2: Define Frontend Skill Management Types

**Files:**

- Create: `lib/agent/skill-management.ts`
- Modify: `types/agent-runtime.ts`
- Modify: `lib/agent/skill-inputs.ts`
- Test: `test/lib/agent/skill-management.test.ts`

- [ ] **Step 1: Write normalization tests**

Create `test/lib/agent/skill-management.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { normalizeManagedSkill, validateManagedSkillBeforeRun } from "@/lib/agent/skill-management"

describe("skill management", () => {
  it("normalizes missing management fields conservatively", () => {
    const skill = normalizeManagedSkill({
      id: "external-web-collector",
      name: "external-web-collector",
      description: "External collector",
      path: "C:/skills/external-web-collector",
      triggers: [],
      requiredPermissions: ["network", "subprocess"],
    })

    expect(skill.source).toBe("external")
    expect(skill.trust).toBe("blocked")
    expect(skill.enabled).toBe(false)
  })

  it("blocks disabled or blocked skills before execution", () => {
    const errors = validateManagedSkillBeforeRun({
      id: "external-web-collector",
      name: "external-web-collector",
      description: "External collector",
      path: "C:/skills/external-web-collector",
      triggers: [],
      source: "external",
      trust: "blocked",
      enabled: false,
      inputs: [],
      outputs: [],
      requiredCapabilities: [],
      requiredPermissions: ["network"],
    })

    expect(errors).toContain("Skill 已禁用")
    expect(errors).toContain("Skill 已被阻止")
  })
})
```

- [ ] **Step 2: Extend runtime DTOs**

In `types/agent-runtime.ts`, add:

```ts
export type ManagedSkillInfo = AgentSkillInfo & {
  displayName?: string
  scenario?: string
  enabled: boolean
  source: MaterialSkillSource
  trust: MaterialSkillTrust
  validationStatus: "valid" | "warning" | "invalid" | "unknown"
  validationErrors: string[]
  lastTestRunId?: string
  lastValidatedAt?: string
  skillMarkdown?: string
}

export type SkillManifestInput = Pick<
  ManagedSkillInfo,
  | "id"
  | "name"
  | "description"
  | "displayName"
  | "scenario"
  | "source"
  | "trust"
  | "enabled"
  | "inputs"
  | "outputs"
  | "requiredCapabilities"
  | "requiredPermissions"
> & {
  skillMarkdown: string
}

export type SkillValidationResult = {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export type SkillTestRunRequest = {
  skillId: string
  sampleTopic: string
  sampleInstruction: string
}
```

Extend `TauriAgentRuntime`:

```ts
  listManagedSkills: () => Promise<ManagedSkillInfo[]>
  getSkillDetail: (skillId: string) => Promise<ManagedSkillInfo>
  createUserSkill: (input: SkillManifestInput) => Promise<ManagedSkillInfo>
  updateUserSkill: (skillId: string, input: SkillManifestInput) => Promise<ManagedSkillInfo>
  duplicateSkill: (skillId: string) => Promise<ManagedSkillInfo>
  setSkillState: (skillId: string, enabled: boolean, trust: MaterialSkillTrust) => Promise<ManagedSkillInfo>
  validateSkill: (skillId: string) => Promise<SkillValidationResult>
  startSkillTestRun: (request: SkillTestRunRequest) => Promise<StartedAgentRun>
```

- [ ] **Step 3: Implement frontend helpers**

Create `lib/agent/skill-management.ts`:

```ts
import type { ManagedSkillInfo, SkillManifestInput } from "@/types/agent-runtime"

export function normalizeManagedSkill(skill: Partial<ManagedSkillInfo> & Pick<ManagedSkillInfo, "id" | "name" | "description" | "path" | "triggers">): ManagedSkillInfo {
  const hasRiskyPermission = (skill.requiredPermissions ?? []).some(
    (permission) => permission === "network" || permission === "subprocess",
  )
  const source = skill.source ?? (hasRiskyPermission ? "external" : "user-local")
  const trust = skill.trust ?? (source === "external" ? "blocked" : "restricted")

  return {
    ...skill,
    source,
    trust,
    enabled: skill.enabled ?? (trust !== "blocked"),
    validationStatus: skill.validationStatus ?? "unknown",
    validationErrors: skill.validationErrors ?? [],
    inputs: skill.inputs ?? [],
    outputs: skill.outputs ?? [],
    requiredCapabilities: skill.requiredCapabilities ?? [],
    requiredPermissions: skill.requiredPermissions ?? [],
  }
}

export function validateManagedSkillBeforeRun(skill: ManagedSkillInfo): string[] {
  const errors: string[] = []
  if (!skill.enabled) errors.push("Skill 已禁用")
  if (skill.trust === "blocked") errors.push("Skill 已被阻止")
  if (skill.validationStatus === "invalid") errors.push("Skill 校验未通过")
  return errors
}

export function validateSkillManifestInput(input: SkillManifestInput): string[] {
  const errors: string[] = []
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(input.id)) errors.push("Skill ID 必须是 2-63 位小写字母、数字或短横线")
  if (!input.name.trim()) errors.push("Skill 名称不能为空")
  if (!input.description.trim()) errors.push("Skill 描述不能为空")
  if (!input.skillMarkdown.includes("---")) errors.push("SKILL.md 必须包含 YAML frontmatter")
  return errors
}
```

- [ ] **Step 4: Run targeted test**

Run:

```powershell
npm.cmd run test -- test/lib/agent/skill-management.test.ts
```

Expected: pass.

## Task 3: Add Tauri Skill Manifest And Store Layer

**Files:**

- Create: `src-tauri/src/agent/skill_manifest.rs`
- Create: `src-tauri/src/agent/skill_store.rs`
- Modify: `src-tauri/src/agent/mod.rs`
- Modify: `src-tauri/src/agent/types.rs`

- [ ] **Step 1: Add Rust DTOs**

In `src-tauri/src/agent/types.rs`, add:

```rust
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
```

- [ ] **Step 2: Create manifest helpers**

Create `src-tauri/src/agent/skill_manifest.rs` with functions:

```rust
use super::errors::{AgentError, AgentResult};
use super::types::{ManagedSkillInfo, ResolvedSkill, SkillManifestInput, SkillValidationResult};
use std::fs;
use std::path::Path;

pub fn safe_skill_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 63
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
    if !safe_skill_id(&input.id) {
        errors.push("Skill ID must use lowercase letters, digits, and hyphens.".to_string());
    }
    if input.name.trim().is_empty() {
        errors.push("Skill name is required.".to_string());
    }
    if input.description.trim().is_empty() {
        errors.push("Skill description is required.".to_string());
    }
    if !input.skill_markdown.contains("---") {
        errors.push("SKILL.md must include YAML frontmatter.".to_string());
    }
    SkillValidationResult {
        ok: errors.is_empty(),
        errors,
        warnings: Vec::new(),
    }
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
    .map_err(AgentError::from)?;
    Ok(())
}
```

- [ ] **Step 3: Create store helpers**

Create `src-tauri/src/agent/skill_store.rs` with functions:

```rust
use super::errors::{AgentError, AgentResult};
use super::skill_manifest::{safe_skill_id, validate_manifest, write_user_skill};
use super::skills::{resolve_skill, resolve_skills};
use super::types::{ManagedSkillInfo, SkillManifestInput, SkillStateEntry, SkillValidationResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use tauri::{AppHandle, Manager};

#[derive(Debug, Default, Serialize, Deserialize)]
struct SkillStateFile {
    version: u8,
    skills: HashMap<String, SkillStateEntry>,
}

fn user_skill_root(app: &AppHandle) -> AgentResult<std::path::PathBuf> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| AgentError::Io(error.to_string()))?
        .join("agent-skills");
    fs::create_dir_all(&root).map_err(AgentError::from)?;
    Ok(root)
}

fn state_path(app: &AppHandle) -> AgentResult<std::path::PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| AgentError::Io(error.to_string()))?
        .join("agent-skills-state.json"))
}

fn load_state(app: &AppHandle) -> AgentResult<SkillStateFile> {
    let path = state_path(app)?;
    if !path.exists() {
        return Ok(SkillStateFile { version: 1, skills: HashMap::new() });
    }
    Ok(serde_json::from_str(&fs::read_to_string(path).map_err(AgentError::from)?)?)
}

fn save_state(app: &AppHandle, state: &SkillStateFile) -> AgentResult<()> {
    fs::write(state_path(app)?, serde_json::to_string_pretty(state)?).map_err(AgentError::from)
}

pub fn list_managed_skills(app: &AppHandle) -> AgentResult<Vec<ManagedSkillInfo>> {
    let state = load_state(app)?;
    let mut out = Vec::new();
    for skill in resolve_skills(app)? {
        let entry = state.skills.get(&skill.info.id);
        out.push(ManagedSkillInfo {
            id: skill.info.id.clone(),
            name: skill.info.name.clone(),
            display_name: None,
            description: skill.info.description.clone(),
            path: skill.info.path.clone(),
            triggers: skill.info.triggers.clone(),
            scenario: skill.info.triggers.first().cloned(),
            source: "user-local".to_string(),
            trust: entry.map(|item| item.trust.clone()).unwrap_or_else(|| "restricted".to_string()),
            enabled: entry.map(|item| item.enabled).unwrap_or(true),
            inputs: Vec::new(),
            outputs: Vec::new(),
            required_capabilities: Vec::new(),
            required_permissions: Vec::new(),
            validation_status: "unknown".to_string(),
            validation_errors: Vec::new(),
            last_test_run_id: entry.and_then(|item| item.last_test_run_id.clone()),
            last_validated_at: entry.and_then(|item| item.last_validated_at.clone()),
            skill_markdown: None,
        });
    }
    Ok(out)
}

pub fn get_managed_skill(app: &AppHandle, skill_id: &str) -> AgentResult<ManagedSkillInfo> {
    let resolved = resolve_skill(app, skill_id)?;
    let mut skill = list_managed_skills(app)?
        .into_iter()
        .find(|item| item.id == resolved.info.id)
        .ok_or_else(|| AgentError::SkillNotFound(format!("Skill not found: {skill_id}")))?;
    skill.skill_markdown = Some(resolved.skill_markdown);
    Ok(skill)
}

pub fn create_user_skill(app: &AppHandle, input: SkillManifestInput) -> AgentResult<ManagedSkillInfo> {
    if !safe_skill_id(&input.id) {
        return Err(AgentError::InvalidRequest("Unsafe skill id.".into()));
    }
    write_user_skill(&user_skill_root(app)?, &input)?;
    set_skill_state(app, &input.id, input.enabled, input.trust.clone())?;
    get_managed_skill(app, &input.id)
}

pub fn set_skill_state(app: &AppHandle, skill_id: &str, enabled: bool, trust: String) -> AgentResult<ManagedSkillInfo> {
    if !safe_skill_id(skill_id) {
        return Err(AgentError::InvalidRequest("Unsafe skill id.".into()));
    }
    let mut state = load_state(app)?;
    state.skills.insert(skill_id.to_string(), SkillStateEntry {
        enabled,
        trust,
        last_test_run_id: None,
        last_validated_at: None,
    });
    save_state(app, &state)?;
    get_managed_skill(app, skill_id)
}

pub fn validate_skill_input(input: &SkillManifestInput) -> SkillValidationResult {
    validate_manifest(input)
}
```

- [ ] **Step 4: Wire modules**

In `src-tauri/src/agent/mod.rs`, add:

```rust
pub mod skill_manifest;
pub mod skill_store;
```

- [ ] **Step 5: Run Rust check**

Run:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check
```

Expected: new modules compile.

## Task 4: Expose Skill Management Tauri Commands

**Files:**

- Modify: `src-tauri/src/agent/commands.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `lib/desktop/tauri-agent-runtime.ts` or `lib/agent/material-run.ts`

- [ ] **Step 1: Add Rust command functions**

In `src-tauri/src/agent/commands.rs`, add command functions:

```rust
#[tauri::command]
pub fn agent_list_managed_skills(app: tauri::AppHandle) -> AgentResult<Vec<ManagedSkillInfo>> {
    super::skill_store::list_managed_skills(&app)
}

#[tauri::command]
pub fn agent_get_skill_detail(app: tauri::AppHandle, skill_id: String) -> AgentResult<ManagedSkillInfo> {
    super::skill_store::get_managed_skill(&app, &skill_id)
}

#[tauri::command]
pub fn agent_create_user_skill(app: tauri::AppHandle, input: SkillManifestInput) -> AgentResult<ManagedSkillInfo> {
    super::skill_store::create_user_skill(&app, input)
}

#[tauri::command]
pub fn agent_set_skill_state(
    app: tauri::AppHandle,
    skill_id: String,
    enabled: bool,
    trust: String,
) -> AgentResult<ManagedSkillInfo> {
    super::skill_store::set_skill_state(&app, &skill_id, enabled, trust)
}

#[tauri::command]
pub fn agent_validate_skill(input: SkillManifestInput) -> SkillValidationResult {
    super::skill_store::validate_skill_input(&input)
}
```

Add `use` imports for `ManagedSkillInfo`, `SkillManifestInput`, and `SkillValidationResult`.

- [ ] **Step 2: Register commands**

In `src-tauri/src/main.rs`, add the command names to `tauri::generate_handler!` wherever the existing agent commands are registered:

```rust
agent_list_managed_skills,
agent_get_skill_detail,
agent_create_user_skill,
agent_set_skill_state,
agent_validate_skill,
```

- [ ] **Step 3: Add frontend bridge methods**

In the existing Tauri bridge used by `loadTauriAgentRuntime()`, add:

```ts
listManagedSkills: () => invoke<ManagedSkillInfo[]>("agent_list_managed_skills"),
getSkillDetail: (skillId) => invoke<ManagedSkillInfo>("agent_get_skill_detail", { skillId }),
createUserSkill: (input) => invoke<ManagedSkillInfo>("agent_create_user_skill", { input }),
setSkillState: (skillId, enabled, trust) =>
  invoke<ManagedSkillInfo>("agent_set_skill_state", { skillId, enabled, trust }),
validateSkill: (input) => invoke<SkillValidationResult>("agent_validate_skill", { input }),
```

- [ ] **Step 4: Run checks**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: frontend bridge types compile.

Run:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check
```

Expected: command registration compiles.

## Task 5: Build `/materials/skills` Page

**Files:**

- Create: `app/materials/skills/page.tsx`
- Modify: `app/materials/page.tsx`

- [ ] **Step 1: Add shared nav to Materials workbench**

In `app/materials/page.tsx`, import and render near the top of the page:

```tsx
import { MaterialsSecondaryNav } from "@/components/materials/materials-secondary-nav"
```

Render:

```tsx
<MaterialsSecondaryNav />
```

- [ ] **Step 2: Create Skill management page skeleton**

Create `app/materials/skills/page.tsx`:

```tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { Copy, Play, RefreshCw, ShieldAlert, Upload, WandSparkles } from "lucide-react"
import { MaterialsSecondaryNav } from "@/components/materials/materials-secondary-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { loadTauriAgentRuntime } from "@/lib/agent/material-run"
import { normalizeManagedSkill } from "@/lib/agent/skill-management"
import type { ManagedSkillInfo } from "@/types/agent-runtime"
import { toast } from "sonner"

export default function MaterialSkillsPage() {
  const [skills, setSkills] = useState<ManagedSkillInfo[]>([])
  const [selectedSkillId, setSelectedSkillId] = useState("")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)

  const selectedSkill = skills.find((skill) => skill.id === selectedSkillId) ?? skills[0]
  const visibleSkills = useMemo(
    () => skills.filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(query.toLowerCase())),
    [query, skills],
  )

  const refresh = async () => {
    setLoading(true)
    try {
      const runtime = await loadTauriAgentRuntime()
      const nextSkills = (await runtime.listManagedSkills()).map(normalizeManagedSkill)
      setSkills(nextSkills)
      setSelectedSkillId((current) => current || nextSkills[0]?.id || "")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Skill 列表读取失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <div className="p-6 space-y-5">
      <MaterialsSecondaryNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-bold tracking-wide text-primary">MATERIAL SKILL CENTER</div>
          <h1 className="mt-1 font-serif text-3xl font-bold">Skill 管理</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            管理素材知识库使用的可复用任务能力。配置完成的 Skill 会回到素材工作台，供采集、解析、专题 Wiki 和批量入库流程调用。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className="size-4" />
            刷新检测
          </Button>
          <Button variant="outline">
            <Upload className="size-4" />
            导入 Skill
          </Button>
          <Button>
            <WandSparkles className="size-4" />
            新建 Skill
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-secondary/25 bg-secondary/10 p-3 text-sm text-secondary">
        Skill 管理只负责能力配置；素材工作台负责选择素材、绑定上下文、启动 Agent，并复用已启用和已授权的 Skill。
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(380px,0.9fr)_minmax(520px,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Skill 清单</CardTitle>
            <CardDescription>按来源、信任等级、启用状态和权限风险筛选。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索：热点 / PDF / Wiki / 真题" />
            <div className="space-y-2">
              {visibleSkills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => setSelectedSkillId(skill.id)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    selectedSkill?.id === skill.id ? "border-primary/35 bg-primary/5" : "bg-background hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{skill.displayName ?? skill.name}</div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{skill.description}</p>
                    </div>
                    <Badge variant={skill.enabled ? "secondary" : "outline"}>{skill.enabled ? "启用" : "禁用"}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant={skill.trust === "trusted" ? "secondary" : skill.trust === "blocked" ? "destructive" : "outline"}>
                      {skill.trust}
                    </Badge>
                    <Badge variant="outline">{skill.source}</Badge>
                    {(skill.requiredPermissions ?? []).slice(0, 4).map((permission) => (
                      <Badge key={permission} variant="outline">{permission}</Badge>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <SkillDetail skill={selectedSkill} onRefresh={refresh} />
      </div>
    </div>
  )
}

function SkillDetail({ skill, onRefresh }: { skill?: ManagedSkillInfo; onRefresh: () => void }) {
  if (!skill) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">暂无 Skill</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="font-serif text-2xl">{skill.displayName ?? skill.name}</CardTitle>
              <CardDescription className="mt-2">{skill.description}</CardDescription>
            </div>
            <Badge variant={skill.enabled ? "secondary" : "outline"}>{skill.enabled ? "启用中" : "已禁用"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Meta label="来源" value={skill.source} />
          <Meta label="信任等级" value={skill.trust} />
          <Meta label="校验状态" value={skill.validationStatus} />
          <Meta label="最近测试" value={skill.lastTestRunId ?? "未测试"} />
        </CardContent>
      </Card>

      <Card>
        <Tabs defaultValue="inputs">
          <CardHeader className="pb-0">
            <TabsList>
              <TabsTrigger value="inputs">结构化输入</TabsTrigger>
              <TabsTrigger value="permissions">权限</TabsTrigger>
              <TabsTrigger value="test">测试运行</TabsTrigger>
              <TabsTrigger value="markdown">SKILL.md</TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent className="pt-4">
            <TabsContent value="inputs" className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {(skill.inputs ?? []).map((input) => (
                  <div key={input.name} className="rounded-md border bg-muted/30 p-3 text-sm">
                    <div className="font-medium">{input.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{input.name} / {input.type}</div>
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="permissions" className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(skill.requiredPermissions ?? []).map((permission) => (
                  <Badge key={permission} variant={permission === "network" || permission === "subprocess" ? "destructive" : "outline"}>
                    {permission}
                  </Badge>
                ))}
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                外部 Skill 启用前必须复核权限；Agent 运行仍只写入隔离工作区。
              </div>
            </TabsContent>
            <TabsContent value="test" className="space-y-3">
              <Button onClick={onRefresh}>
                <Play className="size-4" />
                测试运行
              </Button>
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                测试运行会生成 run workspace、stdout.log、stderr.log、material-draft.json，并进入结构校验。
              </div>
            </TabsContent>
            <TabsContent value="markdown">
              <Textarea value={skill.skillMarkdown ?? "选择详情后加载 SKILL.md"} readOnly className="min-h-[260px] font-mono text-xs" />
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  )
}
```

- [ ] **Step 3: Run type check**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: route compiles. If the project reports pre-existing mojibake string errors, fix only errors introduced by this task.

## Task 6: Connect State Toggle And Detail Loading

**Files:**

- Modify: `app/materials/skills/page.tsx`

- [ ] **Step 1: Load full Skill detail on selection**

Add `selectedSkillDetail` state:

```tsx
const [selectedSkillDetail, setSelectedSkillDetail] = useState<ManagedSkillInfo | undefined>()
```

Add effect:

```tsx
useEffect(() => {
  if (!selectedSkillId) return
  let cancelled = false
  void loadTauriAgentRuntime()
    .then((runtime) => runtime.getSkillDetail(selectedSkillId))
    .then((detail) => {
      if (!cancelled) setSelectedSkillDetail(normalizeManagedSkill(detail))
    })
    .catch((error) => {
      toast.error(error instanceof Error ? error.message : "Skill 详情读取失败")
    })
  return () => {
    cancelled = true
  }
}, [selectedSkillId])
```

Pass `selectedSkillDetail ?? selectedSkill`.

- [ ] **Step 2: Add enabled/trust updates**

Add handler:

```tsx
const updateSkillState = async (skill: ManagedSkillInfo, enabled: boolean, trust = skill.trust) => {
  try {
    const runtime = await loadTauriAgentRuntime()
    const updated = normalizeManagedSkill(await runtime.setSkillState(skill.id, enabled, trust))
    setSelectedSkillDetail(updated)
    setSkills((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    toast.success("Skill 状态已更新")
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Skill 状态更新失败")
  }
}
```

Wire it to an enable/disable button in `SkillDetail`:

```tsx
<Button variant="outline" onClick={() => onSetState(skill, !skill.enabled, skill.trust)}>
  {skill.enabled ? "禁用" : "启用"}
</Button>
```

- [ ] **Step 3: Run tests**

Run:

```powershell
npm.cmd run test -- test/lib/agent/skill-management.test.ts
```

Expected: pass.

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: pass.

## Task 7: Duplicate Built-In Skill To User Skill

**Files:**

- Modify: `src-tauri/src/agent/skill_store.rs`
- Modify: `src-tauri/src/agent/commands.rs`
- Modify: `types/agent-runtime.ts`
- Modify: `app/materials/skills/page.tsx`

- [ ] **Step 1: Add duplicate backend function**

In `skill_store.rs`, add:

```rust
pub fn duplicate_skill(app: &AppHandle, skill_id: &str) -> AgentResult<ManagedSkillInfo> {
    let source = super::skills::resolve_skill(app, skill_id)?;
    let new_id = format!("{}-copy", source.info.id);
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
        required_capabilities: Vec::new(),
        required_permissions: vec!["promptInject".into(), "fileRead".into(), "fileWrite".into()],
        skill_markdown: source.skill_markdown,
    };
    create_user_skill(app, input)
}
```

- [ ] **Step 2: Expose command and bridge**

Add `agent_duplicate_skill` command:

```rust
#[tauri::command]
pub fn agent_duplicate_skill(app: tauri::AppHandle, skill_id: String) -> AgentResult<ManagedSkillInfo> {
    super::skill_store::duplicate_skill(&app, &skill_id)
}
```

Add frontend bridge:

```ts
duplicateSkill: (skillId) => invoke<ManagedSkillInfo>("agent_duplicate_skill", { skillId }),
```

- [ ] **Step 3: Wire copy button**

In `SkillDetail`, make `复制为自定义` call `runtime.duplicateSkill(skill.id)`, then select the returned Skill.

- [ ] **Step 4: Run checks**

Run:

```powershell
npx.cmd tsc --noEmit
```

Run:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check
```

Expected: both pass.

## Task 8: Create Lightweight Runs And Inbox Routes

**Files:**

- Create: `app/materials/runs/page.tsx`
- Create: `app/materials/inbox/page.tsx`
- Modify: `app/materials/page.tsx`

- [ ] **Step 1: Add runs route**

Create `app/materials/runs/page.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { MaterialsSecondaryNav } from "@/components/materials/materials-secondary-nav"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { agentRepository } from "@/lib/storage/repositories"
import type { AgentRunRecord } from "@/lib/storage/schema"

export default function MaterialRunsPage() {
  const [runs, setRuns] = useState<AgentRunRecord[]>([])

  useEffect(() => {
    void agentRepository.getRuns().then((items) => setRuns(items.sort((a, b) => b.startedAt.localeCompare(a.startedAt))))
  }, [])

  return (
    <div className="space-y-5 p-6">
      <MaterialsSecondaryNav />
      <div>
        <h1 className="font-serif text-3xl font-bold">Agent 运行中心</h1>
        <p className="mt-2 text-sm text-muted-foreground">查看素材 Agent 的历史任务、状态、摘要和工作区路径。</p>
      </div>
      <Card>
        <CardHeader><CardTitle>运行记录</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {runs.map((run) => (
            <div key={run.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{run.title}</div>
                <div className="text-xs text-muted-foreground">{run.status}</div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{run.summary}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Add inbox route**

Create `app/materials/inbox/page.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { MaterialsSecondaryNav } from "@/components/materials/materials-secondary-nav"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { materialInboxRepository } from "@/lib/storage/repositories"
import type { MaterialInboxDraft } from "@/lib/storage/schema"

export default function MaterialInboxPage() {
  const [drafts, setDrafts] = useState<MaterialInboxDraft[]>([])

  useEffect(() => {
    void materialInboxRepository.getDrafts().then((items) => setDrafts(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))))
  }, [])

  return (
    <div className="space-y-5 p-6">
      <MaterialsSecondaryNav />
      <div>
        <h1 className="font-serif text-3xl font-bold">Inbox 审核</h1>
        <p className="mt-2 text-sm text-muted-foreground">Agent 输出先进入这里，用户确认后再写入正式本地题库。</p>
      </div>
      <Card>
        <CardHeader><CardTitle>候选素材</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {drafts.map((draft) => (
            <div key={draft.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">Run {draft.runId.slice(0, 8)}</div>
                <Badge variant={draft.validationErrors.length > 0 ? "destructive" : "secondary"}>{draft.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{draft.createdAt}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Run type check**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: pass.

## Task 9: Ensure Materials Workbench Uses Managed Skills

**Files:**

- Modify: `app/materials/page.tsx`
- Modify: `lib/agent/material-run.ts`

- [ ] **Step 1: Prefer managed Skill list**

In the `loadTauriAgentRuntime()` skill-loading effect in `app/materials/page.tsx`, call `runtime.listManagedSkills()` when available and filter disabled Skills out of launch options:

```ts
const runtimeSkills =
  "listManagedSkills" in runtime ? await runtime.listManagedSkills() : await runtime.listSkills()
const enabledSkills = runtimeSkills.filter((skill) => !("enabled" in skill) || skill.enabled)
```

- [ ] **Step 2: Block disabled managed Skills before run**

In `lib/agent/material-run.ts`, add a validation branch if request carries `skillEnabled` later, or rely on `validateSkillExecution` from `app/materials/page.tsx` using the current selected Skill. The first implementation should ensure disabled Skills do not appear in the picker.

- [ ] **Step 3: Add empty-state link**

When no enabled Skill exists, render:

```tsx
<Button variant="outline" asChild>
  <a href="/materials/skills">前往 Skill 管理</a>
</Button>
```

- [ ] **Step 4: Run checks**

Run:

```powershell
npm.cmd run test -- test/lib/agent/material-run.test.ts test/lib/agent/skill-inputs.test.ts
```

Expected: pass.

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: pass.

## Task 10: Verification

**Files:**

- No new files.

- [ ] **Step 1: Run targeted frontend tests**

Run:

```powershell
npm.cmd run test -- test/lib/agent/skill-management.test.ts test/lib/agent/skill-inputs.test.ts test/lib/agent/material-run.test.ts test/lib/agent/material-output.test.ts
```

Expected: all targeted tests pass.

- [ ] **Step 2: Run full frontend checks**

Run:

```powershell
npm.cmd run test
```

Expected: all Vitest tests pass.

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: no TypeScript errors.

Run:

```powershell
npm.cmd run lint
```

Expected: no lint errors.

- [ ] **Step 3: Run Rust checks**

Run:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check
```

Expected: Rust backend compiles.

Run:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo test -q agent::
```

Expected: agent module tests pass.

- [ ] **Step 4: Manual browser review**

Run:

```powershell
npm.cmd run dev
```

Expected manual checks:

1. Open `http://localhost:3000/materials`.
2. Sidebar highlights `素材知识库`.
3. The second-level nav shows `素材工作台`, `Skill 管理`, `Agent 运行中心`, `Inbox 审核`.
4. Open `/materials/skills`.
5. Skill list loads built-in and user-local Skills.
6. Disabled or blocked Skills are visibly marked and do not appear as launchable Skills in the workbench.
7. Built-in Skill shows read-only behavior and can be duplicated into a user-local copy.
8. Permission badges show `network` and `subprocess` as high-risk.
9. Testing a Skill creates an isolated run workspace and does not write the formal material stores.
10. Returning to `/materials` shows enabled Skills available in the material workflow.

- [ ] **Step 5: Desktop smoke test**

Run:

```powershell
npm.cmd run desktop:dev
```

Expected: the same `/materials/skills` flow works inside the Tauri window, and Tauri commands can read app-data Skills.

## Risk Notes

- `src-tauri/src/agent/types.rs` currently contains a smaller `AgentSkillInfo` and `StartMaterialAgentRunRequest` than the frontend expects. The implementation must keep frontend and Rust DTOs synchronized.
- Some existing display text appears mojibake in source files. Do not do a broad encoding rewrite in this phase; fix only text touched by Skill management.
- Folder import is safer for the first implementation than zip import. Add zip export/import only after path traversal tests exist.
- External Skill trust is an app-level safety gate, not a true OS sandbox. The run workspace reduces accidental writes but cannot fully constrain a local CLI with broad permissions.
- Built-in Skills should remain source-controlled under `skills/`; user-local Skills belong under app data `agent-skills`.

## Self-Review

Spec coverage:

- Skill is under `素材知识库`, not top-level navigation: Task 1.
- Skill Management page follows the approved app-style HTML: Task 5.
- Managed Skill model includes source, trust, enabled, inputs, permissions, capabilities, validation, and test state: Tasks 2 and 3.
- Backend owns CRUD and state: Tasks 3, 4, and 7.
- Isolated execution and no direct DB writes remain enforced by existing runtime and Task 9.
- Materials workbench can call enabled managed Skills: Task 9.
- Agent Run Center and Inbox second-level routes exist: Task 8.

Placeholder scan:

- No placeholder markers or unspecified implementation steps remain.

Type consistency:

- Frontend `ManagedSkillInfo`, Rust `ManagedSkillInfo`, bridge methods, and page state use matching camelCase payloads through Tauri serde.
