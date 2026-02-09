use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LauncherState {
    pub version: u8,
    #[serde(rename = "activeGroupId")]
    pub active_group_id: String,
    pub groups: Vec<Group>,
    #[serde(default)]
    pub settings: UiSettings,
}

fn default_card_size() -> u32 {
    120
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiSettings {
    #[serde(rename = "language", default = "default_language")]
    pub language: String,
    #[serde(rename = "cardWidth", alias = "cardSize", default = "default_card_size")]
    pub card_width: u32,
    #[serde(rename = "cardHeight", default = "default_card_height")]
    pub card_height: u32,
    #[serde(rename = "toggleHotkey", default)]
    pub toggle_hotkey: String,
    #[serde(rename = "theme", default = "default_theme")]
    pub theme: String,
    #[serde(rename = "sidebarWidth", default = "default_sidebar_width")]
    pub sidebar_width: u32,
    #[serde(rename = "fontFamily", default = "default_font_family")]
    pub font_family: String,
    #[serde(rename = "fontSize", default = "default_font_size")]
    pub font_size: u32,
    #[serde(rename = "cardFontSize", default = "default_card_font_size")]
    pub card_font_size: u32,
    #[serde(rename = "cardIconScale", default = "default_card_icon_scale")]
    pub card_icon_scale: u32,
    #[serde(
        rename = "dblClickBlankToHide",
        default = "default_dbl_click_blank_to_hide"
    )]
    pub dbl_click_blank_to_hide: bool,
    #[serde(rename = "alwaysOnTop", default = "default_always_on_top")]
    pub always_on_top: bool,
    #[serde(rename = "hideOnStartup", default = "default_hide_on_startup")]
    pub hide_on_startup: bool,
    #[serde(rename = "useRelativePath", default = "default_use_relative_path")]
    pub use_relative_path: bool,
    #[serde(
        rename = "enableGroupDragSort",
        default = "default_enable_group_drag_sort"
    )]
    pub enable_group_drag_sort: bool,
    #[serde(rename = "autoStart", default)]
    pub auto_start: bool,
}

fn default_language() -> String {
    String::new()
}

fn default_card_height() -> u32 {
    96
}

fn default_theme() -> String {
    "dark".to_string()
}

fn default_sidebar_width() -> u32 {
    140
}

fn default_font_family() -> String {
    "maye".to_string()
}

fn default_font_size() -> u32 {
    13
}

fn default_card_font_size() -> u32 {
    11
}

fn default_card_icon_scale() -> u32 {
    56
}

fn default_dbl_click_blank_to_hide() -> bool {
    true
}

fn default_always_on_top() -> bool {
    true
}

fn default_hide_on_startup() -> bool {
    false
}

fn default_use_relative_path() -> bool {
    false
}

fn default_enable_group_drag_sort() -> bool {
    false
}

impl Default for UiSettings {
    fn default() -> Self {
        Self {
            language: default_language(),
            card_width: default_card_size(),
            card_height: default_card_height(),
            toggle_hotkey: String::new(),
            theme: default_theme(),
            sidebar_width: default_sidebar_width(),
            font_family: default_font_family(),
            font_size: default_font_size(),
            card_font_size: default_card_font_size(),
            card_icon_scale: default_card_icon_scale(),
            dbl_click_blank_to_hide: default_dbl_click_blank_to_hide(),
            always_on_top: default_always_on_top(),
            hide_on_startup: default_hide_on_startup(),
            use_relative_path: default_use_relative_path(),
            enable_group_drag_sort: default_enable_group_drag_sort(),
            auto_start: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub apps: Vec<AppEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(rename = "addedAt")]
    pub added_at: i64,
}

fn db_path(_app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = crate::paths::app_base_dir().ok_or("Cannot determine exe directory")?;
    Ok(base.join("data").join("launcher.db"))
}

fn legacy_db_paths(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    // 旧版: %localappdata%/my-quickstart/launcher.db
    if let Ok(p) = app.path().local_data_dir() {
        paths.push(p.join("my-quickstart").join("launcher.db"));
    }
    if let Ok(p) = app.path().app_local_data_dir() {
        paths.push(p.join("launcher.db"));
    }
    if let Ok(p) = app.path().app_data_dir() {
        paths.push(p.join("launcher.db"));
    }
    paths
}

fn count_groups_in_existing_db(path: &PathBuf) -> i64 {
    use rusqlite::OpenFlags;
    if !path.exists() {
        return 0;
    }
    let conn = match Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) {
        Ok(c) => c,
        Err(_) => return 0,
    };
    conn.query_row("SELECT COUNT(1) FROM groups", [], |r| r.get(0))
        .unwrap_or(0)
}

fn migrate_legacy_db_if_needed(app: &tauri::AppHandle, new_path: &PathBuf) -> Result<(), String> {
    let new_groups = count_groups_in_existing_db(new_path);
    let need_migration = !new_path.exists() || new_groups == 0;
    if !need_migration {
        return Ok(());
    }

    let legacy_paths = legacy_db_paths(app);
    let legacy_path = legacy_paths
        .into_iter()
        .find(|p| count_groups_in_existing_db(p) > 0);
    let Some(legacy_path) = legacy_path else {
        return Ok(());
    };

    if let Some(parent) = new_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(&legacy_path, new_path).map_err(|e| e.to_string())?;
    Ok(())
}

fn open_db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    migrate_legacy_db_if_needed(app, &path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "busy_timeout", "5000")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "cache_size", "-8000")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "temp_store", "2")
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
CREATE INDEX IF NOT EXISTS idx_apps_group_position ON apps(group_id, position);
CREATE TABLE IF NOT EXISTS app_icons (
  app_id TEXT PRIMARY KEY,
  icon TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
"#,
    )
    .map_err(|e| e.to_string())?;

    // Migration: apps.icon -> app_icons
    conn.execute(
        "INSERT OR IGNORE INTO app_icons (app_id, icon, updated_at)
         SELECT id, icon, added_at FROM apps WHERE icon != ''",
        [],
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
        let _ = conn.execute("ALTER TABLE apps ADD COLUMN icon TEXT NOT NULL DEFAULT ''", []);
    }
    Ok(conn)
}

#[tauri::command]
pub fn load_launcher_state(app: tauri::AppHandle) -> Result<Option<LauncherState>, String> {
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
            "SELECT a.id, a.group_id, a.name, a.path, a.args, COALESCE(i.icon, a.icon) as icon, a.added_at
             FROM apps a
             LEFT JOIN app_icons i ON a.id = i.app_id
             ORDER BY a.position ASC",
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
        let args_opt = if args.trim().is_empty() { None } else { Some(args) };
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

    let active = if !active_group_id.is_empty() && groups.iter().any(|g| g.id == active_group_id) {
        active_group_id
    } else {
        groups
            .first()
            .map(|g| g.id.clone())
            .unwrap_or_else(String::new)
    };

    let settings = load_ui_settings(&conn);

    Ok(Some(LauncherState {
        version: 1,
        active_group_id: active,
        groups,
        settings,
    }))
}

#[tauri::command]
pub fn save_launcher_state(app: tauri::AppHandle, state: LauncherState) -> Result<(), String> {
    let mut conn = open_db(&app)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // UPSERT meta
    tx.execute(
        "INSERT INTO meta(key, value) VALUES('active_group_id', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![state.active_group_id],
    )
    .map_err(|e| e.to_string())?;

    let settings_json = serde_json::to_string(&state.settings).map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO meta(key, value) VALUES('ui_settings', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![settings_json],
    )
    .map_err(|e| e.to_string())?;

    // Collect current IDs for diff delete
    let mut new_group_ids: HashSet<String> = HashSet::new();
    let mut new_app_ids: HashSet<String> = HashSet::new();

    // UPSERT groups
    for (group_pos, group) in state.groups.iter().enumerate() {
        new_group_ids.insert(group.id.clone());
        tx.execute(
            "INSERT INTO groups(id, name, position) VALUES(?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, position = excluded.position",
            params![group.id, group.name, group_pos as i64],
        )
        .map_err(|e| e.to_string())?;

        // UPSERT apps
        for (app_pos, app_entry) in group.apps.iter().enumerate() {
            new_app_ids.insert(app_entry.id.clone());
            tx.execute(
                "INSERT INTO apps(id, group_id, name, path, args, icon, position, added_at)
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(id) DO UPDATE SET
                   group_id = excluded.group_id,
                   name = excluded.name,
                   path = excluded.path,
                   args = excluded.args,
                   icon = excluded.icon,
                   position = excluded.position",
                params![
                    app_entry.id,
                    group.id,
                    app_entry.name,
                    app_entry.path,
                    app_entry.args.as_deref().unwrap_or(""),
                    app_entry.icon.as_deref().unwrap_or(""),
                    app_pos as i64,
                    app_entry.added_at
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // Delete removed apps (diff delete)
    if !new_app_ids.is_empty() {
        let placeholders: String = new_app_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("DELETE FROM apps WHERE id NOT IN ({})", placeholders);
        let params: Vec<&dyn rusqlite::ToSql> = new_app_ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        tx.execute(&sql, params.as_slice()).map_err(|e| e.to_string())?;
    } else {
        tx.execute("DELETE FROM apps", []).map_err(|e| e.to_string())?;
    }

    // Delete removed groups (diff delete)
    if !new_group_ids.is_empty() {
        let placeholders: String = new_group_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("DELETE FROM groups WHERE id NOT IN ({})", placeholders);
        let params: Vec<&dyn rusqlite::ToSql> = new_group_ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        tx.execute(&sql, params.as_slice()).map_err(|e| e.to_string())?;
    } else {
        tx.execute("DELETE FROM groups", []).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())
}

fn load_ui_settings(conn: &Connection) -> UiSettings {
    let settings_raw: String = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'ui_settings' LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| String::new());
    if settings_raw.trim().is_empty() {
        return UiSettings::default();
    }
    serde_json::from_str::<UiSettings>(&settings_raw).unwrap_or_else(|_| UiSettings::default())
}

pub(crate) fn load_saved_hotkey(app: &tauri::AppHandle) -> Option<String> {
    let conn = open_db(app).ok()?;
    let settings = load_ui_settings(&conn);
    let v = settings.toggle_hotkey.trim().to_string();
    if v.is_empty() {
        None
    } else {
        Some(v)
    }
}

pub(crate) fn should_hide_on_startup(app: &tauri::AppHandle) -> bool {
    let conn = match open_db(app) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let settings = load_ui_settings(&conn);
    settings.hide_on_startup
}
