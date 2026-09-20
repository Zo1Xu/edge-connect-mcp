# edge-connect-mcp

[English](README.md) | **简体中文**

通过固定版本 **1.9.0** 的官方 [Chrome DevTools MCP server](https://github.com/ChromeDevTools/chrome-devtools-mcp)，让 MCP 客户端连接 Microsoft Edge。

默认 daily 模式在用户授权后连接现有 Edge 会话，不启动、重启或强制关闭日常 Edge，也不静默切换 isolated。

> Agent 可以访问页面和登录会话。仅使用可信客户端，不要暴露或转发调试端口。详见[安全说明](SECURITY.zh-CN.md)。

## 环境要求

- 提供 `edge://inspect/#remote-debugging` 的 Edge Stable。
- Node.js `^20.19.0 || ^22.12.0 || >=23` 和 npm，与 Edge 运行在同一桌面系统。
- 检查本机进程和监听的权限；macOS/Linux 的 daily 模式还需要 `lsof`。

## 连接日常 Edge

1. 正常启动 Edge，打开 `edge://inspect/#remote-debugging`。
2. 开启 **Allow remote debugging for this browser instance**。
3. 配置 MCP 客户端并调用浏览器工具，Edge 提示连接请求时由用户选择允许。

客户端使用命令 `npx`，参数 `["-y", "edge-connect-mcp@latest"]`，或：

```sh
codex mcp add edge-agent -- npx -y edge-connect-mcp@latest
claude mcp add --transport stdio edge-agent -- npx -y edge-connect-mcp@latest
```

**0.1.1 尚未发布。** 验收本地源码请先运行 `npm ci`，将客户端命令设为 `node`，参数设为 `bin/edge-connect-mcp.js` 的绝对路径。npm `@latest` 仍指向已发布版本。

daily 委托 `chrome-devtools-mcp --autoConnect --user-data-dir=<Edge 根目录>` 连接，授权由上游处理，不强制依赖 HTTP `/json/version`。`DevToolsActivePort` 只是发现线索；`list_pages` 成功才确认浏览器连通。

## 常用参数

| 参数 | 用途 |
| --- | --- |
| 无参数 | 用户在浏览器内授权后连接默认日常 Edge。 |
| `--isolated` | 启动/复用本项目独立、**持久化**的 Agent User Data Dir。 |
| `--user-data-dir <path>` | 只连接指定 Edge 根目录，不创建或启动。 |
| `--profile <path>` | 启动/复用自定义 Agent 目录；标准 Edge 根目录仍只连接。 |
| `--browser-url <url>` | 高级：通过 `/json/version` 连接回环 HTTP CDP。 |
| `--ws-endpoint <url>` | 高级：直接连接用户已独立确认可信的回环浏览器 WebSocket。 |
| `--help` | 全部参数，包括可执行文件、端口和超时设置。 |

**User Data Dir** 包含 `Local State`；`Default`、`Profile 1` 是其中的 **Profile Directory**。选择子 Profile 不会将 CDP 权限限制到单个 Profile。自定义根目录需能从本机进程信息识别，否则自动连接会停止。

**生命周期区别：** `edge-connect-mcp --isolated` 跨运行保留 Agent Profile；上游 `chrome-devtools-mcp --isolated` 使用临时 Profile，在浏览器关闭后清理。包装器不向上游转发自己的 `--isolated`。二者都不继承日常 Cookie，也不是操作系统沙箱。

## 诊断

本地源码版本：

```sh
node bin/edge-connect-mcp.js doctor --json
node bin/edge-connect-mcp.js doctor --launch --isolated
```

daily doctor 可能请求用户授权。`--launch` 只允许启动 Agent 实例，不启动 daily。`--authorization-timeout <ms>` 控制 doctor 授权等待（默认 60000）；`--timeout` 控制启动/协议检查（默认 20000）。

doctor 区分需要授权、等待、拒绝、策略禁用、旧文件/无监听和 connected。MCP 初始化成功不代表浏览器连通。未授权请使用 Edge 的 Remote debugging 页面；受管理限制请检查 `edge://policy`。程序不修改或绕过策略。

MCP 断开后 Edge 保持打开。daily 调试在 Edge UI 中关闭；命令行启动的 Agent 调试可能持续到该实例关闭。

[安全说明](SECURITY.zh-CN.md) · [开发说明](CONTRIBUTING.zh-CN.md) · [发布步骤](RELEASING.zh-CN.md) · [MIT 许可证](LICENSE)
