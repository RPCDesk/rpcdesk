use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use regex::Regex;
use serde::Deserialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader};
use tokio::sync::mpsc;

#[derive(Default)]
pub struct HostState {
    children: Mutex<HashMap<String, ChildHandle>>,
    generation: AtomicU64,
    pub(crate) watcher: Mutex<Option<notify::RecommendedWatcher>>,
}

struct ChildHandle {
    pid: u32,
    stdin: mpsc::Sender<String>,
    generation: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOptions {
    backend: String,
    cwd: String,
    session: Option<String>,
    approval_mode: String,
    approval_fallback: String,
}

pub fn logs_dir() -> PathBuf {
    crate::paths::logs_dir()
}

#[cfg(unix)]
static LOGIN_PATH: LazyLock<String> = LazyLock::new(|| {
    let mut path = std::process::Command::new("/bin/zsh")
        .args(["-lc", "print -r -- $PATH"])
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    for extra in ["/opt/homebrew/bin", "/usr/local/bin"] {
        if !path.split(':').any(|part| part == extra) {
            path = format!("{extra}:{path}");
        }
    }
    for extra in ["/usr/bin", "/bin", "/usr/sbin", "/sbin"] {
        if !path.split(':').any(|part| part == extra) {
            path.push(':');
            path.push_str(extra);
        }
    }
    path
});

#[cfg(unix)]
fn login_path() -> String {
    LOGIN_PATH.clone()
}

#[cfg(windows)]
fn login_path() -> String {
    let mut parts: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|value| std::env::split_paths(&value).collect())
        .unwrap_or_default();
    let home = crate::paths::home_dir();
    let mut extras = vec![home.join(".bun/bin"), home.join(".local/bin")];
    if let Some(appdata) = std::env::var_os("APPDATA") {
        extras.push(PathBuf::from(appdata).join("npm"));
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        extras.push(PathBuf::from(local).join("Programs"));
    }
    for extra in extras {
        if !parts.contains(&extra) {
            parts.insert(0, extra);
        }
    }
    std::env::join_paths(parts)
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn inflate_bun(gz: &Path, bun_name: &str) -> Result<PathBuf, String> {
    let compressed_len = std::fs::metadata(gz)
        .map_err(|error| format!("Bun payload unavailable: {error}"))?
        .len();
    let directory = crate::paths::app_support_dir().join("bin");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let target = directory.join(format!("{bun_name}-{compressed_len}"));

    if target.is_file() {
        return Ok(target);
    }

    let source = std::fs::File::open(gz)
        .map_err(|error| format!("Failed to open Bun payload: {error}"))?;
    let mut decoder = flate2::read::GzDecoder::new(std::io::BufReader::new(source));
    let partial = target.with_extension("partial");
    let mut output = std::fs::File::create(&partial)
        .map_err(|error| format!("Failed to write Bun runtime: {error}"))?;
    if let Err(error) = std::io::copy(&mut decoder, &mut output) {
        let _ = std::fs::remove_file(&partial);
        return Err(format!("Failed to extract Bun runtime: {error}"));
    }
    drop(output);

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&partial)
            .map_err(|error| error.to_string())?
            .permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&partial, permissions).map_err(|error| error.to_string())?;
    }

    std::fs::rename(&partial, &target).map_err(|error| error.to_string())?;
    Ok(target)
}

pub(crate) fn resolve_bun(app: &AppHandle) -> Result<PathBuf, String> {
    let bun_name = if cfg!(windows) { "bun.exe" } else { "bun" };
    if let Some(path) = std::env::var_os("RPCDESK_BUN") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
    }

    if cfg!(debug_assertions) {
        #[cfg(unix)]
        let lookup = std::process::Command::new("/bin/zsh")
            .args(["-lc", "command -v bun"])
            .output();
        #[cfg(windows)]
        let lookup = std::process::Command::new("where").arg("bun.exe").output();
        if let Ok(out) = lookup {
            let found = String::from_utf8_lossy(&out.stdout)
                .lines()
                .next()
                .unwrap_or_default()
                .trim()
                .to_string();
            if !found.is_empty() {
                return Ok(PathBuf::from(found));
            }
        }
    }

    let mut raw_candidates = Vec::new();
    let mut payload_candidates = Vec::new();
    if let Ok(resource) = app.path().resource_dir() {
        for base in [resource.join("resources/sidecar"), resource.join("sidecar")] {
            raw_candidates.push(base.join(bun_name));
            payload_candidates.push(base.join("bun.bin"));
        }
    }

    for candidate in &raw_candidates {
        if candidate.is_file() {
            return Ok(candidate.clone());
        }
    }

    for candidate in &payload_candidates {
        if candidate.is_file() {
            return inflate_bun(candidate, bun_name);
        }
    }

    let local = crate::paths::home_dir().join(".bun/bin").join(bun_name);
    if local.is_file() {
        return Ok(local);
    }

    Err("Bun runtime not found".into())
}

pub(crate) fn resolve_sidecar_file(app: &AppHandle, relative: &str) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("sidecar")
            .join(relative);
        if dev.is_file() {
            return Ok(dev);
        }
    }

    let resource = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Resource directory unavailable: {error}"))?;

    for base in [resource.join("resources/sidecar"), resource.join("sidecar")] {
        let candidate = base.join(relative);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    Err(format!("Sidecar file not found: {relative}"))
}

fn validate_tab_id(tab_id: &str) -> Result<(), String> {
    if tab_id.is_empty() || tab_id.len() > 64 {
        return Err("Invalid tab id".into());
    }
    if !tab_id
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        return Err("Invalid tab id".into());
    }
    Ok(())
}

fn validate_options(options: &StartOptions) -> Result<(), String> {
    if options.backend != "omp" && options.backend != "pi" {
        return Err(format!("Unknown backend: {}", options.backend));
    }
    if !Path::new(&options.cwd).is_dir() {
        return Err(format!("Workspace is not a directory: {}", options.cwd));
    }
    if let Some(session) = &options.session {
        if !Path::new(session).is_file() {
            eprintln!("session file missing, starting a new session: {session}");
        }
    }
    Ok(())
}

#[cfg(unix)]
fn process_exists(pid: u32) -> bool {
    let result = unsafe { libc::kill(-(pid as i32), 0) };
    if result == 0 {
        return true;
    }
    std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

#[cfg(windows)]
fn process_exists(pid: u32) -> bool {
    let filter = format!("PID eq {pid}");
    let output = std::process::Command::new("tasklist")
        .args(["/FI", &filter, "/FO", "CSV", "/NH"])
        .output();
    match output {
        Ok(output) => {
            let text = String::from_utf8_lossy(&output.stdout);
            text.lines()
                .any(|line| line.contains(&format!("\"{pid}\"")))
        }
        Err(_) => true,
    }
}

#[cfg(unix)]
fn terminate_tree(pid: u32, force: bool) {
    unsafe {
        libc::kill(
            -(pid as i32),
            if force { libc::SIGKILL } else { libc::SIGTERM },
        );
    }
}

#[cfg(windows)]
fn terminate_tree(pid: u32, force: bool) {
    let mut command = std::process::Command::new("taskkill");
    command.args(["/PID", &pid.to_string(), "/T"]);
    if force {
        command.arg("/F");
    }
    let _ = command.status();
}

async fn wait_for_exit(pid: u32, timeout: Duration) -> bool {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if !process_exists(pid) {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    !process_exists(pid)
}

async fn stop_handle(handle: ChildHandle, graceful: bool) {
    if graceful {
        let _ = handle
            .stdin
            .send("{\"type\":\"shutdown\"}".to_string())
            .await;
    }
    drop(handle.stdin);

    if wait_for_exit(handle.pid, Duration::from_secs(2)).await {
        return;
    }
    terminate_tree(handle.pid, false);
    if wait_for_exit(handle.pid, Duration::from_secs(1)).await {
        return;
    }
    terminate_tree(handle.pid, true);
}

fn open_log_file(path: &Path) -> std::io::Result<tokio::fs::File> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut options = std::fs::OpenOptions::new();
    options.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options.open(path)?;
    Ok(tokio::fs::File::from_std(file))
}

static REDACTOR: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    vec![
        Regex::new(r"sk-[A-Za-z0-9_-]+").expect("valid key regex"),
        Regex::new(r"(?i)bearer\s+\S+").expect("valid bearer regex"),
        Regex::new(r"(?i)(api[_-]?key|token|secret)\s*[:=]\s*\S+").expect("valid secret regex"),
    ]
});

fn redact(line: &str) -> String {
    let mut value = line.to_string();
    for pattern in REDACTOR.iter() {
        value = pattern.replace_all(&value, "[redacted]").to_string();
    }
    value
}

#[tauri::command]
pub async fn start_session(
    app: AppHandle,
    state: State<'_, HostState>,
    tab_id: String,
    options: StartOptions,
    channel: Channel<String>,
) -> Result<(), String> {
    validate_tab_id(&tab_id)?;
    validate_options(&options)?;

    let existing = state
        .children
        .lock()
        .map_err(|_| "Sidecar state lock poisoned")?
        .remove(&tab_id);
    if let Some(handle) = existing {
        stop_handle(handle, true).await;
    }

    let bun = resolve_bun(&app)?;
    let entry = resolve_sidecar_file(&app, "src/main.ts")?;
    let cli = crate::runtime::resolve_cli(&options.backend, &app).await?;
    let generation = state.generation.fetch_add(1, Ordering::SeqCst) + 1;

    let mut command = tokio::process::Command::new(&bun);
    command
        .arg(&entry)
        .arg("--cli")
        .arg(&cli)
        .arg("--backend")
        .arg(&options.backend)
        .arg("--cwd")
        .arg(&options.cwd)
        .arg("--approval-mode")
        .arg(&options.approval_mode)
        .arg("--approval-fallback")
        .arg(&options.approval_fallback)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .env("PATH", login_path())
        .env("HOME", crate::paths::home_dir())
        .env("USERPROFILE", crate::paths::home_dir())
        .env("RPCDESK_TAB", &tab_id);

    if let Some(session) = options
        .session
        .as_deref()
        .filter(|session| Path::new(session).is_file())
    {
        command.arg("--session").arg(session);
    }

    #[cfg(unix)]
    command.process_group(0);
    #[cfg(windows)]
    {
        command.creation_flags(0x08000000);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start sidecar: {error}"))?;
    let pid = child
        .id()
        .ok_or_else(|| "Sidecar exited before it could be tracked".to_string())?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Sidecar stdin unavailable".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Sidecar stdout unavailable".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Sidecar stderr unavailable".to_string())?;

    let log_path = logs_dir().join(format!("sidecar-{tab_id}.log"));
    tokio::spawn(async move {
        let Ok(mut file) = open_log_file(&log_path) else {
            return;
        };
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let line = redact(&line);
            if file.write_all(line.as_bytes()).await.is_err() {
                break;
            }
            if file.write_all(b"\n").await.is_err() {
                break;
            }
            let _ = file.flush().await;
        }
    });

    let (out_tx, mut out_rx) = mpsc::channel::<String>(2048);
    tokio::spawn(async move {
        while let Some(line) = out_rx.recv().await {
            if channel.send(line).is_err() {
                break;
            }
        }
    });

    let reader_tx = out_tx.clone();
    tokio::spawn(async move {
        let _ = relay_reader(stdout, reader_tx).await;
    });

    let (in_tx, mut in_rx) = mpsc::channel::<String>(1024);
    tokio::spawn(async move {
        let mut stdin = stdin;
        while let Some(line) = in_rx.recv().await {
            if stdin.write_all(line.as_bytes()).await.is_err() {
                break;
            }
            if stdin.write_all(b"\n").await.is_err() {
                break;
            }
            let _ = stdin.flush().await;
        }
    });

    let wait_app = app.clone();
    let wait_tab = tab_id.clone();
    let wait_tx = out_tx.clone();
    tokio::spawn(async move {
        let status = child.wait().await;
        let code = status.ok().and_then(|status| status.code());
        let frame = serde_json::json!({ "type": "exit", "code": code }).to_string();
        let _ = wait_tx.send(frame).await;
        drop(wait_tx);

        let state = wait_app.state::<HostState>();
        if let Ok(mut children) = state.children.lock() {
            if children.get(&wait_tab).map(|handle| handle.generation) == Some(generation) {
                children.remove(&wait_tab);
            }
        };
    });

    state
        .children
        .lock()
        .map_err(|_| "Sidecar state lock poisoned")?
        .insert(
            tab_id,
            ChildHandle {
                pid,
                stdin: in_tx,
                generation,
            },
        );

    Ok(())
}

#[tauri::command]
pub async fn send_frame(
    state: State<'_, HostState>,
    tab_id: String,
    frame: String,
) -> Result<(), String> {
    validate_tab_id(&tab_id)?;
    if frame.len() > 4 * 1024 * 1024 {
        return Err("Frame exceeds the 4 MB limit".into());
    }
    let sender = {
        let children = state
            .children
            .lock()
            .map_err(|_| "Sidecar state lock poisoned")?;
        children.get(&tab_id).map(|handle| handle.stdin.clone())
    }
    .ok_or_else(|| "Session process is not running".to_string())?;

    sender
        .send(frame)
        .await
        .map_err(|_| "Session process is not accepting input".to_string())
}

#[tauri::command]
pub async fn stop_session(state: State<'_, HostState>, tab_id: String) -> Result<(), String> {
    validate_tab_id(&tab_id)?;
    let handle = state
        .children
        .lock()
        .map_err(|_| "Sidecar state lock poisoned")?
        .remove(&tab_id);
    if let Some(handle) = handle {
        stop_handle(handle, true).await;
    }
    Ok(())
}

pub fn stop_all(app: &AppHandle) {
    let state = app.state::<HostState>();
    let handles: Vec<ChildHandle> = match state.children.lock() {
        Ok(mut children) => children.drain().map(|(_, handle)| handle).collect(),
        Err(_) => return,
    };
    for handle in handles {
        let _ = handle.stdin.try_send("{\"type\":\"shutdown\"}".to_string());
        terminate_tree(handle.pid, false);
    }
}

pub(crate) async fn relay_reader<R: AsyncRead + Unpin>(
    reader: R,
    tx: mpsc::Sender<String>,
) -> std::io::Result<()> {
    let mut reader = BufReader::new(reader);
    let mut buffer = Vec::new();
    loop {
        buffer.clear();
        let read = reader.read_until(b'\n', &mut buffer).await?;
        if read == 0 {
            break;
        }
        while matches!(buffer.last(), Some(b'\n') | Some(b'\r')) {
            buffer.pop();
        }
        match std::str::from_utf8(&buffer) {
            Ok(line) => {
                if tx.send(line.to_string()).await.is_err() {
                    break;
                }
            }
            Err(_) => {
                eprintln!("sidecar relay: skipped invalid UTF-8 frame");
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncWriteExt;

    #[test]
    fn validates_tab_ids() {
        assert!(validate_tab_id("tab-1_A").is_ok());
        assert!(validate_tab_id("").is_err());
        assert!(validate_tab_id("../escape").is_err());
        assert!(validate_tab_id(&"a".repeat(65)).is_err());
    }

    #[tokio::test]
    async fn relays_lf_and_crlf_frames() {
        let (mut writer, reader) = tokio::io::duplex(1024);
        let (tx, mut rx) = mpsc::channel(8);
        let task = tokio::spawn(relay_reader(reader, tx));

        writer
            .write_all(b"{\"type\":\"ready\"}\n{\"type\":\"exit\",\"code\":0}\r\n")
            .await
            .expect("write frames");
        writer.shutdown().await.expect("close writer");

        assert_eq!(rx.recv().await.as_deref(), Some("{\"type\":\"ready\"}"));
        assert_eq!(
            rx.recv().await.as_deref(),
            Some("{\"type\":\"exit\",\"code\":0}")
        );
        assert!(rx.recv().await.is_none());
        task.await.expect("relay task").expect("relay result");
    }

    #[test]
    fn redacts_obvious_secrets() {
        let value = redact("api_key=supersecret Bearer abc.def sk-test_123");
        assert!(!value.contains("supersecret"));
        assert!(!value.contains("abc.def"));
        assert!(!value.contains("sk-test_123"));
    }
}
