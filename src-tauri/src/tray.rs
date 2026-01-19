use tauri::menu::{MenuBuilder, MenuEvent, MenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

use crate::window_utils::show_main_window;

const TRAY_ID: &str = "main";
const MENU_SHOW: &str = "tray_show";
const MENU_EXIT: &str = "tray_exit";

#[allow(dead_code)]
pub struct TrayState(pub tauri::tray::TrayIcon<Wry>);

pub fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, MENU_SHOW, "Show", true, None::<String>)?;
    let exit = MenuItem::with_id(app, MENU_EXIT, "Exit", true, None::<String>)?;
    let menu = MenuBuilder::new(app).items(&[&show, &exit]).build()?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID).menu(&menu).tooltip("Quick Launcher");
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    let tray = builder
        .on_menu_event(|app: &AppHandle<Wry>, event: MenuEvent| {
            if event.id() == MENU_SHOW {
                show_main_window(app);
            } else if event.id() == MENU_EXIT {
                app.exit(0);
            }
        })
        .on_tray_icon_event(|tray: &TrayIcon<Wry>, event: TrayIconEvent| {
            if let TrayIconEvent::DoubleClick { .. } = event {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    app.manage(TrayState(tray));
    Ok(())
}
