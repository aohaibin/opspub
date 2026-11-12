use serde::Serialize;

const SKILL_INDEX: &str = include_str!("../../../../docs/skills-index-20261006.md");
pub const SKILL_INDEX_VERSION: &str = "2026-10-06";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillReference {
    pub id: String,
    pub name: String,
    pub version: &'static str,
    pub description: String,
    pub triggers: Vec<String>,
    pub content_available: bool,
    pub trust: &'static str,
}

pub fn search(query: &str, limit: usize) -> Vec<SkillReference> {
    let query = query.trim().to_lowercase();
    let mut matches = entries()
        .into_iter()
        .filter_map(|skill| {
            let score = relevance(&skill, &query);
            (query.is_empty() || score > 0).then_some((score, skill))
        })
        .collect::<Vec<_>>();
    matches.sort_by(|(left_score, left), (right_score, right)| {
        right_score
            .cmp(left_score)
            .then_with(|| left.name.cmp(&right.name))
    });
    matches
        .into_iter()
        .take(limit)
        .map(|(_, skill)| skill)
        .collect()
}

pub fn get(skill_id: &str) -> Option<SkillReference> {
    entries().into_iter().find(|skill| skill.id == skill_id)
}

pub fn select_for_plan(
    intent: &str,
    requested_ids: &[String],
) -> Result<Vec<SkillReference>, &'static str> {
    if requested_ids.len() > 3 {
        return Err("skillIds 最多选择 3 项");
    }
    let mut selected = Vec::new();
    for id in requested_ids {
        let skill = get(id).ok_or("skillIds 包含未知的内置技能 ID")?;
        if selected
            .iter()
            .all(|item: &SkillReference| item.id != skill.id)
        {
            selected.push(skill);
        }
    }
    for skill in search(intent, 3) {
        if selected.len() == 3 {
            break;
        }
        if selected.iter().all(|item| item.id != skill.id) {
            selected.push(skill);
        }
    }
    Ok(selected)
}

fn entries() -> Vec<SkillReference> {
    SKILL_INDEX
        .split("\n## ")
        .skip(1)
        .filter_map(|section| {
            let (title, body) = section.split_once('\n')?;
            let number = title.split('.').next()?.parse::<u32>().ok()?;
            if !(1..=41).contains(&number) {
                return None;
            }
            let name = title.split('`').nth(1)?.trim();
            let description = body
                .lines()
                .find_map(|line| line.trim().strip_prefix("**描述**："))
                .or_else(|| {
                    body.lines()
                        .find_map(|line| line.trim().strip_prefix("**描述**: "))
                })?
                .trim()
                .chars()
                .take(600)
                .collect::<String>();
            let trigger_text = body
                .split_once("**触发词**：")
                .map(|(_, text)| text)
                .or_else(|| body.split_once("**触发词**:").map(|(_, text)| text))?;
            let triggers = trigger_text
                .split('`')
                .skip(1)
                .step_by(2)
                .map(str::trim)
                .filter(|trigger| !trigger.is_empty())
                .take(40)
                .map(str::to_owned)
                .collect::<Vec<_>>();
            if description.is_empty() || triggers.is_empty() {
                return None;
            }
            Some(SkillReference {
                id: name.to_owned(),
                name: name.to_owned(),
                version: SKILL_INDEX_VERSION,
                description,
                triggers,
                content_available: false,
                trust: "untrusted_reference_only",
            })
        })
        .collect()
}

fn relevance(skill: &SkillReference, query: &str) -> usize {
    if query.is_empty() {
        return 0;
    }
    let name = skill.name.to_lowercase();
    let description = skill.description.to_lowercase();
    let mut score = if query.contains(&name) { 100 } else { 0 };
    for trigger in &skill.triggers {
        let trigger = trigger.to_lowercase();
        if query.contains(&trigger) {
            score += 20 + trigger.chars().count().min(20);
        }
    }
    for token in query.split(|character: char| {
        character.is_whitespace() || ",，。！？;；/\\()[]{}".contains(character)
    }) {
        if token.chars().count() < 2 {
            continue;
        }
        if name.contains(token) {
            score += 12;
        }
        if description.contains(token) {
            score += 4;
        }
        if skill
            .triggers
            .iter()
            .any(|trigger| trigger.to_lowercase().contains(token))
        {
            score += 8;
        }
    }
    score
}

#[cfg(test)]
mod tests {
    use super::{get, search, select_for_plan, SKILL_INDEX_VERSION};

    #[test]
    fn discovers_only_bundled_index_metadata() {
        assert_eq!(search("", 100).len(), 41);
        let docker = search("当前服务器有哪些 docker 容器", 5);
        assert_eq!(
            docker.first().map(|skill| skill.id.as_str()),
            Some("docker-ps")
        );
        let skill = get("docker-ps").expect("known skill");
        assert_eq!(skill.version, SKILL_INDEX_VERSION);
        assert!(!skill.content_available);
        assert_eq!(skill.trust, "untrusted_reference_only");
        assert!(get("../../secrets").is_none());
        assert!(search("no-such-skill-xyz", 5).is_empty());
    }

    #[test]
    fn plan_skill_selection_is_bounded_and_validates_ids() {
        let selected = select_for_plan("排查 docker 容器启动失败", &[]).expect("auto match");
        assert!(selected.iter().any(|skill| skill.id == "docker-ps"));
        assert!(select_for_plan("无匹配的自定义主题", &[])
            .expect("generic plan remains available")
            .is_empty());
        assert!(select_for_plan("通用问题", &["missing-skill".into()]).is_err());
        assert!(select_for_plan(
            "通用问题",
            &[
                "docker-ps".into(),
                "db-tools".into(),
                "git-server".into(),
                "caddy-traefik".into(),
            ]
        )
        .is_err());
    }
}
