use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

use crate::paths::logs_dir;
use crate::user_files::settings_contents;

/// Appends one line to the update log so failed checks and installs stay diagnosable.
pub(crate) fn log_update(message: &str) {
    let directory = logs_dir();
    if std::fs::create_dir_all(&directory).is_err() {
        return;
    }
    let path = directory.join("updates.log");
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default();
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        use std::io::Write;
        let _ = writeln!(file, "{stamp} {message}");
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    pub date: Option<String>,
}

fn normalize_endpoint(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
        return Some(trimmed.to_string());
    }
    None
}

/// Splits a comma or newline separated endpoint list, keeping only http(s) entries.
pub fn parse_endpoints(raw: &str) -> Vec<String> {
    raw.split([',', '\n', '\r'])
        .filter_map(normalize_endpoint)
        .collect()
}

fn settings_endpoint() -> Option<String> {
    let contents = settings_contents()?;
    let parsed: serde_json::Value = serde_json::from_str(&contents).ok()?;
    let value = parsed.get("updateEndpoint")?.as_str()?;
    normalize_endpoint(value)
}

/// Resolution order: explicit argument, environment, user settings.
pub fn resolve_endpoints(explicit: Option<&str>) -> Vec<String> {
    if let Some(raw) = explicit {
        let endpoints = parse_endpoints(raw);
        if !endpoints.is_empty() {
            return endpoints;
        }
    }
    if let Ok(raw) = std::env::var("PI_DESKTOP_UPDATE_ENDPOINT") {
        let endpoints = parse_endpoints(&raw);
        if !endpoints.is_empty() {
            return endpoints;
        }
    }
    settings_endpoint().into_iter().collect()
}

fn build_updater(
    app: &AppHandle,
    explicit: Option<&str>,
) -> Result<tauri_plugin_updater::Updater, String> {
    let mut builder = app.updater_builder();
    let endpoints = resolve_endpoints(explicit);
    if endpoints.is_empty() {
        return Err(
            "No update feed configured. Set an update feed URL in Settings → Updates.".into(),
        );
    }
    let urls = endpoints
        .iter()
        .map(|endpoint| {
            endpoint
                .parse()
                .map_err(|error| format!("Invalid update feed {endpoint}: {error}"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    builder = builder
        .endpoints(urls)
        .map_err(|error| format!("Invalid update feed: {error}"))?;
    builder
        .build()
        .map_err(|error| format!("Updater unavailable: {error}"))
}

/// True when an update feed is configured through settings or the environment.
#[tauri::command]
pub fn update_feed_configured() -> bool {
    !resolve_endpoints(None).is_empty()
}

#[tauri::command]
pub async fn check_update(
    app: AppHandle,
    endpoint: Option<String>,
) -> Result<Option<UpdateInfo>, String> {
    let resolved = resolve_endpoints(endpoint.as_deref());
    let updater = match build_updater(&app, endpoint.as_deref()) {
        Ok(updater) => updater,
        Err(error) => {
            log_update(&format!("check failed: {error}"));
            return Err(error);
        }
    };
    let update = match updater.check().await {
        Ok(update) => update,
        Err(error) => {
            let message = format!("Update check failed: {error}");
            log_update(&format!("check failed against {resolved:?}: {error}"));
            return Err(message);
        }
    };
    match &update {
        Some(update) => log_update(&format!(
            "found {} (current {}) at {resolved:?}",
            update.version, update.current_version
        )),
        None => log_update(&format!("no update at {resolved:?}")),
    }
    Ok(update.map(|update| UpdateInfo {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        notes: update.body.clone(),
        date: update.date.map(|date| date.to_string()),
    }))
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    endpoint: Option<String>,
) -> Result<Option<String>, String> {
    let updater = match build_updater(&app, endpoint.as_deref()) {
        Ok(updater) => updater,
        Err(error) => {
            log_update(&format!("install failed: {error}"));
            return Err(error);
        }
    };
    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => {
            log_update("install skipped: no update available");
            return Err("No update is available".to_string());
        }
        Err(error) => {
            let message = format!("Update check failed: {error}");
            log_update(&format!("install check failed: {error}"));
            return Err(message);
        }
    };
    let version = update.version.clone();
    log_update(&format!("installing {version}"));
    let progress_app = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                let _ = progress_app.emit(
                    "update-progress",
                    serde_json::json!({ "chunk": chunk, "total": total }),
                );
            },
            || {},
        )
        .await
        .map_err(|error| {
            log_update(&format!("install of {version} failed: {error}"));
            format!("Update failed: {error}")
        })?;
    log_update(&format!("installed {version}"));
    let _ = app.emit("update-installed", serde_json::json!({ "version": version }));
    Ok(Some(version))
}

#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_endpoint_lists() {
        let endpoints = parse_endpoints(
            "https://example.com/latest.json,\n  http://localhost:8000/latest.json\n",
        );
        assert_eq!(
            endpoints,
            vec![
                "https://example.com/latest.json".to_string(),
                "http://localhost:8000/latest.json".to_string()
            ]
        );
    }

    #[test]
    fn rejects_non_http_endpoints() {
        assert!(parse_endpoints("file:///tmp/latest.json").is_empty());
        assert!(parse_endpoints("example.com/latest.json").is_empty());
        assert!(parse_endpoints("").is_empty());
    }

    #[test]
    fn prefers_the_explicit_endpoint() {
        assert_eq!(
            resolve_endpoints(Some("https://explicit.example/latest.json")),
            vec!["https://explicit.example/latest.json".to_string()]
        );
    }
}
