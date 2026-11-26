#[cfg(windows)]
mod windows_icons;

use serde::{Deserialize, Serialize};
use tauri::{image::Image, AppHandle, Manager};

use crate::{error::AppError, state::AppState, tray};

const LOGO_COLOR_KEY: &str = "ui.logo_color";
static LOGO_UPDATE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LogoColor {
    Mint,
    TechBlue,
    ChinaRed,
    Violet,
    WarmOrange,
    Graphite,
}

macro_rules! logo_assets {
    ($name:literal) => {
        LogoAssets {
            key: $name,
            app: include_bytes!(concat!(
                "../../../docs/icons/app-icon/",
                $name,
                "-squircle.png"
            )),
            #[cfg(windows)]
            shortcut: include_bytes!(concat!("../../../docs/icons/desktop/", $name, ".ico")),
        }
    };
}

struct LogoAssets {
    key: &'static str,
    app: &'static [u8],
    #[cfg(windows)]
    shortcut: &'static [u8],
}

impl LogoColor {
    fn assets(self) -> LogoAssets {
        match self {
            Self::Mint => logo_assets!("mint"),
            Self::TechBlue => logo_assets!("tech-blue"),
            Self::ChinaRed => logo_assets!("china-red"),
            Self::Violet => logo_assets!("violet"),
            Self::WarmOrange => logo_assets!("warm-orange"),
            Self::Graphite => logo_assets!("graphite"),
        }
    }

    fn from_saved(value: &str) -> Self {
        match value {
            "tech-blue" => Self::TechBlue,
            "china-red" => Self::ChinaRed,
            "violet" => Self::Violet,
            "warm-orange" => Self::WarmOrange,
            "graphite" => Self::Graphite,
            _ => Self::Mint,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogoSyncResult {
    desktop_shortcut: &'static str,
    warnings: Vec<String>,
}

pub async fn save(app: AppHandle, color: LogoColor) -> Result<LogoSyncResult, AppError> {
    let _update = LOGO_UPDATE.lock().await;
    let assets = color.assets();
    let image = Image::from_bytes(assets.app)
        .map_err(|error| AppError::Custom(format!("无法加载应用图标：{error}")))?;
    app.state::<AppState>()
        .db
        .set_config(LOGO_COLOR_KEY, assets.key)?;
    Ok(apply(app, assets, image).await)
}

pub fn restore(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _update = LOGO_UPDATE.lock().await;
        let saved = match app.state::<AppState>().db.get_config(LOGO_COLOR_KEY) {
            Ok(value) => value,
            Err(error) => {
                log::warn!("读取 Logo 配色失败：{error}");
                return;
            }
        };
        // 首次启动也同步默认配色，覆盖已有快捷方式可能引用的旧图标。
        let assets = LogoColor::from_saved(saved.as_deref().unwrap_or_default()).assets();
        match Image::from_bytes(assets.app) {
            Ok(image) => {
                for warning in apply(app, assets, image).await.warnings {
                    log::warn!("{warning}");
                }
            }
            Err(error) => log::warn!("恢复应用图标失败：{error}"),
        }
    });
}

async fn apply(app: AppHandle, assets: LogoAssets, image: Image<'static>) -> LogoSyncResult {
    let mut result = LogoSyncResult {
        desktop_shortcut: "unsupported",
        warnings: Vec::new(),
    };

    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window.set_icon(image.clone()) {
            result.warnings.push(format!("窗口图标同步失败：{error}"));
        }
    }
    if let Some(tray) = app.tray_by_id(tray::TRAY_ID) {
        let icon = if cfg!(debug_assertions) {
            tray::add_dev_badge(&image)
        } else {
            image
        };
        if let Err(error) = tray.set_icon(Some(icon)) {
            result.warnings.push(format!("托盘图标同步失败：{error}"));
        }
    }

    #[cfg(windows)]
    match tauri::async_runtime::spawn_blocking(move || windows_icons::sync(&app, assets)).await {
        Ok(native) => {
            result.desktop_shortcut = native.desktop_shortcut;
            result.warnings.extend(native.warnings);
        }
        Err(error) => {
            result.desktop_shortcut = "failed";
            result
                .warnings
                .push(format!("系统图标同步任务失败：{error}"));
        }
    }
    #[cfg(not(windows))]
    let _ = assets;
    result
}
