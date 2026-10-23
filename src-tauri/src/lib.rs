mod paths;
mod runtime;
mod sidecar;
mod updates;
mod user_files;

use sidecar::HostState;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(HostState::default())
        .setup(|app| {
            if let Err(error) = user_files::ensure_user_dirs() {
                eprintln!("failed to prepare user directories: {error}");
            }
            if let Err(error) = user_files::start_watcher(app.handle().clone()) {
                eprintln!("failed to start config watcher: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sidecar::start_session,
            sidecar::send_frame,
            sidecar::stop_session,
            runtime::runtime_status,
            runtime::download_runtime,
            updates::update_feed_configured,
            updates::check_update,
            updates::install_update,
            updates::restart_app,
            user_files::load_ui_state,
            user_files::save_ui_state,
            user_files::load_settings,
            user_files::save_settings,
            user_files::open_plugins_folder,
            user_files::list_plugins,
            user_files::set_plugin_enabled,
            user_files::build_ui_plugin,
            user_files::list_themes,
            user_files::create_example_plugin,
        ])
        .build(tauri::generate_context!())
        .expect("error while building rpcdesk")
        .run(|app, event| {
            if matches!(
                event,
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
            ) {
                sidecar::stop_all(app);
            }
        });
}
