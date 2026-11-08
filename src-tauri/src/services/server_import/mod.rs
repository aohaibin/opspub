mod finalshell;
mod parse;

use crate::{
    database::Database,
    error::AppError,
    models::{server_import::*, StoredSshCredential},
    services::credential::CredentialService,
};
use rust_xlsxwriter::{Color, DataValidation, Format, Note, Workbook};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};

struct Ticket {
    source: ImportSource,
    path: PathBuf,
    digest: Vec<u8>,
    created: Instant,
}

/// 只缓存文件路径和摘要，不缓存密码；提交时重读并核对摘要，防止预览后源文件被替换。
#[derive(Default)]
pub struct ServerImportService {
    tickets: Mutex<HashMap<String, Ticket>>,
}

impl ServerImportService {
    pub fn preview(
        &self,
        db: &Database,
        request: ImportPreviewRequest,
        home: &Path,
    ) -> Result<ImportPreview, AppError> {
        let chosen_path = request.path.filter(|s| !s.is_empty());
        let using_default_config =
            request.source == ImportSource::SshConfig && chosen_path.is_none();
        let path = match chosen_path {
            Some(path) => PathBuf::from(path),
            None if request.source == ImportSource::SshConfig => home.join(".ssh").join("config"),
            _ => return Err(AppError::InvalidInput("请先选择文件或文件夹".into())),
        };
        let mut parsed = parse::parse(request.source, &path).map_err(|error| {
            // 默认配置是可选的；只将自动检测时的“不存在”交给前端显示空状态。
            // 手动选中的文件丢失、权限不足等仍按真实读取失败处理。
            if using_default_config
                && matches!(&error, AppError::Io(io) if io.kind() == std::io::ErrorKind::NotFound)
            {
                AppError::NotFound("默认 SSH 配置文件，请选择配置文件后导入".into())
            } else {
                error
            }
        })?;
        let existing: HashSet<_> = db
            .get_all_servers()?
            .into_iter()
            .map(|s| s.alias.to_lowercase())
            .collect();
        for item in &mut parsed.entries {
            if existing.contains(&item.row.alias.to_lowercase()) {
                item.row.error = Some("此别名已存在，将跳过以保留原连接和凭据".into());
            }
        }
        let token = uuid::Uuid::new_v4().to_string();
        let mut tickets = self
            .tickets
            .lock()
            .map_err(|_| AppError::Custom("导入服务忙，请重试".into()))?;
        tickets.retain(|_, t| t.created.elapsed() < Duration::from_secs(900));
        if tickets.len() >= 16 {
            return Err(AppError::InvalidInput(
                "待处理的导入过多，请关闭其他导入窗口".into(),
            ));
        }
        tickets.insert(
            token.clone(),
            Ticket {
                source: request.source,
                path: path.clone(),
                digest: parsed.digest,
                created: Instant::now(),
            },
        );
        Ok(ImportPreview {
            token,
            path: path.to_string_lossy().into_owned(),
            rows: parsed.entries.into_iter().map(|e| e.row).collect(),
            warnings: parsed.warnings,
        })
    }

    pub fn discard(&self, token: &str) -> Result<(), AppError> {
        self.tickets
            .lock()
            .map_err(|_| AppError::Custom("导入服务忙，请重试".into()))?
            .remove(token);
        Ok(())
    }

    pub fn commit(
        &self,
        db: &Database,
        request: ImportCommitRequest,
    ) -> Result<Vec<ImportOutcome>, AppError> {
        if !["disabled", "readonly", "approval", "trusted"].contains(&request.ai_policy.as_str())
            || !["password", "key", "agent"].contains(&request.default_auth_type.as_str())
        {
            return Err(AppError::InvalidInput("无效的 AI 档位或认证方式".into()));
        }
        if request.indices.is_empty() {
            return Err(AppError::InvalidInput("请勾选至少一台服务器".into()));
        }
        // 令牌单次消费，双击提交也不会重复写入或覆盖凭据。
        let ticket = self
            .tickets
            .lock()
            .map_err(|_| AppError::Custom("导入服务忙，请重试".into()))?
            .remove(&request.token)
            .filter(|t| t.created.elapsed() < Duration::from_secs(900))
            .ok_or_else(|| {
                AppError::InvalidInput("预览已过期或已导入，请重新选择并解析文件".into())
            })?;
        let parsed = parse::parse(ticket.source, &ticket.path)?;
        if parsed.digest != ticket.digest {
            return Err(AppError::InvalidInput(
                "文件在预览后发生了变化，请重新解析后确认".into(),
            ));
        }
        let selected: HashSet<_> = request.indices.into_iter().collect();
        if selected.iter().any(|i| *i >= parsed.entries.len()) {
            return Err(AppError::InvalidInput("导入条目无效，请重新解析".into()));
        }
        let mut existing: HashSet<_> = db
            .get_all_servers()?
            .into_iter()
            .map(|s| s.alias.to_lowercase())
            .collect();
        let mut outcomes = vec![];
        for entry in parsed
            .entries
            .into_iter()
            .filter(|e| selected.contains(&e.row.index))
        {
            let row = &entry.row;
            let error = row.error.clone().or_else(|| {
                existing
                    .contains(&row.alias.to_lowercase())
                    .then(|| "此别名已存在，未覆盖原连接".into())
            });
            let result = if let Some(error) = error {
                Err(AppError::InvalidInput(error))
            } else {
                let auth = if ticket.source == ImportSource::SshConfig {
                    request.default_auth_type.as_str()
                } else {
                    row.auth_type.as_str()
                };
                let policy = if ticket.source == ImportSource::SshConfig || row.protocol == "rdp" {
                    "disabled"
                } else {
                    &request.ai_policy
                };
                persist_entry(db, &entry, auth, policy, CredentialService::save, |id| {
                    let _ = CredentialService::delete(id);
                })
            };
            let (server_id, error) = match result {
                Ok(id) => {
                    existing.insert(row.alias.to_lowercase());
                    (Some(id), None)
                }
                Err(error) => (None, Some(error.to_string())),
            };
            outcomes.push(ImportOutcome {
                index: row.index,
                alias: row.alias.clone(),
                server_id,
                error,
            });
        }
        Ok(outcomes)
    }
}

fn persist_entry(
    db: &Database,
    entry: &parse::Entry,
    auth: &str,
    policy: &str,
    save: impl FnOnce(i64, &StoredSshCredential) -> Result<(), AppError>,
    cleanup: impl FnOnce(i64),
) -> Result<i64, AppError> {
    let id = db.insert_imported_server(&entry.row, auth, policy)?;
    if let Some(password) = entry.password.as_ref().filter(|s| !s.is_empty()) {
        if let Err(error) = save(
            id,
            &StoredSshCredential {
                password: Some(password.clone()),
                private_key_path: None,
                private_key_text: None,
                passphrase: None,
            },
        ) {
            // 系统凭据库失败不能显示导入成功；只清理本次新建条目，不触碰既有服务器。
            db.delete_server(id)?;
            cleanup(id);
            return Err(AppError::Custom(format!(
                "凭据保存失败，该条目未导入：{error}"
            )));
        }
    }
    Ok(id)
}

pub fn save_template(path: &Path, groups: Vec<String>) -> Result<(), AppError> {
    if !path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("xlsx"))
    {
        return Err(AppError::InvalidInput(
            "模板保存路径必须以 .xlsx 结尾".into(),
        ));
    }
    let headers = [
        "别名",
        "主机",
        "端口",
        "用户名",
        "密码",
        "分组",
        "标签",
        "类型",
    ];
    let hints = [
        "可选；留空使用主机地址，别名需唯一",
        "必填；IP 或域名，不带协议和路径",
        "可选；SSH 默认 22，RDP 默认 3389",
        "必填；登录账号",
        "可选；本机保存至系统凭据管理器，建议将单元格格式设为文本",
        "可选；用 / 表示子分组，也可以输入新分组",
        "可选；多个标签用 ; 分隔",
        "Linux、Windows（SSH）或 RDP（仅远程桌面）",
    ];
    let result = (|| -> Result<(), rust_xlsxwriter::XlsxError> {
        let mut book = Workbook::new();
        let heading = Format::new()
            .set_bold()
            .set_font_color(Color::White)
            .set_background_color(Color::RGB(0x5b64c2));
        let text = Format::new().set_num_format("@");
        {
            let sheet = book.add_worksheet();
            sheet.set_name("服务器清单")?;
            for (col, title) in headers.iter().enumerate() {
                sheet.write_string_with_format(0, col as u16, *title, &heading)?;
                sheet.insert_note(0, col as u16, &Note::new(hints[col]))?;
                sheet.set_column_width(col as u16, if col == 1 || col == 5 { 28 } else { 20 })?;
                sheet.set_column_format(col as u16, &text)?;
            }
            sheet.set_freeze_panes(1, 0)?;
            let validation =
                DataValidation::new().allow_list_strings(&["Linux", "Windows", "RDP"])?;
            sheet.add_data_validation(1, 7, 5000, 7, &validation)?;
            // 非必填分组可自由输入；下拉只提供现有分组供复用。
            let validation = DataValidation::new()
                .allow_list_formula("'分组'!$A$1:$A$1000".into())
                .show_error_message(false);
            sheet.add_data_validation(1, 5, 5000, 5, &validation)?;
        }
        let sheet = book.add_worksheet();
        sheet.set_name("分组")?;
        sheet.write_string(0, 0, "默认")?;
        let mut unique = HashSet::new();
        unique.insert("默认".to_string());
        let mut index = 1;
        for group in groups.into_iter().filter(|g| !g.trim().is_empty()) {
            if index >= 1000 {
                break;
            }
            if unique.insert(group.clone()) {
                sheet.write_string(index, 0, &group)?;
                index += 1;
            }
        }
        sheet.set_hidden(true);
        book.save(path)?;
        Ok(())
    })();
    result.map_err(|_| {
        AppError::Custom("保存 Excel 模板失败，请检查目标路径是否可写或文件是否被占用".into())
    })
}

pub fn open_remote_desktop(db: &Database, server_id: i64) -> Result<(), AppError> {
    super::remote_desktop::open(db, server_id)
}

#[cfg(test)]
mod tests;
