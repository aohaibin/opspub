use crate::error::CommandError;

/// 将用户通过系统保存对话框选择的文本路径写入磁盘。
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), CommandError> {
    if path.trim().is_empty() {
        return Err(CommandError {
            code: "INVALID_INPUT".into(),
            message: "导出路径不能为空".into(),
        });
    }
    std::fs::write(path, content).map_err(|error| CommandError {
        code: "IO_ERROR".into(),
        message: format!("写入导出文件失败: {error}"),
    })
}
