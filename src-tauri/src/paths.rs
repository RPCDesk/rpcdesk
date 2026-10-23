use std::path::PathBuf;

pub fn home_dir() -> PathBuf {
    #[cfg(windows)]
    {
        if let Some(value) = std::env::var_os("USERPROFILE") {
            return PathBuf::from(value);
        }
        let drive = std::env::var_os("HOMEDRIVE").unwrap_or_default();
        let path = std::env::var_os("HOMEPATH").unwrap_or_default();
        if !drive.is_empty() || !path.is_empty() {
            return PathBuf::from(format!(
                "{}{}",
                drive.to_string_lossy(),
                path.to_string_lossy()
            ));
        }
    }
    #[cfg(not(windows))]
    {
        if let Some(value) = std::env::var_os("HOME") {
            return PathBuf::from(value);
        }
    }
    PathBuf::from(".")
}

pub fn user_root() -> PathBuf {
    home_dir().join(".rpcdesk")
}

pub fn app_support_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        home_dir().join("Library/Application Support/rpcdesk")
    }
    #[cfg(windows)]
    {
        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home_dir().join("AppData/Local"))
            .join("rpcdesk")
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home_dir().join(".local/share"))
            .join("rpcdesk")
    }
}

pub fn logs_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        home_dir().join("Library/Logs/rpcdesk")
    }
    #[cfg(windows)]
    {
        app_support_dir().join("logs")
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::env::var_os("XDG_STATE_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home_dir().join(".local/state"))
            .join("rpcdesk/logs")
    }
}

pub fn runtime_root() -> PathBuf {
    app_support_dir().join("runtimes")
}
