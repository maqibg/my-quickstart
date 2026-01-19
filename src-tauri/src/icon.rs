#[tauri::command]
pub fn get_file_icon(path: String) -> Result<Option<String>, String> {
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
    use image::ImageEncoder;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP,
    };
    use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO};

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
    let got = unsafe {
        GetObjectW(
            color,
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut _ as *mut _),
        )
    };
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

