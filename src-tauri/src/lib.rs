// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf};
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn spawn_app(path: String, args: Vec<String>) -> Result<(), String> {
    if args.is_empty() {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg(path)
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        #[cfg(not(target_os = "windows"))]
        {
            std::process::Command::new(path)
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
    } else {
        std::process::Command::new(path)
            .args(args)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LauncherState {
    version: u8,
    #[serde(rename = "activeGroupId")]
    active_group_id: String,
    groups: Vec<Group>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Group {
    id: String,
    name: String,
    apps: Vec<AppEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppEntry {
    id: String,
    name: String,
    path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    args: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    icon: Option<String>,
    #[serde(rename = "addedAt")]
    added_at: i64,
}

fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base_dir = app.path().local_data_dir().map_err(|e| e.to_string())?;
    Ok(base_dir.join("my-quickstart").join("launcher.db"))
}

fn open_db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    conn.execute_batch(
        r#"
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  args TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL,
  added_at INTEGER NOT NULL,
  FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE
);
"#,
    )
    .map_err(|e| e.to_string())?;

    let has_icon: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM pragma_table_info('apps') WHERE name = 'icon'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_icon == 0 {
        let _ = conn.execute(
            "ALTER TABLE apps ADD COLUMN icon TEXT NOT NULL DEFAULT ''",
            [],
        );
    }
    Ok(conn)
}

#[tauri::command]
fn load_launcher_state(app: tauri::AppHandle) -> Result<Option<LauncherState>, String> {
    let conn = open_db(&app)?;

    let has_any: i64 = conn
        .query_row("SELECT COUNT(1) FROM groups", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if has_any == 0 {
        return Ok(None);
    }

    let active_group_id: String = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'active_group_id' LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| String::new());

    let mut groups_stmt = conn
        .prepare("SELECT id, name FROM groups ORDER BY position ASC")
        .map_err(|e| e.to_string())?;
    let group_rows = groups_stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    let mut groups: Vec<Group> = Vec::new();
    for row in group_rows {
        let (id, name) = row.map_err(|e| e.to_string())?;
        groups.push(Group {
            id,
            name,
            apps: Vec::new(),
        });
    }

    let mut apps_stmt = conn
        .prepare(
            "SELECT id, group_id, name, path, args, icon, added_at FROM apps ORDER BY position ASC",
        )
        .map_err(|e| e.to_string())?;
    let app_rows = apps_stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, i64>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut apps_by_group: HashMap<String, Vec<AppEntry>> = HashMap::new();
    for row in app_rows {
        let (id, group_id, name, path, args, icon, added_at) = row.map_err(|e| e.to_string())?;
        let args_opt = if args.trim().is_empty() {
            None
        } else {
            Some(args)
        };
        let icon_opt = if icon.trim().is_empty() { None } else { Some(icon) };
        apps_by_group.entry(group_id).or_default().push(AppEntry {
            id,
            name,
            path,
            args: args_opt,
            icon: icon_opt,
            added_at,
        });
    }

    for g in &mut groups {
        if let Some(apps) = apps_by_group.remove(&g.id) {
            g.apps = apps;
        }
    }

    let active = if !active_group_id.is_empty()
        && groups.iter().any(|g| g.id == active_group_id)
    {
        active_group_id
    } else {
        groups
            .first()
            .map(|g| g.id.clone())
            .unwrap_or_else(String::new)
    };

    Ok(Some(LauncherState {
        version: 1,
        active_group_id: active,
        groups,
    }))
}

#[tauri::command]
fn save_launcher_state(app: tauri::AppHandle, state: LauncherState) -> Result<(), String> {
    let mut conn = open_db(&app)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM apps", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM groups", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM meta", []).map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO meta(key, value) VALUES('active_group_id', ?1)",
        params![state.active_group_id],
    )
    .map_err(|e| e.to_string())?;

    for (group_pos, group) in state.groups.iter().enumerate() {
        tx.execute(
            "INSERT INTO groups(id, name, position) VALUES(?1, ?2, ?3)",
            params![group.id, group.name, group_pos as i64],
        )
        .map_err(|e| e.to_string())?;

        for (app_pos, app_entry) in group.apps.iter().enumerate() {
            tx.execute(
                "INSERT INTO apps(id, group_id, name, path, args, icon, position, added_at)
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    app_entry.id,
                    group.id,
                    app_entry.name,
                    app_entry.path,
                    app_entry.args.clone().unwrap_or_default(),
                    app_entry.icon.clone().unwrap_or_default(),
                    app_pos as i64,
                    app_entry.added_at
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_file_icon(path: String) -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        return get_file_icon_windows(&path).map(Some).or(Ok(None));
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Ok(None)
    }
}

#[cfg(target_os = "windows")]
fn get_file_icon_windows(path: &str) -> Result<String, String> {
    use base64::Engine;
    use image::codecs::png::PngEncoder;
    use image::ColorType;
    use image::ImageEncoder;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
        BI_RGB, DIB_RGB_COLORS, HBITMAP,
    };
    use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
    use windows::Win32::UI::WindowsAndMessaging::{
        DestroyIcon, GetIconInfo, HICON, ICONINFO,
    };

    let mut wide: Vec<u16> = path.encode_utf16().collect();
    wide.push(0);

    let mut info = SHFILEINFOW::default();
    let res = unsafe {
        SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut info),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        )
    };
    if res == 0 || info.hIcon == HICON(0) {
        return Err("icon not found".to_string());
    }

    let hicon = info.hIcon;
    let mut icon_info = ICONINFO::default();
    unsafe { GetIconInfo(hicon, &mut icon_info).map_err(|e| e.to_string())? };

    let color = icon_info.hbmColor;
    if color == HBITMAP(0) {
        unsafe {
            if icon_info.hbmMask != HBITMAP(0) {
                let _ = DeleteObject(icon_info.hbmMask);
            }
            let _ = DestroyIcon(hicon);
        }
        return Err("no color bitmap".to_string());
    }

    let mut bm = BITMAP::default();
    let got = unsafe { GetObjectW(color, std::mem::size_of::<BITMAP>() as i32, Some(&mut bm as *mut _ as *mut _)) };
    if got == 0 {
        unsafe {
            let _ = DeleteObject(color);
            if icon_info.hbmMask != HBITMAP(0) {
                let _ = DeleteObject(icon_info.hbmMask);
            }
            let _ = DestroyIcon(hicon);
        }
        return Err("GetObjectW failed".to_string());
    }

    let width = bm.bmWidth.max(0) as i32;
    let height = bm.bmHeight.max(0) as i32;
    if width == 0 || height == 0 {
        unsafe {
            let _ = DeleteObject(color);
            if icon_info.hbmMask != HBITMAP(0) {
                let _ = DeleteObject(icon_info.hbmMask);
            }
            let _ = DestroyIcon(hicon);
        }
        return Err("invalid bitmap size".to_string());
    }

    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0 as u32,
            biSizeImage: (width * height * 4) as u32,
            ..Default::default()
        },
        ..Default::default()
    };

    let mut bgra = vec![0u8; (width * height * 4) as usize];
    let hdc = unsafe { GetDC(HWND(0)) };
    let scan_lines = unsafe {
        GetDIBits(
            hdc,
            color,
            0,
            height as u32,
            Some(bgra.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        )
    };
    unsafe { ReleaseDC(HWND(0), hdc) };

    if scan_lines == 0 {
        unsafe {
            let _ = DeleteObject(color);
            if icon_info.hbmMask != HBITMAP(0) {
                let _ = DeleteObject(icon_info.hbmMask);
            }
            let _ = DestroyIcon(hicon);
        }
        return Err("GetDIBits failed".to_string());
    }

    let mut rgba = bgra;
    for px in rgba.chunks_exact_mut(4) {
        let b = px[0];
        let r = px[2];
        px[0] = r;
        px[2] = b;
    }

    unsafe {
        let _ = DeleteObject(color);
        if icon_info.hbmMask != HBITMAP(0) {
            let _ = DeleteObject(icon_info.hbmMask);
        }
        let _ = DestroyIcon(hicon);
    }

    let mut png = Vec::new();
    let encoder = PngEncoder::new(&mut png);
    encoder
        .write_image(&rgba, width as u32, height as u32, ColorType::Rgba8.into())
        .map_err(|e| e.to_string())?;

    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png)
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            spawn_app,
            get_file_icon,
            load_launcher_state,
            save_launcher_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
