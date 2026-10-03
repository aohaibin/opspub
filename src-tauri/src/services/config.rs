use crate::database::Database;
use crate::error::AppError;
use crate::models::AppConfig;

/// 配置管理服务
pub struct ConfigService;

impl ConfigService {
    /// 获取所有配置
    pub fn get_all(db: &Database) -> Result<Vec<AppConfig>, AppError> {
        db.get_all_config()
    }

    /// 获取配置值
    pub fn get(db: &Database, key: &str) -> Result<String, AppError> {
        db.get_config(key)?
            .ok_or_else(|| AppError::NotFound(format!("配置项 '{}' 不存在", key)))
    }

    /// 设置配置值
    pub fn set(db: &Database, key: &str, value: &str) -> Result<(), AppError> {
        if key.is_empty() {
            return Err(AppError::InvalidInput("配置键不能为空".into()));
        }
        // 安全总开关只允许专用命令修改，避免通用配置 IPC 绕过审批策略。
        if key == "ai_unlock_until" {
            return Err(AppError::InvalidInput("AI 操作总开关须通过专用接口修改".into()));
        }
        db.set_config(key, value)
    }

    /// 删除配置
    pub fn delete(db: &Database, key: &str) -> Result<(), AppError> {
        if key == "ai_unlock_until" {
            return Err(AppError::InvalidInput("AI 操作总开关须通过专用接口修改".into()));
        }
        let deleted = db.delete_config(key)?;
        if !deleted {
            return Err(AppError::NotFound(format!("配置项 '{}' 不存在", key)));
        }
        Ok(())
    }
}
