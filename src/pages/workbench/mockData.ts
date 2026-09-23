import type {
  ContainerItem,
  WebsiteItem,
  DatabaseItem,
  BackupTaskItem,
  CronTaskItem,
  SystemServiceItem,
  WorkspaceFileItem,
  AppStoreItem,
} from "./types";

export const MOCK_CONTAINERS: ContainerItem[] = [
  { id: "1", name: "cihui_server", tag: "cihui_server", image: "cihui_server:latest", status: "running", ports: "0.0.0.0:8099->8099/tcp, [::]:8099->8099/tcp" },
  { id: "2", name: "single_fucai", tag: "ficai_server", image: "single_fucai:5.5.3", status: "running", ports: "—" },
  { id: "3", name: "1Panel-mysql-zR4Y", tag: "mysql", image: "mysql:8.4.8", status: "running", ports: "0.0.0.0:3306->3306/tcp, [::]:3306->3306/tcp" },
  { id: "4", name: "1Panel-openrest...", tag: "openresty", image: "1panel/openresty:1.27.1.2-5-1-focal", status: "running", ports: "—" },
  { id: "5", name: "1Panel-redis-MtRp", tag: "redis", image: "redis:8.6.2", status: "running", ports: "0.0.0.0:6379->6379/tcp, [::]:6379->6379/tcp" },
  { id: "6", name: "single_music", tag: "single_music", image: "single_music:5.5.3", status: "running", ports: "—" },
  { id: "7", name: "single_website", tag: "single_website", image: "single_website:5.5.3", status: "running", ports: "—" },
  { id: "8", name: "ysblog", tag: "ysblog", image: "ysblog:latest", status: "running", ports: "0.0.0.0:8030->8030/tcp, [::]:8030->8030/tcp" },
];

export const MOCK_WEBSITES: WebsiteItem[] = [
  { id: "1", domain: "156.226.177.226", docRoot: "/www/sites/156.226.177.226/index", status: "running", port: 80, ssl: false, remark: "默认站点 (OpenResty 反代)" },
  { id: "2", domain: "api.ops-sentry.local", docRoot: "/www/sites/api-ops/dist", status: "running", port: 8080, ssl: true, sslExpiry: "2027-03-12 (剩余 180 天)", remark: "微服务网关" },
  { id: "3", domain: "blog.ops.io", docRoot: "/www/sites/blog/public", status: "running", port: 8030, ssl: true, sslExpiry: "2027-01-08 (剩余 112 天)", remark: "技术博客与发布台" },
];

export const MOCK_DATABASES: DatabaseItem[] = [
  { id: "1", name: "ops_sentry_prod", type: "mysql", charset: "utf8mb4_general_ci", engine: "InnoDB", size: "328.4 MB", backupCount: 14, status: "normal" },
  { id: "2", name: "nacos_config", type: "mysql", charset: "utf8mb4_unicode_ci", engine: "InnoDB", size: "48.2 MB", backupCount: 7, status: "normal" },
  { id: "3", name: "redis_cache_cluster", type: "redis", size: "128.0 MB", backupCount: 4, status: "normal" },
];

export const MOCK_BACKUP_TASKS: BackupTaskItem[] = [
  { id: "1", targetType: "database", targetName: "ops_sentry_prod", fileName: "mysql_ops_sentry_prod_20260922_0300.sql.gz", size: "84.2 MB", completedAt: "2026-09-22 03:02:14", status: "success" },
  { id: "2", targetType: "website", targetName: "156.226.177.226", fileName: "site_156.226.177.226_20260921_0400.tar.gz", size: "142.8 MB", completedAt: "2026-09-21 04:05:32", status: "success" },
  { id: "3", targetType: "directory", targetName: "/www/wwwroot/configs", fileName: "dir_configs_20260920_0200.tar.gz", size: "12.4 MB", completedAt: "2026-09-20 02:00:45", status: "success" },
];

export const MOCK_CRON_TASKS: CronTaskItem[] = [
  { id: "1", name: "系统磁盘空间巡检与告警", type: "shell", cronExpr: "0 */2 * * *", cycleDesc: "每 2 小时执行一次", enabled: true, lastRunAt: "2026-09-23 10:00:00", lastDuration: "1.2s", lastStatus: "success" },
  { id: "2", name: "MySQL 核心库每日全量备份", type: "backup", cronExpr: "0 3 * * *", cycleDesc: "每天凌晨 03:00", enabled: true, lastRunAt: "2026-09-23 03:00:00", lastDuration: "42.5s", lastStatus: "success" },
  { id: "3", name: "自动清理超过 14 天的系统日志", type: "clean", cronExpr: "30 4 * * 0", cycleDesc: "每周日 04:30", enabled: true, lastRunAt: "2026-09-20 04:30:00", lastDuration: "5.8s", lastStatus: "success" },
  { id: "4", name: "OpenResty 访问日志定时轮转归档", type: "shell", cronExpr: "59 23 * * *", cycleDesc: "每天 23:59", enabled: true, lastRunAt: "2026-09-22 23:59:00", lastDuration: "3.1s", lastStatus: "success" },
];

export const MOCK_SYSTEM_SERVICES: SystemServiceItem[] = [
  { name: "docker.service", desc: "Docker Application Container Engine", status: "active", enabled: true, type: "systemd" },
  { name: "sshd.service", desc: "OpenSSH server daemon", status: "active", enabled: true, type: "systemd" },
  { name: "openresty.service", desc: "OpenResty high performance web server", status: "active", enabled: true, type: "systemd" },
  { name: "chrony.service", desc: "NTP client/server daemon", status: "active", enabled: true, type: "systemd" },
  { name: "ufw.service", desc: "Uncomplicated firewall", status: "active", enabled: true, type: "systemd" },
];

export const MOCK_APPS: AppStoreItem[] = [
  { id: "docker", name: "Docker", status: "installed", statusText: "已安装", category: "basic", desc: "容器运行时 —— 其余数据服务的基础。国内走 apt/dnf 包源 + 自动配置镜像加速器。", version: "27.0.3", port: "—", buttonText: "重装", btnType: "reinstall" },
  { id: "openresty", name: "OpenResty", status: "external", statusText: "外部已装", category: "web", desc: "Web 服务器 / 反向代理 (Nginx + Lua 增强版，Docker 安装)。conf/证书挂载到宿主...", versions: ["1.27.1.1", "1.25.3.1"], port: "80/443", buttonText: "外部已装", btnType: "external" },
  { id: "mysql", name: "MySQL", status: "external", statusText: "外部已装", category: "db", desc: "关系型数据库 (Docker，绑 127.0.0.1)。装完自动入凭据库，可在 [数据库] 标签经 SSH 隧道直连。", versions: ["8.4 LTS", "8.0.36", "5.7.44"], port: "3306", buttonText: "外部已装", btnType: "external" },
  { id: "redis", name: "Redis", status: "external", statusText: "外部已装", category: "db", desc: "内存键值库 (Docker，绑 127.0.0.1, requirepass)。装完可在 [数据库] 标签的 Redis 浏览器用。", versions: ["7.4", "7.2", "6.2"], port: "6379", buttonText: "外部已装", btnType: "external" },
  { id: "postgresql", name: "PostgreSQL", status: "available", statusText: "", category: "db", desc: "关系型数据库 (Docker，绑 127.0.0.1)。装完自动入凭据库，可在 [数据库] 标签直连。", versions: ["16", "15", "14"], port: "5432", buttonText: "安装", btnType: "install" },
  { id: "mongodb", name: "MongoDB", status: "available", statusText: "", category: "db", desc: "文档型 NoSQL 数据库 (Docker，绑 127.0.0.1)。装完自动入凭据库；[数据库] 标签浏览器暂未支持，先用「容器」...", versions: ["7", "6"], port: "27017", buttonText: "安装", btnType: "install" },
  { id: "clickhouse", name: "ClickHouse", status: "available", statusText: "", category: "db", desc: "列式分析型数据库 (Docker，绑 127.0.0.1, HTTP 8123)。装完自动入凭据库；[数据库] 标签浏览器暂未支持。", versions: ["24.8 LTS", "24.3 LTS"], port: "8123", buttonText: "安装", btnType: "install" },
  { id: "wordpress", name: "WordPress", status: "available", statusText: "", category: "site", desc: "最流行的建站 / 博客 CMS (Docker，wordpress + 内置 MariaDB，绑 127.0.0.1)。装完打开页面走 Web 安装向...", versions: ["6.7", "6.6"], port: "8080", buttonText: "安装", btnType: "install" },
  { id: "halo", name: "Halo", status: "available", statusText: "", category: "site", desc: "国产现代化博客 / 建站系统 (Docker，内置 H2，绑 127.0.0.1)。装完打开页面走初始化向导设管理员。", versions: ["2.20", "2.19"], port: "8090", buttonText: "安装", btnType: "install" },
  { id: "gitea", name: "Gitea", status: "available", statusText: "", category: "dev", desc: "轻量自托管 Git 服务 (Docker，内置 SQLite，绑 127.0.0.1)。装完打开页面完成安装并注册首个管理员。", versions: ["1.22", "1.21"], port: "3000", buttonText: "安装", btnType: "install" },
  { id: "jenkins", name: "Jenkins", status: "available", statusText: "", category: "dev", desc: "老牌 CI/CD 自动化服务器 (Docker，绑 127.0.0.1)。首次登录的初始管理员密码在容器日志里 (详情见「日志」)。", versions: ["LTS", "Latest"], port: "8080", buttonText: "安装", btnType: "install" },
  { id: "grafana", name: "Grafana + Prometheus", status: "available", statusText: "", category: "monitor", desc: "可视化监控套件 (Docker，Grafana + Prometheus，绑 127.0.0.1)。装完用生成的 admin 密码登录 (见「服务凭...", versions: ["Grafana 11.3"], port: "3000", buttonText: "安装", btnType: "install" },
  { id: "uptime_kuma", name: "Uptime Kuma", status: "available", statusText: "", category: "monitor", desc: "网页服务可用性监控套件 (Docker，绑 127.0.0.1)，轻量且功能强劲。", versions: ["1.23.13"], port: "3001", buttonText: "安装", btnType: "install" },
  { id: "ollama", name: "Ollama", status: "available", statusText: "", category: "ai", desc: "本地大模型运行时 (Docker，绑 127.0.0.1, 11434 API)。支持一键拉取 Llama3、Qwen、DeepSeek 等大模型。", versions: ["0.3.14"], port: "11434", buttonText: "安装", btnType: "install" },
  { id: "open_webui", name: "Open WebUI", status: "available", statusText: "", category: "ai", desc: "Ollama / OpenAI 兼容接口的对话前端 (Docker，绑 127.0.0.1, 3000)。精致开箱即用的大模型聊天界面。", versions: ["Latest"], port: "3000", buttonText: "安装", btnType: "install" },
];

export const MOCK_WORKSPACE_FILES: WorkspaceFileItem[] = [
  { id: "1", name: "backup_mysql_20260922.tar.gz", size: "84.2 MB", mtime: "2026-09-22 03:02:14", category: "backups" },
  { id: "2", name: "nginx_access_20260922.log", size: "14.5 MB", mtime: "2026-09-22 23:59:00", category: "logs" },
  { id: "3", name: "docker_cleanup_unused.sh", size: "1.2 KB", mtime: "2026-09-18 14:20:10", category: "scripts" },
  { id: "4", name: "cron_run_disk_check_output.txt", size: "4.5 KB", mtime: "2026-09-23 10:00:02", category: "runs" },
];
