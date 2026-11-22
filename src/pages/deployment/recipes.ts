export const RECIPES = [
  { value: "1panel-app", description: "1Panel 应用包，按 Compose 目录约定发布", tags: ["1Panel", "Docker"] },
  { value: "custom-script", description: "通用发布方案，使用 releases/current 切换版本", tags: ["通用"] },
  { value: "docker-compose", description: "复制制品并执行 Docker Compose 构建与更新", tags: ["Docker"] },
  { value: "node-pm2", description: "Node 应用安装依赖后由 PM2 重载", tags: ["Node.js", "后端"] },
  { value: "static-nginx", description: "将前端静态资源发布到 Nginx 站点", tags: ["静态站点", "前端"] },
  { value: "static-openresty", description: "发布 OpenResty 静态站点并重载配置", tags: ["静态站点", "前端"] },
  { value: "systemd-binary", description: "发布由 systemd 托管的 Java、Go 或其他二进制应用", tags: ["systemd", "后端"] },
];

export const RECIPE_OPTIONS = RECIPES.map(({ value }) => ({ value, label: value }));
export const TARGET_DEFAULTS = { recipe: "docker-compose", remotePath: "/opt/apps/my-app" };
