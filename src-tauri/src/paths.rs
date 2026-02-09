use std::path::{Path, PathBuf};

pub(crate) fn is_special_path(path: &str) -> bool {
    let lower = path.trim().to_ascii_lowercase();
    lower.starts_with("shell:") || lower.starts_with("uwp:")
}

pub(crate) fn app_base_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
}

fn make_relative_path_inner(path: &Path, base: &Path) -> Option<PathBuf> {
    let path_components: Vec<_> = path.components().collect();
    let base_components: Vec<_> = base.components().collect();
    if path_components.is_empty() || base_components.is_empty() {
        return None;
    }
    if let (Some(std::path::Component::Prefix(p1)), Some(std::path::Component::Prefix(p2))) =
        (path_components.first(), base_components.first())
    {
        if p1.kind() != p2.kind() {
            return None;
        }
    }

    let mut idx = 0usize;
    while idx < path_components.len()
        && idx < base_components.len()
        && path_components[idx] == base_components[idx]
    {
        idx += 1;
    }

    let mut rel = PathBuf::new();
    for _ in idx..base_components.len() {
        rel.push("..");
    }
    for comp in &path_components[idx..] {
        rel.push(comp.as_os_str());
    }
    if rel.as_os_str().is_empty() {
        rel.push(".");
    }
    Some(rel)
}

pub(crate) fn resolve_launch_path(path: &str) -> String {
    if path.trim().is_empty() || is_special_path(path) {
        return path.to_string();
    }
    let p = Path::new(path);
    if p.is_absolute() {
        return path.to_string();
    }
    if let Some(base) = app_base_dir() {
        return base.join(p).to_string_lossy().to_string();
    }
    path.to_string()
}

#[tauri::command]
pub fn make_relative_path(path: String) -> Result<String, String> {
    if path.trim().is_empty() || is_special_path(&path) {
        return Ok(path);
    }
    let base = app_base_dir().ok_or_else(|| "base dir not found".to_string())?;
    let p = Path::new(&path);
    if !p.is_absolute() {
        return Ok(path);
    }
    let rel = make_relative_path_inner(p, &base).unwrap_or_else(|| p.to_path_buf());
    Ok(rel.to_string_lossy().to_string())
}

#[tauri::command]
pub fn validate_paths(paths: Vec<String>) -> Vec<bool> {
    paths
        .iter()
        .map(|p| {
            let trimmed = p.trim();
            if trimmed.is_empty() {
                return false;
            }
            if is_special_path(trimmed) {
                return true;
            }
            let resolved = resolve_launch_path(trimmed);
            Path::new(&resolved).exists()
        })
        .collect()
}

