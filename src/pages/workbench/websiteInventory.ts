import type { WorkbenchRuntime } from "./context";

// 只返回域名和 OpsPub 配置文件名，Web 配置全文留在服务器端。
const WEBSITE_INVENTORY_COMMAND = String.raw`export LC_ALL=C
read_site_names() {
  awk '
    {
      sub(/#.*/, "")
      pieces = split($0, line, ";")
      for (i = 1; i <= pieces; i++) {
        if (match(line[i], /(^|[{}])[[:space:]]*server_name([[:space:]]|$)/)) {
          names = substr(line[i], RSTART + RLENGTH)
          collecting = 1
        } else if (collecting) {
          names = names " " line[i]
        }
        if (i < pieces && collecting) {
          sub(/^[[:space:]]+/, "", names)
          count = split(names, name, /[[:space:]]+/)
          if (name[1] !~ /^~/) {
            for (j = 1; j <= count; j++) {
              if (name[j] ~ /^(\*\.|\.)?[[:alnum:]][[:alnum:].-]*$/) printf "SITE\t%s\n", tolower(name[j])
            }
          }
          collecting = 0
        }
      }
    }'
}

partial=0
if [ -d /etc/nginx/conf.d ]; then
  if files=$(find /etc/nginx/conf.d -maxdepth 1 -type f \( -name 'ops-pub-*.conf' -o -name 'ops-sentry-*.conf' \) -printf '%f\n' 2>/dev/null); then
    printf '%s\n' "$files" | awk 'NF {printf "MANAGED\t%s\n", $0}'
  else
    partial=1
  fi
fi

if command -v nginx >/dev/null 2>&1 || command -v openresty >/dev/null 2>&1; then
  if config=$(nginx -T 2>/dev/null || openresty -T 2>/dev/null); then
    printf '%s\n' "$config" | read_site_names
  else
    partial=1
  fi
fi

if command -v docker >/dev/null 2>&1; then
  if containers=$(docker ps --format '{{.ID}} {{.Image}} {{.Names}}' 2>/dev/null); then
    for container in $(printf '%s\n' "$containers" | awk 'tolower($2 " " $3) ~ /nginx|openresty/ && $1 ~ /^[[:xdigit:]]+$/ {print $1}'); do
      if config=$(docker exec "$container" nginx -T 2>/dev/null || docker exec "$container" openresty -T 2>/dev/null); then
        printf '%s\n' "$config" | read_site_names
      else
        partial=1
      fi
    done
  else
    partial=1
  fi
fi
printf 'STATUS\t%s\n' "$partial"`;

export function managedSiteDomain(fileName: string): string {
  return fileName.replace(/^ops-(?:pub|sentry)-/, "").replace(/\.conf$/, "");
}

export async function readWebsiteInventory(runCommand: WorkbenchRuntime["runCommand"]) {
  const { stdout, exitCode } = await runCommand(WEBSITE_INVENTORY_COMMAND);
  const managedFiles = new Set<string>();
  const domains = new Set<string>();
  let status: string | undefined;

  for (const line of stdout.split(/\r?\n/)) {
    const [type, value] = line.split("\t");
    if (type === "STATUS") status = value;
    if (type === "MANAGED" && /^ops-(?:pub|sentry)-[\w.-]+\.conf$/.test(value ?? "")) managedFiles.add(value);
    if (type === "SITE" && value) domains.add(value);
  }

  if (exitCode !== 0 || (status !== "0" && status !== "1")) throw new Error("网站扫描未完成，请重试");

  const managedDomains = new Set(Array.from(managedFiles, (file) => managedSiteDomain(file).toLowerCase()));
  const externalSites = Array.from(domains).filter((domain) => !managedDomains.has(domain)).sort();
  return { managedFiles: Array.from(managedFiles).sort(), externalSites, count: managedDomains.size + externalSites.length, partial: status === "1" };
}
