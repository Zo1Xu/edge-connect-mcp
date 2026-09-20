# edge-connect-mcp

[English](README.md) | **简体中文**

让 Codex、Claude Code、Cursor 等 MCP 客户端连接 Microsoft Edge，自动发现或启动浏览器，并桥接官方 [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)。

项目起因是 Codex 连接 Edge 时遇到 `nodeRepl.fetch request failed`。

默认使用日常 Edge，保留 Cookie、登录状态和扩展；支持独立、持久化的 Profile。

> **安全提示：** AI Agent 可能访问页面、Cookie、登录会话及敏感信息。仅使用可信客户端；需要隔离时添加 `--isolated`。CDP 通常没有身份认证，只应在本机使用，不要暴露或转发端口。

## 环境要求

- Microsoft Edge Stable。
- Node.js `^20.19.0 || ^22.12.0 || >=23` + npm。
- 客户端与 Edge 运行在同一桌面系统中。

## 使用

### npm

通过 `npx` 接入，无需克隆项目。

```sh
# Codex
codex mcp add edge-agent -- npx -y edge-connect-mcp@latest

# Claude Code
claude mcp add --transport stdio edge-agent -- npx -y edge-connect-mcp@latest
```

Cursor 等 stdio MCP 客户端：命令 `npx`，参数 `["-y", "edge-connect-mcp@latest"]`。

### GitHub 源码

```sh
git clone https://github.com/Zo1Xu/edge-connect-mcp.git
cd edge-connect-mcp
npm ci
node bin/edge-connect-mcp.js doctor
node -p "require('node:path').resolve('bin/edge-connect-mcp.js')"
```

最后一条命令输出入口绝对路径，用它替换 `<absolute-entry-path>`。

```sh
codex mcp add edge-agent -- node "<absolute-entry-path>"
claude mcp add --transport stdio edge-agent -- node "<absolute-entry-path>"
```

Cursor 等客户端使用命令 `node`，参数 `["<absolute-entry-path>"]`。

## 常用参数

| 参数 | 用途 |
| --- | --- |
| 无参数 | 优先连接日常 Edge，启动时自动分配端口。 |
| `--isolated` | 独立、持久化用户目录。 |
| `--profile <path>` | 指定 User Data 根目录或已有 Profile 子目录。 |
| `--edge-path <path>` | 指定 Edge 可执行文件。 |
| `--browser-url <url>` | 连接本机 CDP。 |
| `--help` | 查看全部参数。 |

在客户端参数末尾追加选项，例如隔离模式：

```sh
codex mcp add edge-agent -- npx -y edge-connect-mcp@latest --isolated
```

Edge 已运行但未开启 CDP 时，请保存工作并完全退出 Edge（包括后台进程），再重试。程序不会强制关闭浏览器。若默认用户目录受版本或企业策略限制，可选择 `--isolated`。

## 诊断

```sh
npx -y edge-connect-mcp@latest doctor
```

检查 Node、Edge、Profile、端口、远程调试、CDP 和 MCP。默认不启动浏览器；`--launch` 允许启动，`--json` 输出 JSON。

客户端退出后 Edge 和 CDP 可能仍在运行。停用调试需完全退出该实例，再正常启动。Profile 子目录不是安全隔离边界，隔离模式也不是操作系统沙箱。详见 [安全说明](SECURITY.zh-CN.md)。

[MIT 许可证](LICENSE) · [中文参考译文](LICENSE.zh-CN.md) · [开发说明](CONTRIBUTING.zh-CN.md) · [发布步骤](RELEASING.zh-CN.md)
