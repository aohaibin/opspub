use super::*;
use std::fs;

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("opspub-import-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&path).expect("temporary fixture directory");
        Self(path)
    }
    fn write(&self, name: &str, text: &str) -> PathBuf {
        let path = self.0.join(name);
        fs::write(&path, text).expect("fixture write");
        path
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn default_ssh_config_missing_is_distinct_from_chosen_file_failure() {
    let fixture = Fixture::new();
    let db = Database::init(":memory:").expect("db");
    let service = ServerImportService::default();
    let missing_path = fixture.0.join(".ssh").join("config");
    // 用户目录没有 .ssh，或已有 .ssh 但尚未创建 config，都应进入相同的空状态。
    for create_directory in [false, true] {
        if create_directory {
            fs::create_dir(fixture.0.join(".ssh")).expect("ssh directory");
        }
        for chosen in [false, true] {
            let result = service.preview(
                &db,
                ImportPreviewRequest {
                    source: ImportSource::SshConfig,
                    path: chosen.then(|| missing_path.to_string_lossy().into_owned()),
                },
                &fixture.0,
            );
            if chosen {
                assert!(matches!(result, Err(AppError::Io(_))));
            } else {
                assert!(matches!(result, Err(AppError::NotFound(_))));
            }
        }
    }
    assert!(service.tickets.lock().expect("tickets").is_empty());
    // 后续重新检测能发现新建的配置，正常返回可选主机。
    fixture.write(
        ".ssh/config",
        "Host demo\n HostName 192.0.2.1\n User alice\n",
    );
    let preview = service
        .preview(
            &db,
            ImportPreviewRequest {
                source: ImportSource::SshConfig,
                path: None,
            },
            &fixture.0,
        )
        .expect("detect created config");
    assert_eq!(preview.rows.len(), 1);
    assert_eq!(preview.rows[0].alias, "demo");
}

#[test]
fn invalid_default_ssh_config_is_not_hidden_as_missing() {
    let fixture = Fixture::new();
    let db = Database::init(":memory:").expect("db");
    let service = ServerImportService::default();
    fs::create_dir_all(fixture.0.join(".ssh/config")).expect("directory is not a config file");
    assert!(matches!(
        service.preview(
            &db,
            ImportPreviewRequest {
                source: ImportSource::SshConfig,
                path: None,
            },
            &fixture.0
        ),
        Err(AppError::InvalidInput(_))
    ));
}

#[test]
fn csv_supports_quoted_values_headers_and_password_whitespace() {
    let rows = parse::csv_rows("别名,主机,用户名,密码,分组,标签,类型\n\"test,one\",127.0.0.1,alice, padded ,prod/api,web;qa,Windows\n".as_bytes()).expect("csv");
    assert_eq!(rows[0].row.alias, "test,one");
    assert_eq!(rows[0].password.as_deref(), Some(" padded "));
    assert_eq!(rows[0].row.os_type, "windows");
    assert_eq!(rows[0].row.tags, vec!["web", "qa"]);
    assert!(parse::csv_rows(b"host,port\nlocalhost,22").is_err());
    assert!(parse::csv_rows(b"host,username,user\nlocalhost,a,b").is_err());
    assert!(parse::csv_rows(b"host,user\nlocalhost,a,extra").is_err());
}

#[test]
fn validates_rows_and_rdp_defaults() {
    let fixture = Fixture::new();
    let path = fixture.write("servers.csv", "alias,host,user,port,type\nrdp,127.0.0.1,admin,,rdp\ninvalid,https://example.com,alice,99999,linux\nrdp,127.0.0.2,admin,,rdp");
    let parsed = parse::parse(ImportSource::Spreadsheet, &path).expect("parse");
    assert_eq!(parsed.entries[0].row.port, 3389);
    assert!(parsed.entries[1].row.error.is_some());
    assert!(parsed.entries[2]
        .row
        .error
        .as_ref()
        .is_some_and(|s| s.contains("重复")));
}

#[test]
fn finalshell_preserves_nested_groups_and_reports_password_failure() {
    let fixture = Fixture::new();
    fs::create_dir_all(fixture.0.join("prod/web")).expect("groups");
    fixture.write("prod/web/server_connect_config.json", r#"{"host":"127.0.0.1","user_name":"alice","name":"win","conection_type":101,"password":"unsupported"}"#);
    fixture.write("layout.json", r#"{"window_width":1200}"#);
    let parsed = parse::parse(ImportSource::Finalshell, &fixture.0).expect("folder parse");
    assert_eq!(parsed.entries.len(), 1);
    assert_eq!(parsed.entries[0].row.group, "prod/web");
    assert_eq!(parsed.entries[0].row.protocol, "rdp");
    assert!(!parsed.entries[0].row.has_password);
    assert!(parsed.entries[0].row.warning.is_some());
}

#[test]
fn finalshell_empty_key_sentinels_do_not_drop_password_authentication() {
    let fixture = Fixture::new();
    for (index, key_id) in ["null", "0", "-1", "\"\""].iter().enumerate() {
        fixture.write(&format!("server-{index}.json"), &format!(r#"{{"host":"192.0.2.1","user_name":"alice","name":"host-{index}","conection_type":100,"authentication_type":1,"secret_key_id":{key_id},"password":"LABpMVJ5IAufWGUiMDLFm1KLFStvYimb"}}"#));
    }
    let parsed = parse::parse(ImportSource::Finalshell, &fixture.0).expect("parse");
    assert_eq!(parsed.entries.len(), 4);
    for entry in parsed.entries {
        assert_eq!(entry.row.auth_type, "password");
        assert!(entry.row.has_password);
        assert!(entry.row.warning.is_none());
    }
}

#[test]
fn finalshell_handles_utf8_bom_and_identifies_broken_json_without_contents() {
    let fixture = Fixture::new();
    fixture.write("valid.JSON", "\u{feff}{\"name\":\"bom-host\",\"host\":\"192.0.2.1\",\"user_name\":\"alice\",\"conection_type\":100}");
    fixture.write("broken.json", "{\"password\":\"must-not-appear");
    let parsed = parse::parse(ImportSource::Finalshell, &fixture.0).expect("parse folder");
    assert_eq!(parsed.entries.len(), 1);
    assert_eq!(parsed.entries[0].row.alias, "bom-host");
    assert_eq!(parsed.warnings.len(), 1);
    assert!(parsed.warnings[0].contains("broken.json"));
    assert!(!parsed.warnings[0].contains("must-not-appear"));
}

#[test]
fn finalshell_commit_applies_each_policy_preserves_groups_and_skips_invalid_rows() {
    let fixture = Fixture::new();
    fs::create_dir_all(fixture.0.join("生产/web")).expect("groups");
    fixture.write(
        "生产/web/ssh.json",
        r#"{"name":"linux","host":"192.0.2.1","user_name":"alice","conection_type":100}"#,
    );
    fixture.write(
        "rdp.json",
        r#"{"name":"desktop","host":"192.0.2.2","user_name":"Administrator","conection_type":101}"#,
    );
    fixture.write(
        "invalid.json",
        r#"{"name":"invalid","host":"192.0.2.3","port":99999,"user_name":"alice"}"#,
    );
    for policy in ["disabled", "readonly", "approval", "trusted"] {
        let db = Database::init(":memory:").expect("db");
        let service = ServerImportService::default();
        let request = ImportPreviewRequest {
            source: ImportSource::Finalshell,
            path: Some(fixture.0.to_string_lossy().into()),
        };
        let preview = service
            .preview(&db, request.clone(), &fixture.0)
            .expect("preview");
        let result = service
            .commit(
                &db,
                ImportCommitRequest {
                    token: preview.token,
                    indices: preview.rows.iter().map(|r| r.index).collect(),
                    ai_policy: policy.into(),
                    default_auth_type: "password".into(),
                },
            )
            .expect("commit");
        assert_eq!(result.iter().filter(|r| r.server_id.is_some()).count(), 2);
        assert!(result
            .iter()
            .find(|r| r.alias == "invalid")
            .expect("invalid row")
            .error
            .is_some());
        let servers = db.get_all_servers().expect("servers");
        let ssh = servers.iter().find(|s| s.alias == "linux").expect("ssh");
        assert_eq!(ssh.group, "生产/web");
        assert_eq!(ssh.ai_policy, policy);
        let rdp = servers.iter().find(|s| s.alias == "desktop").expect("rdp");
        assert_eq!(rdp.port, 3389);
        assert_eq!(rdp.protocol, "rdp");
        assert_eq!(rdp.ai_policy, "disabled");
        let again = service
            .preview(&db, request, &fixture.0)
            .expect("duplicate preview");
        assert!(again.rows.iter().all(|r| r.error.is_some()));
        assert_eq!(db.get_all_servers().expect("unchanged servers").len(), 2);
    }
}

#[test]
fn finalshell_folder_change_after_preview_requires_new_confirmation() {
    let fixture = Fixture::new();
    fixture.write("first.json", r#"{"host":"192.0.2.1","user_name":"alice"}"#);
    let db = Database::init(":memory:").expect("db");
    let service = ServerImportService::default();
    let preview = service
        .preview(
            &db,
            ImportPreviewRequest {
                source: ImportSource::Finalshell,
                path: Some(fixture.0.to_string_lossy().into()),
            },
            &fixture.0,
        )
        .expect("preview");
    fixture.write("second.json", r#"{"host":"192.0.2.2","user_name":"alice"}"#);
    let result = service.commit(
        &db,
        ImportCommitRequest {
            token: preview.token,
            indices: vec![0],
            ai_policy: "disabled".into(),
            default_auth_type: "password".into(),
        },
    );
    assert!(matches!(result, Err(AppError::InvalidInput(message)) if message.contains("变化")));
    assert!(db.get_all_servers().expect("no partial writes").is_empty());
}

/// 手动集成测试：调用正式导入服务和 Windows Credential Manager，结束后清理自己的测试凭据。
#[cfg(windows)]
#[test]
#[ignore = "使用隔离的临时数据库和随机凭据 ID，需显式运行以检查 Windows 凭据落盘"]
fn finalshell_native_import_roundtrip() -> Result<(), AppError> {
    struct CredentialCleanup(Vec<i64>);
    impl Drop for CredentialCleanup {
        fn drop(&mut self) {
            for id in &self.0 {
                let _ = CredentialService::delete(*id);
            }
        }
    }
    let fixture = Fixture::new();
    let export = fixture.0.join("export");
    fs::create_dir_all(export.join("生产/web"))?;
    fixture.write("export/生产/web/ssh.json", r#"{"name":"fixture-ssh","host":"192.0.2.1","user_name":"alice","conection_type":100,"authentication_type":1,"password":"LABpMVJ5IAufWGUiMDLFm1KLFStvYimb"}"#);
    fixture.write("export/rdp.json", r#"{"name":"fixture-rdp","host":"192.0.2.2","user_name":"Administrator","conection_type":101}"#);
    fixture.write("export/unselected.json", r#"{"name":"fixture-unselected","host":"192.0.2.3","user_name":"alice","password":"LABpMVJ5IAufWGUiMDLFm1KLFStvYimb"}"#);
    let db_path = fixture.0.join("isolated.sqlite");
    let db = Database::init(&db_path.to_string_lossy())?;
    // 不使用临时数据库默认的 1、2 等 ID，避免覆盖用户已有服务器的系统凭据。
    let base = (1_i64 << 52) + (uuid::Uuid::new_v4().as_u128() % (1_u128 << 48)) as i64;
    let ids: Vec<_> = (1..=4).map(|offset| base + offset).collect();
    for id in &ids {
        assert!(
            CredentialService::get(*id)?.is_none(),
            "测试凭据 ID 必须为空"
        );
    }
    let cleanup = CredentialCleanup(ids);
    {
        let seed = rusqlite::Connection::open(&db_path)?;
        seed.execute(
            "INSERT INTO sqlite_sequence(name,seq) VALUES ('servers',?1)",
            [base],
        )?;
    }
    let service = ServerImportService::default();
    let preview = service.preview(
        &db,
        ImportPreviewRequest {
            source: ImportSource::Finalshell,
            path: Some(export.to_string_lossy().into()),
        },
        &fixture.0,
    )?;
    let json = serde_json::to_string(&preview)?;
    assert!(!json.contains("LABpMVJ5IAufWGUiMDLFm1KLFStvYimb"));
    assert!(!json.contains("beac3d85988e"));
    let result = service.commit(
        &db,
        ImportCommitRequest {
            token: preview.token,
            indices: preview
                .rows
                .iter()
                .filter(|r| r.alias != "fixture-unselected")
                .map(|r| r.index)
                .collect(),
            ai_policy: "readonly".into(),
            default_auth_type: "password".into(),
        },
    )?;
    assert_eq!(result.len(), 2);
    assert!(
        result.iter().all(|r| r.server_id.is_some()),
        "本机系统凭据保存必须成功"
    );
    let ssh_id = result
        .iter()
        .find(|r| r.alias == "fixture-ssh")
        .and_then(|r| r.server_id)
        .expect("ssh id");
    drop(service);
    drop(db);
    // 重新打开磁盘数据库，再通过正式凭据服务回读，验证保存结果可复用。
    let reopened = Database::init(&db_path.to_string_lossy())?;
    let servers = reopened.get_all_servers()?;
    assert_eq!(servers.len(), 2);
    let ssh = servers
        .iter()
        .find(|s| s.id == ssh_id)
        .expect("persisted ssh");
    assert_eq!(ssh.group, "生产/web");
    assert_eq!(ssh.ai_policy, "readonly");
    assert!(!serde_json::to_string(&servers)?.contains("beac3d85988e"));
    let saved = CredentialService::get(ssh_id)?.expect("persisted credential");
    assert!(
        saved.password.as_deref() == Some("beac3d85988e"),
        "凭据内容应与解码结果一致"
    );
    assert!(servers
        .iter()
        .any(|s| s.protocol == "rdp" && s.ai_policy == "disabled"));
    for id in &cleanup.0 {
        CredentialService::delete(*id)?;
        assert!(CredentialService::get(*id)?.is_none(), "测试凭据应已清理");
    }
    Ok(())
}

#[test]
fn preview_never_serializes_password_and_rejects_changed_sources() {
    let fixture = Fixture::new();
    let path = fixture.write(
        "servers.csv",
        "host,user,password\n127.0.0.1,alice,fixture-secret",
    );
    let db = Database::init(":memory:").expect("db");
    let service = ServerImportService::default();
    let preview = service
        .preview(
            &db,
            ImportPreviewRequest {
                source: ImportSource::Spreadsheet,
                path: Some(path.to_string_lossy().into()),
            },
            &fixture.0,
        )
        .expect("preview");
    assert!(!serde_json::to_string(&preview)
        .expect("json")
        .contains("fixture-secret"));
    assert!(preview.rows[0].has_password);
    fs::write(&path, "host,user\n127.0.0.2,alice").expect("change");
    let result = service.commit(
        &db,
        ImportCommitRequest {
            token: preview.token,
            indices: vec![0],
            ai_policy: "disabled".into(),
            default_auth_type: "password".into(),
        },
    );
    assert!(result
        .err()
        .expect("changed source rejected")
        .to_string()
        .contains("变化"));
    assert!(db.get_all_servers().expect("servers").is_empty());
}

#[test]
fn import_skips_duplicates_forces_rdp_policy_and_consumes_token() {
    let fixture = Fixture::new();
    let path = fixture.write(
        "servers.csv",
        "alias,host,user,type\nfirst,127.0.0.1,alice,rdp\nsecond,127.0.0.2,bob,linux",
    );
    let db = Database::init(":memory:").expect("db");
    let service = ServerImportService::default();
    let request = ImportPreviewRequest {
        source: ImportSource::Spreadsheet,
        path: Some(path.to_string_lossy().into()),
    };
    let preview = service
        .preview(&db, request.clone(), &fixture.0)
        .expect("preview");
    let commit = || ImportCommitRequest {
        token: preview.token.clone(),
        indices: vec![0, 1],
        ai_policy: "trusted".into(),
        default_auth_type: "password".into(),
    };
    assert_eq!(
        service
            .commit(&db, commit())
            .expect("commit")
            .iter()
            .filter(|o| o.server_id.is_some())
            .count(),
        2
    );
    assert!(service.commit(&db, commit()).is_err());
    let servers = db.get_all_servers().expect("servers");
    assert_eq!(
        servers
            .iter()
            .find(|s| s.protocol == "rdp")
            .expect("rdp")
            .ai_policy,
        "disabled"
    );
    let again = service
        .preview(&db, request, &fixture.0)
        .expect("preview again");
    assert!(again.rows.iter().all(|r| r.error.is_some()));
}

#[test]
fn vault_failure_rolls_back_only_the_new_record() {
    let db = Database::init(":memory:").expect("db");
    let entries =
        parse::csv_rows(b"alias,host,user,password\nnew,127.0.0.1,alice,fake").expect("parse");
    assert!(persist_entry(
        &db,
        &entries[0],
        "password",
        "disabled",
        |_, _| Err(AppError::Custom("fake vault failure".into())),
        |_| {}
    )
    .is_err());
    assert!(db.get_all_servers().expect("servers").is_empty());
    let id = persist_entry(
        &db,
        &entries[0],
        "password",
        "disabled",
        |_, c| {
            assert_eq!(c.password.as_deref(), Some("fake"));
            Ok(())
        },
        |_| {},
    )
    .expect("save");
    let row = db.get_server_by_id(id).expect("db").expect("server");
    assert!(!serde_json::to_string(&row)
        .expect("row json")
        .contains("fake"));
}

#[test]
fn xlsx_template_is_readable_and_roundtrips_import() {
    let fixture = Fixture::new();
    let path = fixture.0.join("template.xlsx");
    save_template(&path, vec!["prod/api".into()]).expect("template");
    assert!(parse::parse(ImportSource::Spreadsheet, &path)
        .expect("empty template")
        .entries
        .is_empty());
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    for (i, value) in ["主机", "用户名", "别名", "密码"].iter().enumerate() {
        sheet.write_string(0, i as u16, *value).expect("header");
    }
    for (i, value) in ["127.0.0.1", "alice", "中文机器", "0012"]
        .iter()
        .enumerate()
    {
        sheet.write_string(1, i as u16, *value).expect("row");
    }
    workbook.save(&path).expect("xlsx");
    let parsed = parse::parse(ImportSource::Spreadsheet, &path).expect("parse xlsx");
    assert_eq!(parsed.entries[0].row.alias, "中文机器");
    assert_eq!(parsed.entries[0].password.as_deref(), Some("0012"));
}

#[test]
fn spreadsheet_csv_supports_excel_encodings_and_does_not_disclose_bad_rows() {
    let fixture = Fixture::new();
    let text = "别名,主机,用户名,密码,分组,标签,类型\r\n\"测试,主机\",192.0.2.1,alice, 0012 ,生产/web,web；测试,Windows\r\n";
    let (gbk, _, had_errors) = encoding_rs::GBK.encode(text);
    assert!(!had_errors);
    for (name, bytes) in [
        ("utf8.csv", text.as_bytes().to_vec()),
        ("bom.csv", format!("\u{feff}{text}").into_bytes()),
        ("gbk.csv", gbk.into_owned()),
    ] {
        let path = fixture.0.join(name);
        fs::write(&path, bytes).expect("csv fixture");
        let parsed = parse::parse(ImportSource::Spreadsheet, &path).expect("parse encoding");
        assert_eq!(parsed.entries.len(), 1);
        let entry = &parsed.entries[0];
        assert_eq!(entry.row.alias, "测试,主机");
        assert_eq!(entry.row.group, "生产/web");
        assert_eq!(entry.row.tags, vec!["web", "测试"]);
        assert_eq!(entry.row.os_type, "windows");
        assert_eq!(entry.row.port, 22);
        assert!(entry.row.has_password && entry.row.error.is_none());
        assert!(entry.password.as_deref() == Some(" 0012 "));
    }
    for csv in [
        "",
        "host,password\n192.0.2.1,fixture-secret",
        "host,user\n192.0.2.1,alice,fixture-secret",
    ] {
        let error = parse::csv_rows(csv.as_bytes())
            .err()
            .expect("invalid csv")
            .to_string();
        assert!(!error.contains("fixture-secret"));
    }
    for name in ["damaged.xlsx", "unsupported.xls"] {
        let path = fixture.write(name, "fixture-secret");
        let error = parse::parse(ImportSource::Spreadsheet, &path)
            .err()
            .expect("invalid workbook")
            .to_string();
        assert!(!error.contains("fixture-secret"));
    }
}

/// 正式导入链路测试：生成模板、读回表头、填表导入、重开数据库和回读系统凭据。
#[cfg(windows)]
#[test]
#[ignore = "显式测试 xlsx/CSV 导入与 Windows 凭据持久化，使用随机 ID 并自动清理"]
fn spreadsheet_native_import_roundtrip() -> Result<(), AppError> {
    use calamine::Reader;
    struct CredentialCleanup(Vec<i64>);
    impl Drop for CredentialCleanup {
        fn drop(&mut self) {
            for id in &self.0 {
                let _ = CredentialService::delete(*id);
            }
        }
    }
    let fixture = Fixture::new();
    let template = fixture.0.join("template.xlsx");
    save_template(&template, vec!["生产/web".into(), "生产/web".into()])?;
    let mut book: calamine::Xlsx<_> =
        calamine::open_workbook(&template).expect("generated template");
    let headers: Vec<String> = book
        .worksheet_range("服务器清单")
        .expect("template sheet")
        .rows()
        .next()
        .expect("headers")
        .iter()
        .map(ToString::to_string)
        .collect();
    let groups = book.worksheet_range("分组").expect("template groups");
    assert_eq!(groups.height(), 2, "模板分组应去重并包含默认分组");
    assert!(save_template(&fixture.0.join("missing/template.xlsx"), vec![]).is_err());
    assert!(save_template(&fixture.0.join("template.csv"), vec![]).is_err());
    // 采用生成模板中的真实列顺序，同时覆盖文本前导零和带空格的密码。
    let rows = [
        [
            "模板主机",
            "192.0.2.1",
            "2222",
            "001alice",
            " 0012-fixture ",
            "生产/web",
            "web;测试",
            "Windows",
        ],
        [
            "远程桌面",
            "192.0.2.2",
            "",
            "Administrator",
            "",
            "办公",
            "",
            "RDP",
        ],
        [
            "不勾选",
            "192.0.2.3",
            "22",
            "alice",
            "not-selected-fixture",
            "",
            "",
            "Linux",
        ],
        [
            "无效端口",
            "192.0.2.4",
            "65536",
            "alice",
            "",
            "",
            "",
            "Linux",
        ],
    ];
    let xlsx = fixture.0.join("filled.xlsx");
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    for (col, value) in headers.iter().enumerate() {
        sheet.write_string(0, col as u16, value).expect("header");
    }
    for (row, values) in rows.iter().enumerate() {
        for (col, value) in values.iter().enumerate() {
            sheet
                .write_string(row as u32 + 1, col as u16, *value)
                .expect("cell");
        }
    }
    workbook.save(&xlsx).expect("filled workbook");
    let csv_text = format!(
        "{}\r\n{}\r\n",
        headers.join(","),
        rows.iter()
            .map(|row| row.join(","))
            .collect::<Vec<_>>()
            .join("\r\n")
    );
    let csv = fixture.write("filled.csv", &format!("\u{feff}{csv_text}"));
    let gbk = fixture.0.join("filled-gbk.csv");
    let (bytes, _, had_errors) = encoding_rs::GBK.encode(&csv_text);
    assert!(!had_errors);
    fs::write(&gbk, bytes)?;
    for (index, path) in [xlsx, csv, gbk].iter().enumerate() {
        let db_path = fixture.0.join(format!("isolated-{index}.sqlite"));
        let db = Database::init(&db_path.to_string_lossy())?;
        // 测试不能使用正式凭据库中的常见服务器 ID。
        let base = (1_i64 << 52) + (uuid::Uuid::new_v4().as_u128() % (1_u128 << 48)) as i64;
        let ids: Vec<_> = (1..=5).map(|offset| base + offset).collect();
        for id in &ids {
            assert!(CredentialService::get(*id)?.is_none(), "测试 ID 必须为空");
        }
        let cleanup = CredentialCleanup(ids);
        rusqlite::Connection::open(&db_path)?.execute(
            "INSERT INTO sqlite_sequence(name,seq) VALUES ('servers',?1)",
            [base],
        )?;
        let service = ServerImportService::default();
        let request = ImportPreviewRequest {
            source: ImportSource::Spreadsheet,
            path: Some(path.to_string_lossy().into()),
        };
        let preview = service.preview(&db, request.clone(), &fixture.0)?;
        assert_eq!(preview.rows.len(), 4);
        assert!(preview.rows[0].has_password);
        assert!(preview.rows[3].error.is_some());
        let preview_json = serde_json::to_string(&preview)?;
        assert!(
            !preview_json.contains("0012-fixture")
                && !preview_json.contains("not-selected-fixture")
        );
        let token = preview.token.clone();
        let result = service.commit(
            &db,
            ImportCommitRequest {
                token: preview.token,
                indices: vec![0, 1, 3],
                ai_policy: "approval".into(),
                default_auth_type: "password".into(),
            },
        )?;
        assert_eq!(
            result.iter().filter(|row| row.server_id.is_some()).count(),
            2
        );
        assert!(result[2].server_id.is_none() && result[2].error.is_some());
        assert!(
            service
                .commit(
                    &db,
                    ImportCommitRequest {
                        token,
                        indices: vec![0],
                        ai_policy: "approval".into(),
                        default_auth_type: "password".into(),
                    }
                )
                .is_err(),
            "令牌不可重复导入"
        );
        drop(service);
        drop(db);
        let reopened = Database::init(&db_path.to_string_lossy())?;
        let servers = reopened.get_all_servers()?;
        assert_eq!(servers.len(), 2);
        let ssh = servers
            .iter()
            .find(|row| row.alias == "模板主机")
            .expect("saved SSH");
        assert_eq!(ssh.port, 2222);
        assert_eq!(ssh.username, "001alice");
        assert_eq!(ssh.os_type, "windows");
        assert_eq!(ssh.group, "生产/web");
        assert_eq!(
            serde_json::from_str::<Vec<String>>(&ssh.tags)?,
            vec!["web", "测试"]
        );
        assert_eq!(ssh.ai_policy, "approval");
        let saved = CredentialService::get(ssh.id)?.expect("persisted credential");
        assert!(
            saved.password.as_deref() == Some(" 0012-fixture "),
            "密码必须原样保存"
        );
        let rdp = servers
            .iter()
            .find(|row| row.protocol == "rdp")
            .expect("saved RDP");
        assert_eq!(rdp.port, 3389);
        assert_eq!(rdp.ai_policy, "disabled");
        assert!(
            CredentialService::get(rdp.id)?.is_none(),
            "空密码不创建凭据"
        );
        assert!(!serde_json::to_string(&servers)?.contains("0012-fixture"));
        let service = ServerImportService::default();
        let repeated = service.preview(&reopened, request, &fixture.0)?;
        assert!(repeated.rows[0]
            .error
            .as_deref()
            .is_some_and(|e| e.contains("已存在")));
        let skipped = service.commit(
            &reopened,
            ImportCommitRequest {
                token: repeated.token,
                indices: vec![0],
                ai_policy: "trusted".into(),
                default_auth_type: "password".into(),
            },
        )?;
        assert!(skipped[0].error.is_some() && skipped[0].server_id.is_none());
        assert_eq!(
            reopened
                .get_server_by_id(ssh.id)?
                .expect("unchanged SSH")
                .ai_policy,
            "approval"
        );
        for id in &cleanup.0 {
            CredentialService::delete(*id)?;
            assert!(CredentialService::get(*id)?.is_none(), "测试凭据已清理");
        }
    }
    Ok(())
}

#[test]
fn ssh_import_is_skeleton_only_and_ai_disabled() {
    let fixture = Fixture::new();
    let path = fixture.write("config", "Host prod\n HostName 127.0.0.1\n User alice\n IdentityFile /does-not-exist\nHost *.wildcard\n User ignore\n");
    let db = Database::init(":memory:").expect("db");
    let service = ServerImportService::default();
    let preview = service
        .preview(
            &db,
            ImportPreviewRequest {
                source: ImportSource::SshConfig,
                path: Some(path.to_string_lossy().into()),
            },
            &fixture.0,
        )
        .expect("preview");
    assert_eq!(preview.rows.len(), 1);
    let result = service
        .commit(
            &db,
            ImportCommitRequest {
                token: preview.token,
                indices: vec![0],
                ai_policy: "trusted".into(),
                default_auth_type: "agent".into(),
            },
        )
        .expect("commit");
    let row = db
        .get_server_by_id(result[0].server_id.expect("id"))
        .expect("read")
        .expect("server");
    assert_eq!(row.auth_type, "agent");
    assert_eq!(row.ai_policy, "disabled");
}

#[test]
fn discarded_and_expired_previews_cannot_import() {
    let fixture = Fixture::new();
    let path = fixture.write("servers.csv", "host,user\n127.0.0.1,alice");
    let db = Database::init(":memory:").expect("db");
    let service = ServerImportService::default();
    let request = ImportPreviewRequest {
        source: ImportSource::Spreadsheet,
        path: Some(path.to_string_lossy().into()),
    };
    for expire in [false, true] {
        let preview = service
            .preview(&db, request.clone(), &fixture.0)
            .expect("preview");
        if expire {
            service
                .tickets
                .lock()
                .expect("lock")
                .get_mut(&preview.token)
                .expect("ticket")
                .created = Instant::now() - Duration::from_secs(901);
        } else {
            service.discard(&preview.token).expect("discard");
        }
        assert!(service
            .commit(
                &db,
                ImportCommitRequest {
                    token: preview.token,
                    indices: vec![0],
                    ai_policy: "disabled".into(),
                    default_auth_type: "password".into()
                }
            )
            .is_err());
    }
}
