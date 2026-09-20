# 安全说明

[English](SECURITY.md) | **简体中文**

安全修复面向最新版本。通过 [GitHub 私密报告](https://github.com/Zo1Xu/edge-connect-mcp/security/advisories/new) 报告漏洞；上游问题参照其[安全政策](https://github.com/ChromeDevTools/chrome-devtools-mcp/security/policy)。

## 浏览器权限

获得授权的 Agent 可以读取页面、执行 JavaScript、使用登录会话操作网站。Cookie、扩展和敏感信息可能暴露。页面内容不可信，可能包含提示注入。仅使用可信客户端并审阅重要操作。

daily 需要用户在浏览器内开启调试，并在出现请求时允许连接。程序不会启动、重启或强制结束日常 Edge，不复制 Cookie，不静默切换 Profile。通过 `edge://inspect/#remote-debugging` 关闭 daily 调试。

`edge-connect-mcp --isolated` 保留独立 Agent User Data Dir；上游 `chrome-devtools-mcp --isolated` 使用临时 Profile。二者都不是操作系统沙箱。Agent Profile 中登录的账号仍可被 Agent 使用；Profile 子目录不是安全边界。

## 连接检查

- daily 将 `DevToolsActivePort` 视为线索，检查 TCP 与 Edge 进程归属，将授权 WebSocket 委托给官方 MCP，不要求 HTTP discovery。
- 无法确认归属或归属不匹配时停止自动连接。本地策略只是尽力检查，不能替代 `edge://policy` 或浏览器强制执行。检测到禁用即停止，不修改策略。
- `--browser-url` 验证回环 HTTP CDP 和服务自行报告的 Edge 元数据。`--ws-endpoint` 直接连接用户指定的回环 WebSocket，不预先验证 Edge/Profile 身份；请先独立确认可信。
- 命令行 CDP 通常没有身份认证。不要暴露或转发调试端口。通过回环连接不证明手动启动的监听器只绑定回环地址。

这些检查降低误连风险，不构成针对同机恶意进程的认证。文件和进程可在检查后变化。

## 生命周期与报告

MCP 断开后浏览器保持打开。带调试参数启动的 Agent 实例可能持续监听到关闭。doctor 枚举页面，但不导航或关闭 Edge；取消只结束诊断用 MCP 子进程。残留浏览器提示请自行关闭。

官方 MCP 的使用统计、CrUX 请求与更新检查默认关闭。Edge 和 AI 服务的数据处理由各自设置控制。报告省略页面内容，但日志可能包含本地路径。不要上传 Profile、Cookie、Token、私密 URL 或未脱敏测试日志。

私密漏洞报告请提供版本、系统、影响和使用全新测试 Profile 的复现步骤。
