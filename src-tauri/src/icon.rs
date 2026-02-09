use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

#[derive(Clone, Hash, Eq, PartialEq)]
struct IconKey {
    path: String,
    size: u32,
}

struct CacheEntry {
    data: Option<String>,
    created_at: Instant,
}

const NEGATIVE_CACHE_TTL_SECS: u64 = 300;

static ICON_CACHE: OnceLock<Mutex<HashMap<IconKey, CacheEntry>>> = OnceLock::new();

fn get_icon_cache() -> &'static Mutex<HashMap<IconKey, CacheEntry>> {
    ICON_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn hash_key(key: &IconKey) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(format!("{}:{}", key.path, key.size).as_bytes());
    hex::encode(hasher.finalize())
}

fn get_cache_dir(_app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let base = crate::paths::app_base_dir().ok_or("Cannot determine exe directory")?;
    let path = base.join("data").join("icon-cache");
    if !path.exists() {
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

fn disk_get(app: &tauri::AppHandle, key: &IconKey) -> Option<String> {
    let cache_dir = get_cache_dir(app).ok()?;
    let hash = hash_key(key);
    let file_path = cache_dir.join(format!("{}.png", hash));

    if file_path.exists() {
        let bytes = std::fs::read(file_path).ok()?;
        use base64::Engine;
        return Some(format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        ));
    }
    None
}

fn disk_put(app: &tauri::AppHandle, key: &IconKey, data: &str) {
    if let Ok(cache_dir) = get_cache_dir(app) {
        let hash = hash_key(key);
        let file_path = cache_dir.join(format!("{}.png", hash));
        if file_path.exists() {
            return;
        }

        if let Some(base64_part) = data.strip_prefix("data:image/png;base64,") {
            use base64::Engine;
            if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(base64_part) {
                let _ = std::fs::write(file_path, bytes);
            }
        }
    }
}

#[tauri::command]
pub async fn get_file_icon(
    app: tauri::AppHandle,
    path: String,
    size: Option<u32>,
) -> Result<Option<String>, String> {
    let icon_size = size.unwrap_or(32);
    let key = IconKey {
        path: path.clone(),
        size: icon_size,
    };

    // 1. Check memory cache (fast)
    {
        let cache = get_icon_cache().lock().map_err(|e| e.to_string())?;
        if let Some(entry) = cache.get(&key) {
            if entry.data.is_some() {
                return Ok(entry.data.clone());
            }
            if entry.created_at.elapsed().as_secs() < NEGATIVE_CACHE_TTL_SECS {
                return Ok(None);
            }
        }
    }

    // 2. Check disk cache
    let app_clone = app.clone();
    let key_clone = key.clone();
    if let Some(data) = tauri::async_runtime::spawn_blocking(move || disk_get(&app_clone, &key_clone))
        .await
        .map_err(|e| e.to_string())?
    {
        // Fill memory cache
        if let Ok(mut cache) = get_icon_cache().lock() {
            cache.insert(
                key,
                CacheEntry {
                    data: Some(data.clone()),
                    created_at: Instant::now(),
                },
            );
        }
        return Ok(Some(data));
    }

    // 3. Extract icon (slow, must be in blocking thread)
    #[cfg(target_os = "windows")]
    {
        let path_for_spawn = path.clone();
        let result =
            tauri::async_runtime::spawn_blocking(move || get_file_icon_windows(&path_for_spawn, icon_size))
                .await
                .map_err(|e| e.to_string())?;

        // Update caches
        if let Ok(data) = &result {
            let app_for_put = app.clone();
            let key_for_put = key.clone();
            let data_for_put = data.clone();
            tauri::async_runtime::spawn_blocking(move || {
                disk_put(&app_for_put, &key_for_put, &data_for_put)
            });
        }

        let cache_entry = CacheEntry {
            data: result.as_ref().ok().cloned(),
            created_at: Instant::now(),
        };
        if let Ok(mut cache) = get_icon_cache().lock() {
            cache.insert(key, cache_entry);
        }
        return result.map(Some).or(Ok(None));
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        let _ = path;
        let _ = icon_size;
        Ok(None)
    }
}

#[cfg(target_os = "windows")]
mod gdi_guards {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{DeleteObject, ReleaseDC, HBITMAP, HDC};
    use windows::Win32::System::Com::CoUninitialize;
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, HICON};

    pub struct HiconGuard(pub HICON);
    impl Drop for HiconGuard {
        fn drop(&mut self) {
            if !self.0 .0.is_null() {
                unsafe {
                    let _ = DestroyIcon(self.0);
                }
            }
        }
    }

    pub struct HbitmapGuard(pub HBITMAP);
    impl Drop for HbitmapGuard {
        fn drop(&mut self) {
            if !self.0 .0.is_null() {
                unsafe {
                    let _ = DeleteObject(self.0.into());
                }
            }
        }
    }

    pub struct HdcGuard {
        pub hdc: HDC,
        pub hwnd: Option<HWND>,
    }
    impl Drop for HdcGuard {
        fn drop(&mut self) {
            if !self.hdc.0.is_null() {
                unsafe {
                    let _ = ReleaseDC(self.hwnd, self.hdc);
                }
            }
        }
    }

    pub struct CoGuard(pub bool);
    impl Drop for CoGuard {
        fn drop(&mut self) {
            if self.0 {
                unsafe {
                    CoUninitialize();
                }
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn hbitmap_to_png_data_url(
    color: windows::Win32::Graphics::Gdi::HBITMAP,
) -> Result<String, String> {
    use base64::Engine;
    use gdi_guards::HdcGuard;
    use image::codecs::png::PngEncoder;
    use image::ImageEncoder;
    use windows::Win32::Graphics::Gdi::{
        GetDC, GetDIBits, GetObjectW, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DIB_RGB_COLORS,
    };

    if color.0.is_null() {
        return Err("null bitmap".to_string());
    }

    let mut bm = BITMAP::default();
    let got = unsafe {
        GetObjectW(
            color.into(),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut _ as *mut _),
        )
    };
    if got == 0 {
        return Err("GetObjectW failed".to_string());
    }

    let width = bm.bmWidth.max(0) as i32;
    let height = bm.bmHeight.max(0) as i32;
    if width == 0 || height == 0 {
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
    let hdc = unsafe { GetDC(None) };
    let _hdc_guard = HdcGuard {
        hdc,
        hwnd: None,
    };

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

    if scan_lines == 0 {
        return Err("GetDIBits failed".to_string());
    }

    let mut rgba = bgra;
    for px in rgba.chunks_exact_mut(4) {
        let b = px[0];
        let r = px[2];
        px[0] = r;
        px[2] = b;
    }

    let mut png = Vec::new();
    let encoder = PngEncoder::new(&mut png);
    encoder
        .write_image(
            &rgba,
            width as u32,
            height as u32,
            image::ColorType::Rgba8.into(),
        )
        .map_err(|e| e.to_string())?;

    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png)
    ))
}

#[cfg(target_os = "windows")]
fn get_file_icon_windows(path: &str, size: u32) -> Result<String, String> {
    use gdi_guards::{CoGuard, HbitmapGuard, HiconGuard};
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
    use windows::Win32::System::Com::IBindCtx;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{
        IShellItemImageFactory, SHCreateItemFromParsingName, SHGetFileInfoW, SHFILEINFOW,
        SHGFI_ICON, SHGFI_LARGEICON, SHGFI_SMALLICON, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetIconInfo, ICONINFO};

    let mut wide: Vec<u16> = path.encode_utf16().collect();
    wide.push(0);

    if path.to_ascii_lowercase().starts_with("shell:appsfolder\\") {
        let co_init_result = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        let _co_guard = CoGuard(co_init_result.is_ok());

        let factory: IShellItemImageFactory = unsafe {
            SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None::<&IBindCtx>)
                .map_err(|e| e.to_string())?
        };
        let hbmp = unsafe {
            factory
                .GetImage(
                    SIZE {
                        cx: size as i32,
                        cy: size as i32,
                    },
                    SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK,
                )
                .map_err(|e| e.to_string())?
        };
        let _hbmp_guard = HbitmapGuard(hbmp);
        return hbitmap_to_png_data_url(hbmp);
    }

    let mut info = SHFILEINFOW::default();
    let flags = if size > 16 {
        SHGFI_ICON | SHGFI_LARGEICON
    } else {
        SHGFI_ICON | SHGFI_SMALLICON
    };
    let res = unsafe {
        SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut info),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            flags,
        )
    };
    if res == 0 || info.hIcon.0.is_null() {
        return Err("icon not found".to_string());
    }

    let _hicon_guard = HiconGuard(info.hIcon);
    let mut icon_info = ICONINFO::default();
    let got_icon_info = unsafe { GetIconInfo(info.hIcon, &mut icon_info) };

    // Wrap bitmaps as soon as possible, even if GetIconInfo failed
    let _mask_guard = HbitmapGuard(icon_info.hbmMask);
    let _color_guard = HbitmapGuard(icon_info.hbmColor);

    got_icon_info.map_err(|e| e.to_string())?;

    if icon_info.hbmColor.0.is_null() {
        return Err("no color bitmap".to_string());
    }

    hbitmap_to_png_data_url(icon_info.hbmColor)
}
