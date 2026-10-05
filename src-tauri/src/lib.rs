mod commands;
mod models;
mod platform;
mod scanner;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::list_processes,
            commands::list_modules,
            commands::resolve_pointer_chain,
            commands::start_scan,
            commands::rescan,
            commands::write_value,
            commands::clear_scan
        ])
        .run(tauri::generate_context!())
        .expect("error while running Recode");
}
