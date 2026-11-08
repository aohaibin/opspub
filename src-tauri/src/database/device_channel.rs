use super::Database;
use crate::{error::AppError, models::device_channel::PairedDevice};
use rusqlite::{params, OptionalExtension};

impl Database {
    pub fn save_paired_device(
        &self,
        device: &PairedDevice,
        token_hash: &str,
    ) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        conn.execute(
            "INSERT INTO paired_devices (id, name, token_hash, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![device.id, device.name, token_hash, device.created_at],
        )?;
        Ok(())
    }

    pub fn list_paired_devices(&self) -> Result<Vec<PairedDevice>, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        let mut stmt = conn.prepare("SELECT id, name, created_at, last_seen_at FROM paired_devices ORDER BY created_at DESC")?;
        let devices = stmt
            .query_map([], |row| {
                Ok(PairedDevice {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                    last_seen_at: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(devices)
    }

    pub fn authenticate_paired_device(&self, token_hash: &str) -> Result<Option<String>, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        let id = conn
            .query_row(
                "SELECT id FROM paired_devices WHERE token_hash = ?1",
                [token_hash],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        if let Some(ref id) = id {
            conn.execute("UPDATE paired_devices SET last_seen_at = unixepoch() WHERE id = ?1 AND (last_seen_at IS NULL OR last_seen_at < unixepoch() - 60)", [id])?;
        }
        Ok(id)
    }

    pub fn revoke_paired_device(&self, id: &str) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        conn.execute("DELETE FROM paired_devices WHERE id = ?1", [id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paired_device_hash_survives_database_reopen() {
        let path = std::env::temp_dir().join(format!(
            "opspub-device-test-{}.sqlite",
            uuid::Uuid::new_v4()
        ));
        let device = PairedDevice {
            id: "device".into(),
            name: "phone".into(),
            created_at: 100,
            last_seen_at: None,
        };
        {
            let db = Database::init(path.to_str().expect("temp path")).expect("create");
            db.save_paired_device(&device, "hash-only").expect("save");
        }
        {
            let db = Database::init(path.to_str().expect("temp path")).expect("reopen");
            assert_eq!(db.list_paired_devices().expect("list")[0].id, device.id);
            assert_eq!(
                db.authenticate_paired_device("hash-only").expect("auth"),
                Some(device.id)
            );
            assert!(db
                .authenticate_paired_device("wrong")
                .expect("wrong token")
                .is_none());
        }
        std::fs::remove_file(path).expect("remove test database");
    }
}
