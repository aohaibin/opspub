use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

use crate::state::AppState;

pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    // 开发环境：给托盘图标右下角叠一个橙色小圆点角标，让 dev 实例和正式安装版一眼区分；正式版用原图。
    let base_icon = app.default_window_icon().ok_or("应用图标未配置")?;
    let icon: tauri::image::Image<'static> = if cfg!(debug_assertions) {
        add_dev_badge(base_icon)
    } else {
        tauri::image::Image::new_owned(
            base_icon.rgba().to_vec(),
            base_icon.width(),
            base_icon.height(),
        )
    };

    // tooltip 同步带 [DEV] 后缀，与角标呼应
    let tooltip = if cfg!(debug_assertions) {
        "OpsPub AI [DEV]"
    } else {
        "OpsPub AI"
    };

    TrayIconBuilder::new()
        .icon(icon)
        .tooltip(tooltip)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.state::<AppState>().terminals.close_all();
                app.state::<AppState>().sftps.close_all();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

/// 给托盘图标右下角叠一个橙色小圆点角标（仅开发环境调用），便于区分 dev 实例 / 正式安装版。
///
/// 直接在图标 RGBA 像素上画一个小实心圆 + 一圈深橙描边（保证任何底色都看得清），
/// 不做半透明混合，省掉再单独维护一套 dev 图标资源。
/// 半径取短边的 0.18，圆心落在右下角内缩 1px 处；数据异常时原样返回（不越界乱画）。
fn add_dev_badge(icon: &tauri::image::Image<'_>) -> tauri::image::Image<'static> {
    let w = icon.width();
    let h = icon.height();
    let mut rgba = icon.rgba().to_vec();
    if w == 0 || h == 0 || rgba.len() < (w * h * 4) as usize {
        return tauri::image::Image::new_owned(rgba, w, h);
    }

    // 角标半径取短边的 0.18（小角标即可，够眼睛分辨就行），圆心落在右下角内缩 1px
    let r = (w.min(h) as f32) * 0.18;
    let cx = w as f32 - r - 1.0;
    let cy = h as f32 - r - 1.0;
    let edge = r * 0.25; // 外圈深橙描边宽度

    for y in 0..h {
        for x in 0..w {
            let dx = x as f32 + 0.5 - cx;
            let dy = y as f32 + 0.5 - cy;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist > r {
                continue;
            }
            let idx = ((y * w + x) * 4) as usize;
            // 外缘一圈深橙描边、内部亮橙实心
            let (cr, cg, cb) = if dist >= r - edge {
                (198u8, 80, 0)
            } else {
                (255u8, 149, 0)
            };
            rgba[idx] = cr;
            rgba[idx + 1] = cg;
            rgba[idx + 2] = cb;
            rgba[idx + 3] = 255;
        }
    }

    tauri::image::Image::new_owned(rgba, w, h)
}
