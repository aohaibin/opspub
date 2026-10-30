use crate::error::CommandError;
use std::path::PathBuf;
use tauri::Manager;

fn skill_file_path(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, CommandError> {
    if name.is_empty()
        || name.len() > 64
        || !name.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_lowercase()
                || byte.is_ascii_digit()
                || (index > 0 && matches!(byte, b'-' | b'_'))
        })
    {
        return Err(CommandError {
            code: "INVALID_INPUT".into(),
            message: "技能名称格式无效".into(),
        });
    }

    let home = app.path().home_dir().map_err(|error| CommandError {
        code: "IO_ERROR".into(),
        message: format!("无法定位用户主目录: {error}"),
    })?;
    Ok(home
        .join(".codex")
        .join("skills")
        .join(name)
        .join("SKILL.md"))
}

#[tauri::command]
pub fn save_user_skill(
    app: tauri::AppHandle,
    name: String,
    content: String,
) -> Result<String, CommandError> {
    if content.trim().is_empty() || content.len() > 1024 * 1024 {
        return Err(CommandError {
            code: "INVALID_INPUT".into(),
            message: "技能正文不能为空且不能超过 1 MB".into(),
        });
    }
    let path = skill_file_path(&app, &name)?;
    let parent = path.parent().ok_or_else(|| CommandError {
        code: "INVALID_INPUT".into(),
        message: "技能目录无效".into(),
    })?;
    std::fs::create_dir_all(parent).map_err(|error| CommandError {
        code: "IO_ERROR".into(),
        message: format!("创建技能目录失败: {error}"),
    })?;
    std::fs::write(&path, content).map_err(|error| CommandError {
        code: "IO_ERROR".into(),
        message: format!("保存技能文件失败: {error}"),
    })?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn delete_user_skill(app: tauri::AppHandle, name: String) -> Result<bool, CommandError> {
    let path = skill_file_path(&app, &name)?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(CommandError {
            code: "IO_ERROR".into(),
            message: format!("删除技能文件失败: {error}"),
        }),
    }
}
