# edge-connect-mcp

**English** | [简体中文](README.zh-CN.md)

Connect MCP clients to Microsoft Edge through the official [Chrome DevTools MCP server](https://github.com/ChromeDevTools/chrome-devtools-mcp), pinned to **1.9.0**.

Daily mode attaches to your existing Edge session after browser authorization. It never launches, restarts or kills daily Edge, and never silently switches to an isolated profile.

> Agents can access pages and signed-in sessions. Use trusted clients, keep debugging ports local, and read [Security](SECURITY.md).

## Requirements

- Edge Stable with `edge://inspect/#remote-debugging`.
- Node.js `^20.19.0 || ^22.12.0 || >=23` and npm, on the same desktop as Edge.
- Permission to inspect local processes/listeners; daily mode also needs `lsof` on macOS/Linux.

## Connect daily Edge

1. Start Edge normally and open `edge://inspect/#remote-debugging`.
2. Enable **Allow remote debugging for this browser instance**.
3. Configure your MCP client, request a browser tool and allow the connection in Edge when prompted.

Use command `npx` with arguments `["-y", "edge-connect-mcp@latest"]`, or:

```sh
codex mcp add edge-agent -- npx -y edge-connect-mcp@latest
claude mcp add --transport stdio edge-agent -- npx -y edge-connect-mcp@latest
```

To run from source, use `npm ci` and configure command `node` with the absolute path to `bin/edge-connect-mcp.js`.

Daily mode delegates to `chrome-devtools-mcp --autoConnect --user-data-dir=<Edge root>`. The upstream server handles authorization; HTTP `/json/version` is not required. `DevToolsActivePort` is only a discovery hint. A successful `list_pages` call confirms the browser connection.

## Options

| Option | Purpose |
| --- | --- |
| No options | Attach to the default daily Edge after browser authorization. |
| `--isolated` | Launch/reuse this project's separate **persistent** Agent User Data Dir. |
| `--user-data-dir <path>` | Attach only to a specified Edge data root; never create or launch it. |
| `--profile <path>` | Launch/reuse a custom agent directory; standard Edge roots remain attach-only. |
| `--browser-url <url>` | Advanced: attach to loopback HTTP CDP using `/json/version`. |
| `--ws-endpoint <url>` | Advanced: connect a user-verified loopback browser WebSocket directly. |
| `--help` | All options, including executable selection, ports and timeouts. |

A **User Data Dir** contains `Local State`; `Default` and `Profile 1` are **Profile Directories** inside it. Selecting a subprofile does not restrict CDP access to that profile. Custom roots must be identifiable from local process information; otherwise automatic attachment stops.

**Lifecycle difference:** `edge-connect-mcp --isolated` retains its Agent Profile across runs. Upstream `chrome-devtools-mcp --isolated` uses a temporary profile cleaned up after browser closure. This wrapper does not forward its `--isolated` flag upstream. Neither mode inherits daily cookies or provides an OS sandbox.

## Diagnostics

For the local source version:

```sh
node bin/edge-connect-mcp.js doctor --json
node bin/edge-connect-mcp.js doctor --launch --isolated
```

Daily doctor may request authorization. `--launch` permits only agent-profile startup, never daily startup. `--authorization-timeout <ms>` controls doctor's authorization wait (default 60000); `--timeout` controls startup/protocol checks (default 20000).

Doctor distinguishes authorization required, waiting, rejected, policy disabled, stale files/no listener and connected. MCP initialization alone is not browser connectivity. For missing authorization, use Edge's Remote debugging page; for managed restrictions, check `edge://policy`. No policy is changed or bypassed.

Edge remains open after MCP disconnects. Disable daily debugging in Edge's UI; command-line agent debugging may remain active until that instance is closed.

[Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Releasing](RELEASING.md) · [MIT License](LICENSE)
