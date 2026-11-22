use std::{cmp::Reverse, collections::HashSet, sync::OnceLock};

use regex::{Captures, Regex, RegexBuilder};
use serde::Deserialize;

use super::REDACTED_SOURCE;
use crate::error::AppError;

const RULES: &str = include_str!("../../../../src/lib/sensitive-projection-rules.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuleSpec {
    key_block: String,
    value: String,
    argument_prefix: String,
    command_rules: Vec<CommandSpec>,
    literal_rules: Vec<LiteralSpec>,
    auth: String,
    uri: String,
    numeric_mcp_actor: String,
    placeholder: String,
}

#[derive(Deserialize)]
struct CommandSpec {
    command: String,
    prefix: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LiteralSpec {
    secret_type: String,
    label: String,
    pattern: String,
    replacement: String,
}

pub(super) struct LiteralRule {
    pub secret_type: String,
    pub label: String,
    pub regex: Regex,
    replacement: String,
}

struct Projection {
    key_block: Regex,
    auth: Regex,
    uri: Regex,
    numeric_mcp_actor: Regex,
    arguments: Regex,
    commands: Vec<(Regex, Regex)>,
    literals: Vec<LiteralRule>,
    placeholder: Regex,
    exact_placeholder: Regex,
    escaped_value: Regex,
}

fn shared_rules() -> Result<&'static Projection, AppError> {
    static COMPILED: OnceLock<Result<Projection, String>> = OnceLock::new();
    COMPILED
        .get_or_init(|| {
            let spec: RuleSpec = serde_json::from_str(RULES).map_err(|error| error.to_string())?;
            let compile = |pattern: &str| Regex::new(pattern).map_err(|error| error.to_string());
            let with_value = |prefix: &str| compile(&format!("(?im)({prefix})({})", spec.value));
            let commands = spec
                .command_rules
                .iter()
                .map(|rule| {
                    Ok::<_, String>((
                        compile(&format!("(?im){}", rule.command))?,
                        with_value(&rule.prefix)?,
                    ))
                })
                .collect::<Result<Vec<_>, _>>()?;
            let literals = spec
                .literal_rules
                .into_iter()
                .map(|rule| {
                    Ok::<_, String>(LiteralRule {
                        regex: compile(&rule.pattern)?,
                        secret_type: rule.secret_type,
                        label: rule.label,
                        replacement: rule.replacement,
                    })
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(Projection {
                key_block: compile(&spec.key_block)?,
                auth: compile(&format!("(?i){}", spec.auth))?,
                uri: compile(&spec.uri)?,
                numeric_mcp_actor: compile(&spec.numeric_mcp_actor)?,
                arguments: with_value(&spec.argument_prefix)?,
                commands,
                literals,
                exact_placeholder: compile(&format!("^{}$", spec.placeholder))?,
                placeholder: compile(&spec.placeholder)?,
                escaped_value: compile(r#"\\(["'\\ ])"#)?,
            })
        })
        .as_ref()
        .map_err(|error| AppError::Custom(format!("敏感规则初始化失败: {error}")))
}

pub(super) fn literal_rules() -> Result<&'static [LiteralRule], AppError> {
    Ok(&shared_rules()?.literals)
}

impl Projection {
    fn project_value(&self, value: &str, found: &mut HashSet<String>) -> String {
        if self.exact_placeholder.is_match(value) {
            return value.to_owned();
        }
        let value = [r#"\""#, "\"", "'"]
            .into_iter()
            .find_map(|quote| {
                value
                    .strip_prefix(quote)
                    .map(|tail| tail.strip_suffix(quote).unwrap_or(tail))
            })
            .unwrap_or(value);
        if !value.is_empty() {
            found.insert(value.to_owned());
            found.insert(self.escaped_value.replace_all(value, "$1").into_owned());
        }
        REDACTED_SOURCE.to_owned()
    }

    fn project_field(&self, field: &str, found: &mut HashSet<String>) -> String {
        let text = field.replace('\0', "");
        let text = self.key_block.replace_all(&text, REDACTED_SOURCE);
        // MCP 操作主体中的数字是令牌记录 ID，沿用遮蔽，但不作为同记录的重复凭据。
        let text = self.numeric_mcp_actor.replace_all(&text, "$1[REDACTED]");
        let text = self.auth.replace_all(&text, |captures: &Captures<'_>| {
            format!(
                "{}{}",
                &captures[1],
                self.project_value(&captures[2], found)
            )
        });
        let mut text = self
            .uri
            .replace_all(&text, |captures: &Captures<'_>| {
                format!(
                    "{}{}{}",
                    &captures[1],
                    self.project_value(&captures[2], found),
                    &captures[3]
                )
            })
            .into_owned();
        let mut mask_argument = |captures: &Captures<'_>| {
            format!(
                "{}{}",
                &captures[1],
                self.project_value(&captures[2], found)
            )
        };
        for (scope, flags) in &self.commands {
            text = scope
                .replace_all(&text, |segment: &Captures<'_>| {
                    flags
                        .replace_all(&segment[0], &mut mask_argument)
                        .into_owned()
                })
                .into_owned();
        }
        text = self
            .arguments
            .replace_all(&text, mask_argument)
            .into_owned();
        for rule in &self.literals {
            text = rule
                .regex
                .replace_all(&text, rule.replacement.as_str())
                .into_owned();
        }
        text
    }
}

/// 读取和展示专用。保留上下文并遮蔽同一条记录中的重复值，无敏感库写入副作用。
pub(in crate::services) fn project_fields<const N: usize>(
    fields: [&str; N],
) -> Result<[String; N], AppError> {
    let rules = shared_rules()?;
    let mut found = HashSet::new();
    let projected = fields.map(|field| rules.project_field(field, &mut found));
    if found.is_empty() {
        return Ok(projected);
    }

    let mut values: Vec<_> = found.into_iter().collect();
    values.sort_unstable_by_key(|value| Reverse(value.len()));
    let pattern = values
        .iter()
        .map(|value| regex::escape(value))
        .collect::<Vec<_>>()
        .join("|");
    let repeats = RegexBuilder::new(&pattern)
        .case_insensitive(true)
        .build()
        .map_err(|_| AppError::Custom("敏感值投影失败".into()))?;
    Ok(projected.map(|text| {
        let mut output = String::with_capacity(text.len());
        let mut start = 0;
        for marker in rules.placeholder.find_iter(&text) {
            output.push_str(&repeats.replace_all(&text[start..marker.start()], REDACTED_SOURCE));
            output.push_str(marker.as_str());
            start = marker.end();
        }
        output.push_str(&repeats.replace_all(&text[start..], REDACTED_SOURCE));
        output
    }))
}
