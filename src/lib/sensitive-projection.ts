import rules from "./sensitive-projection-rules.json";

const MASK = "[REDACTED]";
const placeholder = new RegExp(`^${rules.placeholder}$`);
const keyBlock = new RegExp(rules.keyBlock, "g");
const auth = new RegExp(rules.auth, "gi");
const uri = new RegExp(rules.uri, "g");
const numericMcpActor = new RegExp(rules.numericMcpActor);
const withValue = (prefix: string) => new RegExp(`(${prefix})(${rules.value})`, "gim");
const argumentsWithValues = withValue(rules.argumentPrefix);
const commands = rules.commandRules.map(({ command, prefix }) => ({ scope: new RegExp(command, "gim"), flags: withValue(prefix) }));
const literals = rules.literalRules.map(({ pattern, replacement }) => ({ regex: new RegExp(pattern, "g"), replacement }));
const placeholders = new RegExp(`(${rules.placeholder})`, "g");

function literalPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rememberValue(value: string, found: Set<string>) {
  if (placeholder.test(value)) return value;
  // 同一值可能带引号写在命令中，又以裸值出现在回显或元数据中。
  const escaped = value.startsWith('\\"');
  const quote = escaped ? '\\"' : value[0];
  if (quote === '"' || quote === "'" || escaped) {
    value = value.slice(quote.length, value.length > quote.length && value.endsWith(quote) ? -quote.length : undefined);
  }
  if (value) {
    found.add(value);
    found.add(value.replace(/\\(["'\\ ])/g, "$1"));
  }
  return MASK;
}

/** 与 Rust 敏感库共用规则。IPC 入参兼容旧数据时，页面只保留这一份可展示投影。 */
export function projectSensitiveFields(fields: string[]) {
  const found = new Set<string>();
  const projected = fields.map((field) => {
    let text = field.replace(/\0/g, "").replace(keyBlock, MASK);
    // 审计主体末尾的数字是 MCP 令牌记录 ID，不能当作凭据值传播到其他字段。
    text = text.replace(numericMcpActor, `$1${MASK}`);
    const maskArgument = (_match: string, prefix: string, value: string) => prefix + rememberValue(value, found);
    text = text.replace(auth, (_match, prefix: string, value: string) => prefix + rememberValue(value, found));
    text = text.replace(uri, (_match, prefix: string, value: string, suffix: string) => prefix + rememberValue(value, found) + suffix);
    for (const { scope, flags } of commands) {
      text = text.replace(scope, (command) => command.replace(flags, maskArgument));
    }
    text = text.replace(argumentsWithValues, maskArgument);
    for (const { regex, replacement } of literals) text = text.replace(regex, replacement);
    return text;
  });
  if (!found.size) return projected;
  const repeats = new RegExp([...found].sort((a, b) => b.length - a.length).map(literalPattern).join("|"), "gi");
  return projected.map((text) => text.split(placeholders).map((part, index) => index % 2 ? part : part.replace(repeats, MASK)).join(""));
}

export function projectSensitiveText(text: string) {
  return projectSensitiveFields([text])[0];
}
