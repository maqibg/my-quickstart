use std::sync::Mutex;

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::window_utils::toggle_main_window;

pub struct HotkeyState(pub Mutex<Option<String>>);

pub fn handle_shortcut_event(app: &AppHandle, event_state: ShortcutState) {
    if event_state != ShortcutState::Pressed {
        return;
    }
    toggle_main_window(app);
}

pub fn apply_hotkey(app: &AppHandle, hotkey_state: &HotkeyState, hotkey: String) -> Result<(), String> {
    let normalized = hotkey.trim().to_lowercase();
    let requested = if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    };

    let mut current = hotkey_state.0.lock().map_err(|_| "lock failed".to_string())?;
    if *current == requested {
        return Ok(());
    }

    let gs = app.global_shortcut();
    match requested.as_ref() {
        None => {
            if let Some(existing) = current.as_ref() {
                let _ = gs.unregister(existing.as_str());
            }
            *current = None;
        }
        Some(next) => {
            gs.register(next.as_str()).map_err(|e| e.to_string())?;
            if let Some(existing) = current.as_ref() {
                let _ = gs.unregister(existing.as_str());
            }
            *current = Some(next.clone());
        }
    }
    Ok(())
}

pub fn init_from_saved_hotkey(app: &AppHandle, hotkey_state: &HotkeyState, saved: Option<String>) {
    if let Some(hotkey) = saved {
        let _ = apply_hotkey(app, hotkey_state, hotkey);
    }
}
