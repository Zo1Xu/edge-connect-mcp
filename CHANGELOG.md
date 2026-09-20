# 更新日志 / Changelog

## 0.1.0 — 尚未发布到 npm / Unreleased on npm

- 项目、npm 包、CLI 和隔离目录统一命名为 `edge-connect-mcp`。
  Project, npm package, CLI and isolated directory named `edge-connect-mcp`.
- 跨平台发现 Edge Stable，优先连接日常 Profile。
  Cross-platform Edge Stable discovery with everyday-profile-first connection.
- 支持持久化隔离目录及自定义用户目录或 Profile。
  Persistent isolated directories and custom user data/profile selection.
- 动态回环端口、Edge CDP 验证和确切 WebSocket 地址传递。
  Dynamic loopback ports, Edge CDP validation and exact WebSocket handoff.
- 标准 stdio 桥接固定版本的官方 MCP，关闭其使用统计、CrUX 与更新检查。
  Standard stdio bridge to a pinned official MCP, with usage statistics, CrUX and update checks disabled.
- 默认只读的 doctor，可选启动检查，验证 MCP 握手及浏览器工具连接。
  Read-only doctor with opt-in launch checks, MCP handshake and browser tool validation.
- 测试、npm bin、GitHub Actions、中英双语文档和 MIT 许可证。
  Tests, npm bin, GitHub Actions, bilingual documentation and MIT license.
