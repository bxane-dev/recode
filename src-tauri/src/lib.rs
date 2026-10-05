mod commands;
mod models;
mod platform;
mod scanner;
mod stores;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::scan_installed_games,
            commands::list_processes,
            commands::list_modules,
            commands::resolve_pointer_chain,
            commands::find_signature,
            commands::start_scan,
            commands::rescan,
            commands::write_value,
            commands::clear_scan,
            commands::read_profile_file,
            commands::write_profile_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Recode");
}
