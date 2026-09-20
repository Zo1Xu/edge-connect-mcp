# 更新日志

[English](CHANGELOG.md) | **简体中文**

## 0.1.1 — 未发布

- daily 改为只连接：用户在 Edge 内开启调试，固定上游 MCP 1.9.0 使用 `--autoConnect --user-data-dir`；即使 `doctor --launch` 也不启动/重启 daily，不回退 isolated。
- DevToolsActivePort 仅作发现线索；核对监听与本机 Edge 进程归属，授权模式不再强制依赖 HTTP `/json/version`。
- doctor 区分旧文件/无监听、需要授权/等待/拒绝、检测到的策略禁用与连接成功；MCP 协议状态单独报告，授权等待独立限时。
- 新增只连接的 `--user-data-dir` 与高级回环 `--ws-endpoint`（别名 `--wsEndpoint`）。通过 `--profile` 指定标准 Edge 根目录仍只连接。
- 保持持久化 `--isolated`、自定义 Agent 启动、动态端口与已验证 `--browser-url`；明确与上游临时 `--isolated` 的生命周期区别。
- 新增授权、旧文件、策略、取消、端口归属与回归测试，包括真实官方上游的 WebSocket 拒绝连接路径。

## 0.1.0 — 2026-09-20

- 项目、npm 包、CLI 和隔离目录统一命名为 `edge-connect-mcp`。
- 跨平台发现 Edge Stable，优先连接日常 Profile。
- 支持持久化隔离目录及自定义用户目录或 Profile。
- 动态回环端口、Edge CDP 验证和确切 WebSocket 地址传递。
- 标准 stdio 桥接固定版本的官方 MCP，关闭其使用统计、CrUX 与更新检查。
- 默认只读的 doctor，可选启动检查，验证 MCP 握手及浏览器工具连接。
- 测试、npm bin、GitHub Actions、中英双语文档和 MIT 许可证。
