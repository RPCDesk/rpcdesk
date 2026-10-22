use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadInfo {
    pub version: String,
    pub url: String,
    pub size: u64,
    pub checksum: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub backend: String,
    pub installed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub source: String,
    pub download: DownloadInfo,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ArchiveKind {
    Bare,
    TarGz,
    Zip,
}

struct Release {
    version: &'static str,
    url: &'static str,
    size: u64,
    checksum: &'static str,
    archive: ArchiveKind,
}

fn runtime_root() -> PathBuf {
    crate::paths::runtime_root()
}

fn binary_name(backend: &str) -> &'static str {
    #[cfg(windows)]
    {
        if backend == "pi" {
            "pi.exe"
        } else {
            "omp.exe"
        }
    }
    #[cfg(not(windows))]
    {
        if backend == "pi" {
            "pi"
        } else {
            "omp"
        }
    }
}

fn platform_key() -> Result<&'static str, String> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Ok("darwin-arm64"),
        ("macos", "x86_64") => Ok("darwin-x64"),
        ("linux", "aarch64") => Ok("linux-arm64"),
        ("linux", "x86_64") => Ok("linux-x64"),
        ("windows", "aarch64") => Ok("windows-arm64"),
        ("windows", "x86_64") => Ok("windows-x64"),
        _ => Err(format!(
            "No runtime build for {} {}",
            std::env::consts::OS,
            std::env::consts::ARCH
        )),
    }
}

fn release_for(backend: &str) -> Result<Release, String> {
    release_for_platform(backend, platform_key()?)
}

fn release_for_platform(backend: &str, platform: &str) -> Result<Release, String> {
    match (backend, platform) {
        ("omp", "darwin-arm64") => Ok(Release {
            version: "18.12.6",
            url: "https://github.com/can1357/oh-my-pi/releases/download/v18.12.6/omp-darwin-arm64",
            size: 197_245_984,
            checksum: "cfbb5e38cd8f8a3be55e710700be587d287deaacdc58c9b0a661c5086bccfe58",
            archive: ArchiveKind::Bare,
        }),
        ("omp", "darwin-x64") => Ok(Release {
            version: "18.12.6",
            url: "https://github.com/can1357/oh-my-pi/releases/download/v18.12.6/omp-darwin-x64",
            size: 207_919_840,
            checksum: "62d6e6fd88b6fa5de2ca82842906f152bf1aa227559b1d0bb386f25f6d606123",
            archive: ArchiveKind::Bare,
        }),
        ("omp", "linux-arm64") => Ok(Release {
            version: "18.12.6",
            url: "https://github.com/can1357/oh-my-pi/releases/download/v18.12.6/omp-linux-arm64",
            size: 217_828_136,
            checksum: "eee8e586274cef2e725c218b2b28b48ca9965d46dd58f60998cb347eca4ad0cf",
            archive: ArchiveKind::Bare,
        }),
        ("omp", "linux-x64") => Ok(Release {
            version: "18.12.6",
            url: "https://github.com/can1357/oh-my-pi/releases/download/v18.12.6/omp-linux-x64",
            size: 256_702_432,
            checksum: "85d9daf3a05fc76e8cd425ae1904eb576af8d21cc85fcf4690742626e07ccfa4",
            archive: ArchiveKind::Bare,
        }),
        ("omp", "windows-arm64") => Ok(Release {
            version: "18.12.6",
            url: "https://github.com/can1357/oh-my-pi/releases/download/v18.12.6/omp-windows-arm64.exe",
            size: 209_006_080,
            checksum: "f1c2291275c66de8dba0af248df7075a8adcfdecbafee35afc873e8a5ac63b01",
            archive: ArchiveKind::Bare,
        }),
        ("omp", "windows-x64") => Ok(Release {
            version: "18.12.6",
            url: "https://github.com/can1357/oh-my-pi/releases/download/v18.12.6/omp-windows-x64.exe",
            size: 224_254_976,
            checksum: "73d73c11dc8821cf939441a964992aefc9c5b0d5a4418e9e8985a46439b60eef",
            archive: ArchiveKind::Bare,
        }),
        ("pi", "darwin-arm64") => Ok(Release {
            version: "1.4.0",
            url: "https://github.com/earendil-works/pi/releases/download/v1.4.0/pi-darwin-arm64.tar.gz",
            size: 31_098_931,
            checksum: "79d9979d76a2a5adb7c28e27e9b44629928ccd0dc9fbb6ae7217860bd5e8be5d",
            archive: ArchiveKind::TarGz,
        }),
        ("pi", "darwin-x64") => Ok(Release {
            version: "1.4.0",
            url: "https://github.com/earendil-works/pi/releases/download/v1.4.0/pi-darwin-x64.tar.gz",
            size: 33_558_360,
            checksum: "1bdefc9e1074c1de458ea9f2e43e6013ce49cd05326009b3de144037036585e2",
            archive: ArchiveKind::TarGz,
        }),
        ("pi", "linux-arm64") => Ok(Release {
            version: "1.4.0",
            url: "https://github.com/earendil-works/pi/releases/download/v1.4.0/pi-linux-arm64.tar.gz",
            size: 42_745_801,
            checksum: "fa5829c7ef83ffeaebba015715c8306220f89b2aa8a00154efbba98dd5440156",
            archive: ArchiveKind::TarGz,
        }),
        ("pi", "linux-x64") => Ok(Release {
            version: "1.4.0",
            url: "https://github.com/earendil-works/pi/releases/download/v1.4.0/pi-linux-x64.tar.gz",
            size: 42_645_744,
            checksum: "f2e4e4329603223d03260cdb8bd5033dbdc1f73ba58ab8939db2e56546e115d2",
            archive: ArchiveKind::TarGz,
        }),
        ("pi", "windows-arm64") => Ok(Release {
            version: "1.4.0",
            url: "https://github.com/earendil-works/pi/releases/download/v1.4.0/pi-windows-arm64.zip",
            size: 43_770_747,
            checksum: "17ab17ee0e9088545c7dfa56d29490c45bd915425610b0db0cd937632f2df714",
            archive: ArchiveKind::Zip,
        }),
        ("pi", "windows-x64") => Ok(Release {
            version: "1.4.0",
            url: "https://github.com/earendil-works/pi/releases/download/v1.4.0/pi-windows-x64.zip",
            size: 45_136_547,
            checksum: "0f7256ea8bdac3af20012b94fdc1252a31cc6dc0d2f9b9eb539555d22e3e321b",
            archive: ArchiveKind::Zip,
        }),
        _ => Err(format!("No {backend} build for {platform}")),
    }
}

fn version_at_least(value: &str, minimum: &str) -> bool {
    let parse = |text: &str| {
        text.split('.')
            .take(3)
            .map(|part| part.parse::<u64>().unwrap_or(0))
            .collect::<Vec<_>>()
    };
    parse(value) >= parse(minimum)
}

fn minimum_version(backend: &str) -> &'static str {
    if backend == "pi" {
        "1.4.0"
    } else {
        "18.12.0"
    }
}

async fn probe_version(path: &Path) -> Option<String> {
    let mut command = tokio::process::Command::new(path);
    command.arg("--version");
    #[cfg(windows)]
    {
        command.creation_flags(0x08000000);
    }
    let output = tokio::time::timeout(Duration::from_secs(4), command.output())
        .await
        .ok()?
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let pattern = regex::Regex::new(r"(\d+\.\d+\.\d+)").ok()?;
    pattern
        .captures(&text)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().to_string())
}

fn managed_path(backend: &str, release: &Release) -> PathBuf {
    let root = runtime_root().join(backend).join(release.version);
    if backend == "pi" {
        if cfg!(windows) {
            root.join(binary_name("pi"))
        } else {
            root.join("pi").join("pi")
        }
    } else {
        root.join(binary_name(backend))
    }
}

fn executable_names(backend: &str) -> Vec<String> {
    let base = if backend == "pi" { "pi" } else { "omp" };
    #[cfg(windows)]
    {
        vec![format!("{base}.exe")]
    }
    #[cfg(not(windows))]
    {
        vec![base.to_string()]
    }
}

fn candidate_paths(backend: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let env_name = if backend == "pi" {
        "PI_DESKTOP_PI_PATH"
    } else {
        "PI_DESKTOP_OMP_PATH"
    };
    if let Some(path) = std::env::var_os(env_name) {
        candidates.push(PathBuf::from(path));
    }

    let mut directories: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|value| std::env::split_paths(&value).collect())
        .unwrap_or_default();
    let home = crate::paths::home_dir();
    directories.push(home.join(".local/bin"));
    directories.push(home.join(".bun/bin"));
    #[cfg(target_os = "macos")]
    directories.push(PathBuf::from("/opt/homebrew/bin"));
    #[cfg(unix)]
    {
        directories.push(PathBuf::from("/usr/local/bin"));
        directories.push(PathBuf::from("/usr/bin"));
    }
    #[cfg(windows)]
    {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            directories.push(PathBuf::from(appdata).join("npm"));
        }
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            let local = PathBuf::from(local);
            directories.push(local.join("Programs"));
            directories.push(local.join("Microsoft/WinGet/Links"));
        }
        if let Some(program_files) = std::env::var_os("ProgramFiles") {
            directories.push(PathBuf::from(program_files));
        }
    }

    let names = executable_names(backend);
    let mut seen = std::collections::HashSet::new();
    for directory in directories {
        for name in &names {
            let candidate = directory.join(name);
            if seen.insert(candidate.clone()) {
                candidates.push(candidate);
            }
        }
    }
    candidates
}

async fn resolve_system(backend: &str) -> Option<(PathBuf, String)> {
    for candidate in candidate_paths(backend) {
        if !candidate.is_file() {
            continue;
        }
        if let Some(version) = probe_version(&candidate).await {
            if version_at_least(&version, minimum_version(backend)) {
                return Some((candidate, version));
            }
        }
    }
    None
}

async fn resolve_managed(backend: &str) -> Option<(PathBuf, String)> {
    let release = release_for(backend).ok()?;
    let path = managed_path(backend, &release);
    if !path.is_file() {
        return None;
    }
    let version = probe_version(&path).await?;
    if !version_at_least(&version, minimum_version(backend)) {
        return None;
    }
    Some((path, version))
}

pub async fn status(backend: &str) -> Result<RuntimeStatus, String> {
    let release = release_for(backend)?;
    let download = DownloadInfo {
        version: release.version.into(),
        url: release.url.into(),
        size: release.size,
        checksum: release.checksum.into(),
    };

    if let Some((path, version)) = resolve_system(backend).await {
        return Ok(RuntimeStatus {
            backend: backend.into(),
            installed: true,
            path: Some(path.to_string_lossy().into_owned()),
            version: Some(version),
            source: "system".into(),
            download,
        });
    }
    if let Some((path, version)) = resolve_managed(backend).await {
        return Ok(RuntimeStatus {
            backend: backend.into(),
            installed: true,
            path: Some(path.to_string_lossy().into_owned()),
            version: Some(version),
            source: "managed".into(),
            download,
        });
    }
    Ok(RuntimeStatus {
        backend: backend.into(),
        installed: false,
        path: None,
        version: None,
        source: "missing".into(),
        download,
    })
}

pub async fn resolve_cli(backend: &str, _app: &AppHandle) -> Result<PathBuf, String> {
    if let Some((path, _version)) = resolve_system(backend).await {
        return Ok(path);
    }
    if let Some((path, _version)) = resolve_managed(backend).await {
        return Ok(path);
    }
    Err(format!(
        "{} CLI not found. Install it or download a managed copy.",
        backend
    ))
}

async fn fetch_verified(
    release: &Release,
    destination: &Path,
    mut progress: impl FnMut(u64, u64),
) -> Result<(), String> {
    let response = reqwest::Client::builder()
        .user_agent("Pi-Desktop/0.1")
        .build()
        .map_err(|error| error.to_string())?
        .get(release.url)
        .send()
        .await
        .map_err(|error| format!("Download failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Download failed: {error}"))?;

    let total = response.content_length().unwrap_or(release.size);
    if let Some(parent) = destination.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| error.to_string())?;
    }
    let mut file = tokio::fs::File::create(destination)
        .await
        .map_err(|error| error.to_string())?;
    let mut stream = response.bytes_stream();
    let mut hasher = Sha256::new();
    let mut downloaded = 0u64;
    let mut last_emit = Instant::now();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("Download failed: {error}"))?;
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;
        file.write_all(&chunk)
            .await
            .map_err(|error| error.to_string())?;
        if last_emit.elapsed() > Duration::from_millis(250) {
            last_emit = Instant::now();
            progress(downloaded, total);
        }
    }
    file.flush().await.map_err(|error| error.to_string())?;
    let actual = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    if actual != release.checksum {
        return Err(format!(
            "Checksum mismatch: expected {}, got {actual}",
            release.checksum
        ));
    }
    progress(downloaded, total);
    Ok(())
}

async fn copy_dir(source: &Path, destination: &Path) -> Result<(), String> {
    let mut stack = vec![(source.to_path_buf(), destination.to_path_buf())];
    while let Some((from, to)) = stack.pop() {
        tokio::fs::create_dir_all(&to)
            .await
            .map_err(|error| error.to_string())?;
        let mut entries = tokio::fs::read_dir(&from)
            .await
            .map_err(|error| error.to_string())?;
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|error| error.to_string())?
        {
            let path = entry.path();
            let target = to.join(entry.file_name());
            let metadata = entry.metadata().await.map_err(|error| error.to_string())?;
            if metadata.is_dir() {
                stack.push((path, target));
            } else {
                tokio::fs::copy(&path, &target)
                    .await
                    .map_err(|error| format!("Failed to copy {}: {error}", path.display()))?;
            }
        }
    }
    Ok(())
}

async fn download_to(
    app: &AppHandle,
    backend: &str,
    release: &Release,
    destination: &Path,
) -> Result<(), String> {
    fetch_verified(release, destination, |downloaded, total| {
        let _ = app.emit(
            "runtime-download",
            serde_json::json!({
                "backend": backend,
                "downloaded": downloaded,
                "total": total,
            }),
        );
    })
    .await
}

fn extract_tar_gz(archive: &Path, destination: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive)
        .map_err(|error| format!("Failed to open {}: {error}", archive.display()))?;
    let decoder = flate2::read::GzDecoder::new(std::io::BufReader::new(file));
    let mut tar = tar::Archive::new(decoder);
    tar.set_preserve_permissions(true);
    tar.unpack(destination)
        .map_err(|error| format!("Failed to extract {}: {error}", archive.display()))
}

fn extract_zip(archive: &Path, destination: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive)
        .map_err(|error| format!("Failed to open {}: {error}", archive.display()))?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|error| format!("Failed to read {}: {error}", archive.display()))?;
    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|error| format!("Failed to read zip entry: {error}"))?;
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };
        let target = destination.join(relative);
        if entry.is_dir() {
            std::fs::create_dir_all(&target).map_err(|error| error.to_string())?;
            continue;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut output = std::fs::File::create(&target)
            .map_err(|error| format!("Failed to create {}: {error}", target.display()))?;
        std::io::copy(&mut entry, &mut output)
            .map_err(|error| format!("Failed to extract {}: {error}", target.display()))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Some(mode) = entry.unix_mode() {
                let _ = std::fs::set_permissions(&target, std::fs::Permissions::from_mode(mode));
            }
        }
    }
    Ok(())
}

async fn extract_archive(
    archive: &Path,
    kind: ArchiveKind,
    destination: &Path,
) -> Result<(), String> {
    let archive = archive.to_path_buf();
    let destination = destination.to_path_buf();
    tokio::task::spawn_blocking(move || match kind {
        ArchiveKind::TarGz => extract_tar_gz(&archive, &destination),
        ArchiveKind::Zip => extract_zip(&archive, &destination),
        ArchiveKind::Bare => Ok(()),
    })
    .await
    .map_err(|error| format!("Extraction task failed: {error}"))?
}

fn set_binary_permissions(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(path)
            .map_err(|error| error.to_string())?
            .permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(path, permissions).map_err(|error| error.to_string())?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

#[tauri::command]
pub async fn runtime_status(backend: String) -> Result<RuntimeStatus, String> {
    status(&backend).await
}

#[tauri::command]
pub async fn download_runtime(app: AppHandle, backend: String) -> Result<RuntimeStatus, String> {
    let release = release_for(&backend)?;
    if let Some((path, version)) = resolve_managed(&backend).await {
        return Ok(RuntimeStatus {
            backend: backend.clone(),
            installed: true,
            path: Some(path.to_string_lossy().into_owned()),
            version: Some(version),
            source: "managed".into(),
            download: DownloadInfo {
                version: release.version.into(),
                url: release.url.into(),
                size: release.size,
                checksum: release.checksum.into(),
            },
        });
    }

    let root = runtime_root().join(&backend).join(release.version);
    let staging = runtime_root().join(format!(".{backend}-{}", std::process::id()));
    let _ = tokio::fs::remove_dir_all(&staging).await;
    tokio::fs::create_dir_all(&staging)
        .await
        .map_err(|error| error.to_string())?;
    let archive = staging.join(match release.archive {
        ArchiveKind::Bare => "download",
        ArchiveKind::TarGz => "download.tar.gz",
        ArchiveKind::Zip => "download.zip",
    });
    download_to(&app, &backend, &release, &archive).await?;

    let (target, extracted, is_directory) = match release.archive {
        ArchiveKind::Bare => (root.join(binary_name(&backend)), archive.clone(), false),
        ArchiveKind::TarGz => {
            let extract_dir = staging.join("extract");
            tokio::fs::create_dir_all(&extract_dir)
                .await
                .map_err(|error| error.to_string())?;
            extract_archive(&archive, ArchiveKind::TarGz, &extract_dir).await?;
            (root.join("pi"), extract_dir.join("pi"), true)
        }
        ArchiveKind::Zip => {
            let extract_dir = staging.join("extract");
            tokio::fs::create_dir_all(&extract_dir)
                .await
                .map_err(|error| error.to_string())?;
            extract_archive(&archive, ArchiveKind::Zip, &extract_dir).await?;
            (root.clone(), extract_dir, true)
        }
    };

    tokio::fs::create_dir_all(&root)
        .await
        .map_err(|error| error.to_string())?;
    if is_directory {
        let _ = tokio::fs::remove_dir_all(&target).await;
        copy_dir(&extracted, &target).await?;
    } else {
        tokio::fs::copy(&extracted, &target)
            .await
            .map_err(|error| format!("Failed to install {backend}: {error}"))?;
    }
    let binary = if is_directory {
        target.join(binary_name(&backend))
    } else {
        target.clone()
    };
    set_binary_permissions(&binary)?;

    let version = probe_version(&binary)
        .await
        .ok_or_else(|| "Downloaded CLI did not report a version".to_string())?;
    if !version_at_least(&version, minimum_version(&backend)) {
        return Err(format!(
            "Downloaded {backend} version {version} is older than {}",
            minimum_version(&backend)
        ));
    }
    let _ = tokio::fs::remove_dir_all(&staging).await;

    Ok(RuntimeStatus {
        backend,
        installed: true,
        path: Some(binary.to_string_lossy().into_owned()),
        version: Some(version),
        source: "managed".into(),
        download: DownloadInfo {
            version: release.version.into(),
            url: release.url.into(),
            size: release.size,
            checksum: release.checksum.into(),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_versions() {
        assert!(version_at_least("18.12.4", "18.12.0"));
        assert!(version_at_least("1.4.0", "1.4.0"));
        assert!(!version_at_least("18.11.9", "18.12.0"));
        assert!(!version_at_least("1.3.9", "1.4.0"));
    }

    #[test]
    fn releases_are_available_for_every_supported_platform() {
        for platform in [
            "darwin-arm64",
            "darwin-x64",
            "linux-arm64",
            "linux-x64",
            "windows-arm64",
            "windows-x64",
        ] {
            assert!(release_for_platform("omp", platform).is_ok(), "{platform}");
            assert!(release_for_platform("pi", platform).is_ok(), "{platform}");
        }
        assert!(release_for("unknown").is_err());
        assert!(release_for_platform("omp", "plan9-x64").is_err());
    }

    #[test]
    fn managed_layouts_keep_cli_assets_together() {
        let omp = release_for("omp").expect("omp release");
        let pi = release_for("pi").expect("pi release");
        let pi_path = managed_path("pi", &pi);
        if cfg!(windows) {
            assert!(pi_path.ends_with("pi/1.4.0/pi.exe"));
            assert!(managed_path("omp", &omp).ends_with("omp/18.12.6/omp.exe"));
        } else {
            assert!(pi_path.ends_with("pi/1.4.0/pi/pi"));
            assert!(managed_path("omp", &omp).ends_with("omp/18.12.6/omp"));
        }
    }

    #[tokio::test]
    #[ignore]
    async fn resolves_the_installed_omp() {
        let status = status("omp").await.expect("omp status");
        assert!(status.installed);
        assert_eq!(status.source, "system");
        assert!(status.version.unwrap().starts_with("18."));
    }

    #[tokio::test]
    #[ignore]
    async fn extracts_the_windows_pi_zip() {
        let release = Release {
            version: "1.4.0",
            url: "https://github.com/earendil-works/pi/releases/download/v1.4.0/pi-windows-x64.zip",
            size: 45_136_547,
            checksum: "0f7256ea8bdac3af20012b94fdc1252a31cc6dc0d2f9b9eb539555d22e3e321b",
            archive: ArchiveKind::Zip,
        };
        let root = std::env::temp_dir().join(format!("pi-desktop-zip-{}", std::process::id()));
        let _ = tokio::fs::remove_dir_all(&root).await;
        tokio::fs::create_dir_all(&root).await.expect("temp dir");
        let archive = root.join("pi.zip");
        fetch_verified(&release, &archive, |_downloaded, _total| {})
            .await
            .expect("verified download");
        let extract = root.join("extract");
        tokio::fs::create_dir_all(&extract)
            .await
            .expect("extract dir");
        extract_archive(&archive, ArchiveKind::Zip, &extract)
            .await
            .expect("extract zip");
        assert!(extract.join("pi.exe").is_file());
        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    #[tokio::test]
    #[ignore]
    async fn downloads_and_extracts_the_pi_release() {
        let release = release_for("pi").expect("pi release");
        let root = std::env::temp_dir().join(format!("pi-desktop-runtime-{}", std::process::id()));
        let _ = tokio::fs::remove_dir_all(&root).await;
        tokio::fs::create_dir_all(&root).await.expect("temp dir");
        let archive = root.join("pi.tar.gz");
        fetch_verified(&release, &archive, |_downloaded, _total| {})
            .await
            .expect("verified download");

        let extract = root.join("extract");
        tokio::fs::create_dir_all(&extract)
            .await
            .expect("extract dir");
        extract_archive(&archive, release.archive, &extract)
            .await
            .expect("extract");
        let binary = if release.archive == ArchiveKind::Zip {
            extract.join("pi.exe")
        } else {
            extract.join("pi").join("pi")
        };
        assert!(binary.is_file());
        let version = probe_version(&binary).await.expect("version");
        assert_eq!(version, "1.4.0");
        let _ = tokio::fs::remove_dir_all(&root).await;
    }
}
