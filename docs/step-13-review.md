# OpsPub 第 13 步独立验收 · 设置与全局样式

**结论为阻断。** 设置页可能将已启用的系统开机自启显示为关闭，用户点击后会再次启用自启。亮色、暗色与 1100×700、1440×900 的四组浏览器场景均复现。其余问题涉及偏好读写和英文文案，见下方非阻断项。

验收基于 `opspub` 分支 `34bddf3` 的当前工作树。对照通用验收清单、设置与主题基线、实现回执、原型的公共侧栏及设置细节，检查了设置页、设备设置、工作区布局、全局样式与 Ant Design 主题的差异。原型 SHA-256 为 `c79edf954881e8cbfcb0c4429aae0ee7154aa8ca38f9e80f0a2b9d1daa52a86d`。 [验收清单](../.agent-pipeline/review-checklist.md) · [基线](../.agent-pipeline/baseline.md#L27) · [实现回执](../.agent-pipeline/step-13-implementation.md) · [设置原型](ops-prototype-direction2-workspace.html#L3097)

## 阻断

### B1 · 配置回填覆盖系统开机自启状态

1. 用合成 IPC 打开 `#/settings`，让持久化配置 `ui.auto_start=false`，系统插件 `is_enabled` 返回 `true`。暂扣设置页的 `get_all_config` 响应，让插件先返回。
2. 系统插件返回时开关是开启状态。释放配置响应后，开关变为关闭，且可点击。插件状态仍是开启。
3. 点击「开机自启」。捕获到 `plugin:autostart|enable`，应当发出的 `plugin:autostart|disable` 调用为零。四组均复现。

设置页分别发起配置和插件查询。插件先写入实际状态后，配置回填会按 `ui.auto_start` 再写一次同一字段。对照 `34bddf3`，改造前设置页在同一 `Promise.all` 回调里先回填配置，再应用插件结果，原复现顺序下的后写覆盖来自本步拆分。配置失配可以由系统启动项变更或插件成功后配置写入失败产生。返工应确保系统插件成功返回后，配置回填无法覆盖实际状态。复验应以最终开关和点击发出的 IPC 方向判断，并交叉测试两种响应顺序。 [并行读取与回填](../src/pages/settings/index.tsx#L160) · [点击与写入](../src/pages/settings/index.tsx#L255) · [配置映射](../src/store/settings.ts#L69) · [1100×700 复现截图](D:/itemWork/opspub-step13-races-r2-evidence-Be4yvY/light-1100-plugin-clobbered.png)

## 非阻断

- **启动时迟到的应用配置会撤销当前页面的语言切换。** 暂扣应用首次 `get_all_config` 的中文快照，等设置页就绪后切换 English。待写入成功、一级导航变为英文，再释放旧响应。四组中 `html.lang` 和主轨标签均退回中文，持久层仍为 `en-US`，再次加载恢复英文。应用和设置页各自读配置并整份回填的行为在基线已存在。 [应用级回填](../src/App.tsx#L45) · [设置页回填](../src/pages/settings/index.tsx#L160) · [复现截图](D:/itemWork/opspub-step13-races-r2-evidence-Be4yvY/light-1100-language-clobbered.png)
- **主题数据库写入失败后保留新主题。** 从 System 切换至另一明暗族，让 `set_config("ui.theme")` 返回错误。四组均显示写入错误并立即应用新主题，刷新仍按新 `ops_theme` 渲染，`ui.theme` 仍是 `system`。这条基线已有的双写路径与回执所述偏好失败回滚不一致。 [主题写入](../src/pages/settings/index.tsx#L386) · [浏览器主题存储](../src/store/app.ts#L113) · [刷新证据](D:/itemWork/opspub-step13-races-r2-evidence-Be4yvY/light-1100-theme-after-rejected-write.png)
- **英文模式下模型服务弹窗仍混有中文。** 主轨的六个入口、二级分区及通知浮层均随语言切换。打开 Add Model Service 后，标题和 Cancel 为英文，测试连接、确定等按钮依旧为中文，四组均可见。这些字段沿用了已有翻译回退。 [模型弹窗](../src/pages/settings/index.tsx#L847) · [翻译回退](../src/pages/settings/translations.ts#L49) · [英文弹窗截图](D:/itemWork/opspub-step13-independent-evidence-F3KaQp/light-1100-model-dialog.png)

## 实测覆盖

以下尺寸均为 Windows 配置所列的默认和最小值，用隔离 Edge 视口复现。测试使用本机回环静态产物、独立浏览器配置和合成 Tauri IPC。原型使用本地缓存的 Tailwind 和 Lucide 离线渲染。项目任务工具在本会话未提供。 [窗口配置](../src-tauri/tauri.conf.json#L16)

| 检查 | 结果 |
| --- | --- |
| 类型、构建和差异 | `pnpm exec tsc --noEmit`、`pnpm build --outDir <临时目录>`、设置及共享样式的 `git diff --check` 均退出 0。构建仍提示输出目录位于仓库外和分块超过 500 kB。 |
| 实施用例复跑 | 在独立构建上以原夹具复跑，每组 56 项，共 224 项通过。覆盖亮、暗、跟随系统及实时 OS 偏好变化、应用皮肤、刷新恢复、旧代理与白名单配置、关闭行为及其写入失败回滚、设备网卡失败重试和旧备份存储端。 [复跑证据](D:/itemWork/opspub-step13-review-replay-evidence-SqvQyT) |
| 18 分区与滚动 | 四组逐项实点导航，检查定位和唯一高亮，再从末项向首项直接滚动右侧，逐项检查左侧高亮和可见范围。侧栏折叠期间将内容滚到底，展开后高亮「推荐应用」并保持可见。未测出页面或设置滚动区的横向溢出。 [实现截图](D:/itemWork/opspub-step13-independent-evidence-F3KaQp/light-1100-zh-initial.png) |
| 原型与窗口布局 | 四组分别留存原型首页、外观、终端和实现截图。实现采用公共侧栏、独立卡片流和主题色卡，保留独立的「系统设置」路由入口。原型公共栏还列出环境重置、关于入口，当前范围沿用已有的配对、设备、备份和关于相关分区。 [原型截图](D:/itemWork/opspub-step13-prototype-review-r2/step-09-step13-prototype-settings-light-1100x700.png) · [实现外观截图](D:/itemWork/opspub-step13-review-replay-evidence-SqvQyT/light-1100-appearance.png) |
| 语言、旧入口和 Copilot | 四组验证英文即时更新主轨按钮的提示文字和工作区导航，刷新恢复英文。直接打开 `#/settings` 和保留的二级链接可达。从 Copilot 齿轮进入定位到模型服务，返回按钮回到 Copilot。 [英文主轨用例](D:/itemWork/opspub-step13-independent-r3.cjs) · [英文设置截图](D:/itemWork/opspub-step13-independent-evidence-F3KaQp/light-1100-en-settings.png) |
| 终端主题 | 合成已连接会话由实际 xterm 渲染。旧值 `high-contrast` 对应 Matrix Green，`opspub-dark` 对应 Monokai Pro，返回终端后可见 Dracula 背景和原会话输出。离开终端时 xterm DOM 卸载，返回后会话输出仍在。刷新恢复终端色卡与已保存的字号、行高、光标选项。 [终端截图](D:/itemWork/opspub-step13-independent-evidence-F3KaQp/dark-1100-xterm-dracula.png) |
| 弹窗及设备入口 | 四组检查新增模型服务、WebDAV 存储端、配对网卡及合成二维码，底部按钮都在视口内且可接收指针。配对用 10 个合成网卡覆盖内部滚动，二维码界面可退回选网卡。已配对设备可见，设备通道开启入口可触达。 [备份弹窗](D:/itemWork/opspub-step13-independent-evidence-F3KaQp/light-1100-storage-dialog.png) · [二维码弹窗](D:/itemWork/opspub-step13-qr-evidence-88v0zh/dark-1100-qr-actions.png) |
| 共享告警、审批和侧栏 | 四组从设置页打开通知，能看到一条合成告警和一条待审批。告警直达打开详情，后退回到设置且通知浮层已收起。待审批直达 Copilot 记录 #701，审批确认弹窗的关闭、拒绝和批准动作均可见。检查到确认界面为止。 [通知](D:/itemWork/opspub-step13-independent-evidence-F3KaQp/light-1100-notifications.png) · [告警详情](D:/itemWork/opspub-step13-independent-evidence-F3KaQp/light-1100-alert-detail.png) · [审批确认](D:/itemWork/opspub-step13-independent-evidence-F3KaQp/light-1100-approval-confirm.png) |

## 未验证

Windows 原生 Tauri/WebView2 窗口及真实应用重启、登录自启和托盘行为、真实 SSH 会话、实际设备配对与通道、真实备份导出和恢复、WebDAV 读写，以及审批执行结果均未验证。浏览器中的刷新、二维码和审批确认仅覆盖合成数据及前端行为。

B1 返工后复验两种响应顺序，再更新第 13 步裁决。本次仅写入本验收报告。已参考 `check` 技能。
