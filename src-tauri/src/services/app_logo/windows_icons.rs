use std::{
    cell::Cell,
    fs,
    io::Write,
    os::windows::ffi::OsStringExt,
    path::{Path, PathBuf},
};

use tauri::{AppHandle, Manager};
use windows::{
    core::{Interface, GUID, HSTRING, PCWSTR},
    Win32::{
        Foundation::{LPARAM, WPARAM},
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IPersistFile,
            CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READ,
        },
        UI::{
            Shell::{
                FOLDERID_Desktop, FOLDERID_Programs, IShellLinkW, SHChangeNotify,
                SHGetKnownFolderPath, ShellLink, KF_FLAG_DEFAULT, SHCNE_UPDATEITEM, SHCNF_PATHW,
            },
            WindowsAndMessaging::{
                DestroyIcon, LoadImageW, SendMessageW, HICON, ICON_BIG, IMAGE_ICON, LR_DEFAULTSIZE,
                LR_LOADFROMFILE, WM_SETICON,
            },
        },
    },
};

use super::{LogoAssets, LogoSyncResult};

thread_local! {
    static TASKBAR_ICON: Cell<HICON> = Cell::new(HICON::default());
}

pub(super) fn sync(app: &AppHandle, assets: LogoAssets) -> LogoSyncResult {
    let mut result = LogoSyncResult {
        desktop_shortcut: "unsupported",
        warnings: Vec::new(),
    };
    let icon_path = match write_icon(app, &assets) {
        Ok(path) => path,
        Err(error) => {
            result.desktop_shortcut = "failed";
            result
                .warnings
                .push(format!("无法保存 Windows 图标：{error}"));
            return result;
        }
    };

    if let Err(error) = set_taskbar_icon(app, icon_path.clone()) {
        result.warnings.push(format!("任务栏图标同步失败：{error}"));
    }
    // 开发版只更新自己的运行图标，快捷方式仍由正式安装管理。
    if !cfg!(debug_assertions) {
        result.desktop_shortcut = match sync_shortcuts(&icon_path) {
            Ok(true) => "synced",
            Ok(false) => "missing",
            Err(error) => {
                result
                    .warnings
                    .push(format!("Windows 快捷方式图标同步失败：{error}"));
                "failed"
            }
        };
    }
    result
}

fn write_icon(app: &AppHandle, assets: &LogoAssets) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let folder = app.path().app_data_dir()?.join("icons");
    fs::create_dir_all(&folder)?;
    let path = folder.join(format!("opspub-{}.ico", assets.key));
    if fs::read(&path).as_deref().ok() != Some(assets.shortcut) {
        let mut temporary = tempfile::NamedTempFile::new_in(&folder)?;
        temporary.write_all(assets.shortcut)?;
        temporary.persist(&path)?;
    }
    Ok(path)
}

fn set_taskbar_icon(app: &AppHandle, path: PathBuf) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    let (send, receive) = std::sync::mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let result = (|| {
            let hwnd = window.hwnd().map_err(|error| error.to_string())?;
            let filename = HSTRING::from(path.as_os_str());
            // Tao 的 set_window_icon 只设置 ICON_SMALL，任务栏读取的是 ICON_BIG。
            unsafe {
                let icon = LoadImageW(
                    None,
                    &filename,
                    IMAGE_ICON,
                    0,
                    0,
                    LR_LOADFROMFILE | LR_DEFAULTSIZE,
                )
                .map_err(|error| error.to_string())?;
                SendMessageW(
                    hwnd,
                    WM_SETICON,
                    Some(WPARAM(ICON_BIG as usize)),
                    Some(LPARAM(icon.0 as isize)),
                );
                TASKBAR_ICON.with(|current| {
                    let previous = current.replace(HICON(icon.0));
                    if !previous.0.is_null() {
                        let _ = DestroyIcon(previous);
                    }
                });
            }
            Ok(())
        })();
        let _ = send.send(result);
    })
    .map_err(|error| error.to_string())?;
    receive.recv().map_err(|error| error.to_string())?
}

fn known_folder(id: &GUID) -> windows::core::Result<PathBuf> {
    unsafe {
        let location = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None)?;
        let path = PathBuf::from(std::ffi::OsString::from_wide(location.as_wide()));
        CoTaskMemFree(Some(location.0.cast()));
        Ok(path)
    }
}

struct ComApartment;

impl ComApartment {
    fn open() -> windows::core::Result<Self> {
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()? };
        Ok(Self)
    }
}

impl Drop for ComApartment {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

fn sync_shortcuts(icon_path: &Path) -> Result<bool, Box<dyn std::error::Error>> {
    let _com = ComApartment::open()?;
    let executable = std::env::current_exe()?;
    let desktop = known_folder(&FOLDERID_Desktop)?;
    let programs = known_folder(&FOLDERID_Programs)?;
    let icon = HSTRING::from(icon_path.as_os_str());
    let mut desktop_synced = false;
    let mut first_error = None;

    let desktop_links = fs::read_dir(desktop)?
        .filter_map(Result::ok)
        .map(|entry| entry.path());
    // NSIS may place the Start shortcut in Programs or an immediate subfolder.
    let start_links = fs::read_dir(&programs)?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.path().join("OpsPub.lnk"))
        .chain(std::iter::once(programs.join("OpsPub.lnk")));
    for (path, on_desktop) in desktop_links.map(|path| (path, true)).chain(
        start_links
            .filter(|path| path.is_file())
            .map(|path| (path, false)),
    ) {
        if !path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("lnk"))
            || path.is_symlink()
        {
            continue;
        }
        match update_shortcut(&path, &executable, &icon) {
            Ok(matches) => desktop_synced |= on_desktop && matches,
            Err(error) => {
                first_error.get_or_insert(error);
            }
        }
    }
    match first_error {
        Some(error) => Err(error.into()),
        None => Ok(desktop_synced),
    }
}

fn update_shortcut(path: &Path, executable: &Path, icon: &HSTRING) -> windows::core::Result<bool> {
    let filename = HSTRING::from(path.as_os_str());
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        let persist: IPersistFile = link.cast()?;
        // Unrelated shortcuts (including advertised MSI links) can lack a filesystem target.
        if persist.Load(&filename, STGM_READ).is_err() {
            return Ok(false);
        }
        let mut target = [0; 1024];
        if link.GetPath(&mut target, std::ptr::null_mut(), 0).is_err() {
            return Ok(false);
        }
        let len = target
            .iter()
            .position(|&value| value == 0)
            .unwrap_or(target.len());
        if len == 0 {
            return Ok(false);
        }
        let target = PathBuf::from(std::ffi::OsString::from_wide(&target[..len]));
        // Compare the stored target without touching any unrelated filesystem or network path.
        if !target
            .as_os_str()
            .eq_ignore_ascii_case(executable.as_os_str())
        {
            return Ok(false);
        }

        let mut current = [0; 1024];
        let mut index = 0;
        if link.GetIconLocation(&mut current, &mut index).is_ok()
            && index == 0
            && PCWSTR(current.as_ptr()).as_wide() == &**icon
        {
            return Ok(true);
        }
        link.SetIconLocation(icon, 0)?;
        persist.Save(&filename, true)?;
        SHChangeNotify(
            SHCNE_UPDATEITEM,
            SHCNF_PATHW,
            Some(filename.as_ptr().cast()),
            None,
        );
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn updates_only_shortcuts_to_current_executable() -> Result<(), Box<dyn std::error::Error>> {
        let _com = ComApartment::open()?;
        let fixture = tempfile::tempdir()?;
        let shortcut = fixture.path().join("OpsPub.lnk");
        let filename = HSTRING::from(shortcut.as_os_str());
        let target = std::env::current_exe()?;
        let icon_path = fixture.path().join("opspub-violet.ico");
        fs::write(
            &icon_path,
            super::super::LogoColor::Violet.assets().shortcut,
        )?;
        let icon = HSTRING::from(icon_path.as_os_str());
        unsafe {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
            let persist: IPersistFile = link.cast()?;
            link.SetPath(&HSTRING::from(target.as_os_str()))?;
            link.SetArguments(windows::core::w!("--fixture"))?;
            persist.Save(&filename, true)?;
        }

        let original = fs::read(&shortcut)?;
        assert!(!update_shortcut(
            &shortcut,
            &fixture.path().join("other.exe"),
            &icon
        )?);
        assert_eq!(fs::read(&shortcut)?, original);
        assert!(update_shortcut(&shortcut, &target, &icon)?);

        unsafe {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
            let persist: IPersistFile = link.cast()?;
            persist.Load(&filename, STGM_READ)?;
            let mut buffer = [0; 1024];
            let mut index = -1;
            link.GetIconLocation(&mut buffer, &mut index)?;
            assert_eq!(PCWSTR(buffer.as_ptr()).as_wide(), &*icon);
            assert_eq!(index, 0);
            link.GetArguments(&mut buffer)?;
            assert_eq!(PCWSTR(buffer.as_ptr()).to_string()?, "--fixture");
        }
        Ok(())
    }
}
