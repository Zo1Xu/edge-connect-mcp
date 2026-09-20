# 开发说明 / Contributing

使用受支持的 Node.js 版本运行以下命令。源码为 ESM JavaScript，无需编译。
Use a supported Node.js version and run the commands below. The source is ESM JavaScript and needs no build step.

```sh
npm ci
npm run check
npm test
npm run test:pack
```

## 代码结构 / Code structure

| 文件 / File | 职责 / Responsibility |
| --- | --- |
| `src/edge.js`, `src/platform.js` | 浏览器发现、Profile 与生命周期。 / Browser discovery, profiles and lifecycle. |
| `src/cdp.js` | CDP 地址与浏览器身份验证。 / CDP endpoint and browser identity validation. |
| `src/upstream.js` | 官方依赖、stdio 桥接与 MCP 诊断。 / Official dependency, stdio bridge and MCP diagnostics. |

不要重新实现上游 DevTools 工具；日志不得写入 MCP stdout，也不得通过 MCP stdin 请求交互确认。
Do not reimplement upstream DevTools tools, write logs to MCP stdout, or ask interactive questions on MCP stdin.

## 验证 / Validation

为实际行为变化添加回归测试，尤其是 Profile 归属、回环地址验证、启动失败和子进程清理。自动测试不得使用个人浏览器 Profile。
Add regression tests for meaningful behavior changes, especially profile ownership, loopback validation, startup failures and subprocess cleanup. Never use personal browser profiles in automated tests.

`npm run test:edge` 是可选桌面测试，需要 Node 22+ 和已安装的 Edge；它创建临时 Profile，验证完整链路，然后仅关闭该测试浏览器并清理目录。
`npm run test:edge` is an optional desktop test requiring Node 22+ and Edge. It creates a temporary profile, verifies the full connection, then closes only that test browser and cleans up its directory.

按照 [SECURITY.md](SECURITY.md) 私下报告安全问题。不要上传 Profile 归档、Cookie、登录会话、私密页面地址或个人机器配置。
Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Do not upload profile archives, cookies, sessions, private page URLs or personal machine configuration.
