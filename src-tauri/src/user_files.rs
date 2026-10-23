use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use notify::{RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::process::Command;

use crate::paths::{app_support_dir, user_root};
use crate::sidecar::{resolve_bun, resolve_sidecar_file};

const MAX_UI_STATE: u64 = 256 * 1024;
const MAX_SETTINGS: u64 = 64 * 1024;
const MAX_MANIFEST: u64 = 64 * 1024;
const MAX_THEME: u64 = 64 * 1024;

fn plugins_dir() -> PathBuf {
    user_root().join("plugins")
}

fn themes_dir() -> PathBuf {
    user_root().join("themes")
}

fn ui_state_path() -> PathBuf {
    app_support_dir().join("ui-state.json")
}

fn settings_path() -> PathBuf {
    user_root().join("settings.json")
}

fn plugin_state_path() -> PathBuf {
    user_root().join("plugins.json")
}

const DEFAULT_SETTINGS: &str = r#"{
  "version": 1,
  "defaultBackend": "omp",
  "approvalMode": "follow-cli",
  "approvalFallback": "write",
  "theme": "system",
  "showThinking": true,
  "restoreTabs": true,
  "fontScale": 1
}
"#;

fn read_bounded(path: &Path, max: u64) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let metadata = std::fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() > max {
        return Err(format!("{} exceeds the size limit", path.display()));
    }
    std::fs::read_to_string(path)
        .map(Some)
        .map_err(|error| error.to_string())
}

fn write_atomic(path: &Path, contents: &str, max: u64) -> Result<(), String> {
    if contents.len() as u64 > max {
        return Err(format!("{} exceeds the size limit", path.display()));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let tmp = path.with_extension(format!(
        "tmp-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default()
    ));
    std::fs::write(&tmp, contents).map_err(|error| error.to_string())?;
    #[cfg(windows)]
    {
        if path.exists() {
            std::fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }
    std::fs::rename(&tmp, path).map_err(|error| error.to_string())
}

fn valid_plugin_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'.' | b'_' | b'-')
        })
        && id
            .bytes()
            .next()
            .map(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
            .unwrap_or(false)
}

fn resolve_plugin_entry(dir: &Path, relative: &str) -> Result<PathBuf, String> {
    let canonical_dir = dir
        .canonicalize()
        .map_err(|error| format!("Plugin directory unavailable: {error}"))?;
    let candidate = dir
        .join(relative)
        .canonicalize()
        .map_err(|error| format!("Plugin entry unavailable: {error}"))?;
    if !candidate.starts_with(&canonical_dir) {
        return Err("Plugin entry escapes its directory".into());
    }
    if !candidate.is_file() {
        return Err("Plugin entry is not a file".into());
    }
    Ok(candidate)
}

#[derive(Debug, Deserialize)]
struct RawManifest {
    id: String,
    name: String,
    version: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    ui: Option<String>,
    #[serde(default)]
    agent: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifestInfo {
    id: String,
    name: String,
    version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    enabled: bool,
    ui: bool,
    agent: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct PluginBuild {
    code: String,
    mtime: f64,
}

#[derive(Debug, Deserialize)]
struct RawTheme {
    id: String,
    name: String,
    appearance: String,
    tokens: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeFile {
    id: String,
    name: String,
    appearance: String,
    tokens: serde_json::Map<String, serde_json::Value>,
    source: String,
}

fn read_plugin_state() -> BTreeMap<String, bool> {
    read_bounded(&plugin_state_path(), MAX_SETTINGS)
        .ok()
        .flatten()
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default()
}

fn write_plugin_state(state: &BTreeMap<String, bool>) -> Result<(), String> {
    let contents = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;
    write_atomic(&plugin_state_path(), &contents, MAX_SETTINGS)
}

pub fn ensure_user_dirs() -> Result<(), String> {
    std::fs::create_dir_all(user_root()).map_err(|error| error.to_string())?;
    std::fs::create_dir_all(plugins_dir()).map_err(|error| error.to_string())?;
    std::fs::create_dir_all(themes_dir()).map_err(|error| error.to_string())?;
    std::fs::create_dir_all(app_support_dir()).map_err(|error| error.to_string())?;
    std::fs::create_dir_all(crate::paths::logs_dir()).map_err(|error| error.to_string())?;

    if !settings_path().exists() {
        write_atomic(&settings_path(), DEFAULT_SETTINGS, MAX_SETTINGS)?;
    }
    if !plugin_state_path().exists() {
        write_atomic(&plugin_state_path(), "{}", MAX_SETTINGS)?;
    }
    Ok(())
}

pub fn start_watcher(app: AppHandle) -> Result<(), String> {
    let app_handle = app.clone();
    let mut watcher =
        notify::recommended_watcher(move |result: Result<notify::Event, notify::Error>| {
            if let Ok(event) = result {
                for path in event.paths {
                    let _ =
                        app_handle.emit("user-config-changed", path.to_string_lossy().to_string());
                }
            }
        })
        .map_err(|error| error.to_string())?;

    watcher
        .watch(&plugins_dir(), RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;
    watcher
        .watch(&themes_dir(), RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;

    let state = app.state::<crate::sidecar::HostState>();
    let mut slot = state
        .watcher
        .lock()
        .map_err(|_| "Config watcher lock poisoned".to_string())?;
    *slot = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn load_ui_state() -> Result<Option<String>, String> {
    read_bounded(&ui_state_path(), MAX_UI_STATE)
}

#[tauri::command]
pub fn save_ui_state(contents: String) -> Result<(), String> {
    write_atomic(&ui_state_path(), &contents, MAX_UI_STATE)
}

#[tauri::command]
pub fn load_settings() -> Result<Option<String>, String> {
    read_bounded(&settings_path(), MAX_SETTINGS)
}

/// Reads the settings file without going through the command layer.
pub(crate) fn settings_contents() -> Option<String> {
    read_bounded(&settings_path(), MAX_SETTINGS).ok().flatten()
}

#[tauri::command]
pub fn save_settings(contents: String) -> Result<(), String> {
    write_atomic(&settings_path(), &contents, MAX_SETTINGS)
}

#[tauri::command]
pub fn open_plugins_folder() -> Result<(), String> {
    let directory = plugins_dir();
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let opener = if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(windows) {
        "explorer"
    } else {
        "xdg-open"
    };
    std::process::Command::new(opener)
        .arg(&directory)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to open {}: {error}", directory.display()))
}

#[tauri::command]
pub fn list_plugins() -> Result<Vec<PluginManifestInfo>, String> {
    let state = read_plugin_state();
    let entries = std::fs::read_dir(plugins_dir()).map_err(|error| error.to_string())?;
    let mut plugins = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let directory_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_string();
        let manifest_path = path.join("plugin.json");
        let contents = match read_bounded(&manifest_path, MAX_MANIFEST) {
            Ok(Some(contents)) => contents,
            _ => {
                plugins.push(PluginManifestInfo {
                    id: directory_name.clone(),
                    name: directory_name,
                    version: "0.0.0".into(),
                    description: None,
                    enabled: false,
                    ui: false,
                    agent: false,
                    error: Some("plugin.json is missing or unreadable".into()),
                });
                continue;
            }
        };

        let manifest: RawManifest = match serde_json::from_str(&contents) {
            Ok(manifest) => manifest,
            Err(error) => {
                plugins.push(PluginManifestInfo {
                    id: directory_name.clone(),
                    name: directory_name,
                    version: "0.0.0".into(),
                    description: None,
                    enabled: false,
                    ui: false,
                    agent: false,
                    error: Some(format!("Invalid plugin.json: {error}")),
                });
                continue;
            }
        };

        let mut error = None;
        if !valid_plugin_id(&manifest.id) {
            error = Some("Invalid plugin id".to_string());
        } else if manifest.id != directory_name {
            error = Some("Plugin id must match its directory name".to_string());
        }
        if error.is_none() {
            if let Some(ui) = &manifest.ui {
                if let Err(entry_error) = resolve_plugin_entry(&path, ui) {
                    error = Some(entry_error);
                }
            }
        }
        if error.is_none() {
            if let Some(agent) = &manifest.agent {
                if let Err(entry_error) = resolve_plugin_entry(&path, agent) {
                    error = Some(entry_error);
                }
            }
        }

        let enabled = state.get(&manifest.id).copied().unwrap_or(true) && error.is_none();
        plugins.push(PluginManifestInfo {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            enabled,
            ui: manifest.ui.is_some(),
            agent: manifest.agent.is_some(),
            error,
        });
    }

    plugins.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(plugins)
}

#[tauri::command]
pub fn set_plugin_enabled(plugin_id: String, enabled: bool) -> Result<(), String> {
    if !valid_plugin_id(&plugin_id) {
        return Err("Invalid plugin id".into());
    }
    if !plugins_dir().join(&plugin_id).is_dir() {
        return Err("Plugin not found".into());
    }
    let mut state = read_plugin_state();
    state.insert(plugin_id, enabled);
    write_plugin_state(&state)
}

#[tauri::command]
pub async fn build_ui_plugin(app: AppHandle, plugin_id: String) -> Result<PluginBuild, String> {
    if !valid_plugin_id(&plugin_id) {
        return Err("Invalid plugin id".into());
    }
    let directory = plugins_dir().join(&plugin_id);
    let manifest_path = directory.join("plugin.json");
    let contents = read_bounded(&manifest_path, MAX_MANIFEST)?
        .ok_or_else(|| "plugin.json is missing".to_string())?;
    let manifest: RawManifest =
        serde_json::from_str(&contents).map_err(|error| format!("Invalid plugin.json: {error}"))?;
    let ui = manifest
        .ui
        .ok_or_else(|| "Plugin has no UI entry".to_string())?;
    resolve_plugin_entry(&directory, &ui)?;

    let bun = resolve_bun(&app)?;
    let script = resolve_sidecar_file(&app, "src/build-plugin.ts")?;
    let output = tokio::time::timeout(
        Duration::from_secs(10),
        Command::new(bun).arg(script).arg(&manifest_path).output(),
    )
    .await
    .map_err(|_| "Plugin build timed out".to_string())?
    .map_err(|error| format!("Plugin build failed: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "Plugin build failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Invalid plugin build output: {error}"))
}

#[tauri::command]
pub fn list_themes() -> Result<Vec<ThemeFile>, String> {
    let entries = std::fs::read_dir(themes_dir()).map_err(|error| error.to_string())?;
    let mut themes = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        }
        let contents = match read_bounded(&path, MAX_THEME) {
            Ok(Some(contents)) => contents,
            _ => continue,
        };
        let theme: RawTheme = match serde_json::from_str(&contents) {
            Ok(theme) => theme,
            Err(error) => {
                eprintln!("skipping invalid theme {}: {error}", path.display());
                continue;
            }
        };
        if theme.appearance != "light" && theme.appearance != "dark" {
            eprintln!("skipping theme with invalid appearance: {}", path.display());
            continue;
        }
        themes.push(ThemeFile {
            id: theme.id,
            name: theme.name,
            appearance: theme.appearance,
            tokens: theme.tokens,
            source: "user".into(),
        });
    }
    themes.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(themes)
}

#[tauri::command]
pub fn create_example_plugin() -> Result<String, String> {
    let directory = plugins_dir().join("hello-world");
    if directory.exists() {
        return Err("The hello-world plugin already exists".into());
    }
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    std::fs::write(
        directory.join("plugin.json"),
        r#"{
  "id": "hello-world",
  "name": "Hello World",
  "version": "0.1.0",
  "description": "Example rpcdesk plugin",
  "ui": "ui.tsx",
  "agent": "agent.ts"
}
"#,
    )
    .map_err(|error| error.to_string())?;

    std::fs::write(
        directory.join("ui.tsx"),
        r#"module.exports = (api) => {
  const { React } = api;
  api.registerPanel({
    id: "hello",
    title: "Hello",
    component: () => React.createElement("div", { style: { padding: 12 } }, "Hello from a plugin"),
  });
  api.registerCommand({
    name: "hello",
    title: "Say hello",
    run: (ctx) => ctx.prompt("Say hello in one sentence"),
  });
};
"#,
    )
    .map_err(|error| error.to_string())?;

    std::fs::write(
        directory.join("agent.ts"),
        r#"module.exports = (pi) => {
  pi.registerTool({
    name: "hello_world",
    label: "Hello World",
    description: "Return a greeting",
    parameters: { type: "object", properties: {} },
    async execute() {
      return { content: [{ type: "text", text: "hello" }] };
    },
  });
};
"#,
    )
    .map_err(|error| error.to_string())?;

    let theme = serde_json::json!({
      "id": "hello-sunrise",
      "name": "Hello Sunrise",
      "appearance": "light",
      "tokens": {
        "--bg": "#fff8f0",
        "--surface": "#ffffff",
        "--surface-2": "#fdf0e2",
        "--fg": "#241a12",
        "--muted": "#7a6657",
        "--border": "rgba(90, 60, 30, 0.14)",
        "--accent": "#c05621",
        "--success": "#2f7d32",
        "--warning": "#a15c00",
        "--error": "#b3261e"
      }
    });
    std::fs::write(
        themes_dir().join("hello-sunrise.json"),
        serde_json::to_string_pretty(&theme).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;

    Ok(directory.to_string_lossy().to_string())
}
