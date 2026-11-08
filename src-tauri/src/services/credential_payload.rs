//! Windows 单条凭据限制为 2560 字节。长私钥分块存入系统凭据库，主条目只记录索引。
use keyring::{Entry, Error};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct Manifest {
    opspub_chunk_id: uuid::Uuid,
    count: usize,
}

fn manifest(value: &str) -> Option<Manifest> {
    serde_json::from_str::<Manifest>(value)
        .ok()
        .filter(|m| m.count > 0 && m.count <= 128)
}
fn chunk_entry(service: &str, id: i64, m: &Manifest, index: usize) -> Result<Entry, Error> {
    Entry::new(
        service,
        &format!("server-{id}-payload-{}-{index}", m.opspub_chunk_id),
    )
}
fn cleanup(service: &str, id: i64, m: &Manifest) {
    for i in 0..m.count {
        if let Ok(entry) = chunk_entry(service, id, m, i) {
            let _ = entry.delete_credential();
        }
    }
}
fn chunks(value: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut size = 0;
    for ch in value.chars() {
        if size + ch.len_utf16() > 1000 {
            out.push(std::mem::take(&mut current));
            size = 0;
        }
        current.push(ch);
        size += ch.len_utf16();
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}
pub(super) fn read(service: &str, id: i64, entry: &Entry) -> Result<String, Error> {
    let payload = entry.get_password()?;
    let Some(m) = manifest(&payload) else {
        return Ok(payload);
    };
    let mut value = String::new();
    for i in 0..m.count {
        value.push_str(&chunk_entry(service, id, &m, i)?.get_password()?);
    }
    Ok(value)
}
pub(super) fn write(service: &str, id: i64, entry: &Entry, payload: &str) -> Result<(), Error> {
    let old = match entry.get_password() {
        Ok(s) => Some(s),
        Err(Error::NoEntry) => None,
        Err(e) => return Err(e),
    };
    let parts = chunks(payload);
    let m = Manifest {
        opspub_chunk_id: uuid::Uuid::new_v4(),
        count: parts.len(),
    };
    if parts.len() > 128 {
        return Err(Error::TooLong("credential".into(), 128_000));
    }
    let result = (|| {
        if parts.len() == 1 {
            entry.set_password(payload)?;
        } else {
            for (i, part) in parts.iter().enumerate() {
                let item = chunk_entry(service, id, &m, i)?;
                item.set_password(part)?;
                if item.get_password()? != *part {
                    return Err(Error::NoEntry);
                }
            }
            // 所有分块落盘后才发布新索引，中途失败不会破坏原凭据。
            entry.set_password(&serde_json::to_string(&m).map_err(|_| Error::NoEntry)?)?;
        }
        if read(service, id, entry)? != payload {
            return Err(Error::NoEntry);
        }
        Ok(())
    })();
    if result.is_err() {
        if let Some(old) = &old {
            let _ = entry.set_password(old);
        } else {
            let _ = entry.delete_credential();
        }
        cleanup(service, id, &m);
    } else if let Some(old) = old.as_deref().and_then(manifest) {
        cleanup(service, id, &old);
    }
    result
}
pub(super) fn delete(service: &str, id: i64, entry: &Entry) -> Result<(), Error> {
    let old = match entry.get_password() {
        Ok(s) => s,
        Err(Error::NoEntry) => return Ok(()),
        Err(e) => return Err(e),
    };
    entry.delete_credential()?;
    if let Some(m) = manifest(&old) {
        cleanup(service, id, &m);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn long_keys_and_unicode_roundtrip_in_bounded_chunks() {
        let value = "私钥🔐abc".repeat(3000);
        let chunks = super::chunks(&value);
        assert_eq!(chunks.concat(), value);
        assert!(chunks.iter().all(|s| s.encode_utf16().count() <= 1000));
    }

    #[test]
    #[ignore = "使用随机独立系统凭据条目验证长私钥落盘，测试后自动清理"]
    fn native_credential_payload_roundtrip_and_replace() {
        use super::*;
        struct Cleanup {
            service: String,
            entry: Entry,
        }
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = delete(&self.service, 1, &self.entry);
            }
        }
        let service = format!("opspub-test-{}", uuid::Uuid::new_v4());
        let entry = Entry::new(&service, "fixture").expect("entry");
        let fixture = Cleanup { service, entry };
        let payload = "synthetic-private-key-🔐".repeat(700);
        write(&fixture.service, 1, &fixture.entry, &payload).expect("write long");
        // 重新创建 Entry，确认数据来自系统凭据库而非原对象内存。
        let reopened = Entry::new(&fixture.service, "fixture").expect("reopen");
        assert_eq!(read(&fixture.service, 1, &reopened).expect("read"), payload);
        let old = manifest(&reopened.get_password().expect("manifest")).expect("chunked");
        write(&fixture.service, 1, &reopened, "short fixture").expect("replace");
        assert_eq!(
            read(&fixture.service, 1, &reopened).expect("short"),
            "short fixture"
        );
        for index in 0..old.count {
            assert!(matches!(
                chunk_entry(&fixture.service, 1, &old, index)
                    .expect("chunk")
                    .get_password(),
                Err(Error::NoEntry)
            ));
        }
    }
}
