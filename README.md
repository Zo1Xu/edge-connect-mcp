# edge-connect-mcp

**English** | [简体中文](README.zh-CN.md)

Connect MCP clients such as Codex, Claude Code and Cursor to Microsoft Edge through automatic browser discovery and the official [Chrome DevTools MCP server](https://github.com/ChromeDevTools/chrome-devtools-mcp).

The project began with a `nodeRepl.fetch request failed` error while connecting Codex to Edge.

Uses your everyday Edge by default, preserving cookies, sessions and extensions. A separate persistent profile is optional.

> **Security:** Agents may access pages, cookies, signed-in sessions and sensitive data. Use trusted clients and `--isolated` when separation is needed. CDP usually has no authentication: keep it local and never expose or forward its port.

## Requirements

- Microsoft Edge Stable.
- Node.js `^20.19.0 || ^22.12.0 || >=23` + npm.
- Run the client and Edge on the same desktop system.

## Usage

### npm

Connect through `npx`; no clone required.

```sh
# Codex
codex mcp add edge-agent -- npx -y edge-connect-mcp@latest

# Claude Code
claude mcp add --transport stdio edge-agent -- npx -y edge-connect-mcp@latest
```

For Cursor and other stdio MCP clients, set the command to `npx` and arguments to `["-y", "edge-connect-mcp@latest"]`.

### Source

```sh
git clone https://github.com/Zo1Xu/edge-connect-mcp.git
cd edge-connect-mcp
npm ci
node bin/edge-connect-mcp.js doctor
node -p "require('node:path').resolve('bin/edge-connect-mcp.js')"
```

Replace `<absolute-entry-path>` below with the absolute path printed by the last command.

```sh
codex mcp add edge-agent -- node "<absolute-entry-path>"
claude mcp add --transport stdio edge-agent -- node "<absolute-entry-path>"
```

For Cursor and similar clients, use command `node` and arguments `["<absolute-entry-path>"]`.

## Options

| Option | Purpose |
| --- | --- |
| None | Prefer everyday Edge; allocate a port automatically when launching. |
| `--isolated` | Separate persistent user data directory. |
| `--profile <path>` | Select a user data root or an existing profile subfolder. |
| `--edge-path <path>` | Select the Edge executable. |
| `--browser-url <url>` | Attach to a local CDP endpoint. |
| `--help` | Show all options. |

Append options to the client arguments, for example:

```sh
codex mcp add edge-agent -- npx -y edge-connect-mcp@latest --isolated
```

If Edge is running without CDP, save your work, fully quit Edge including background processes, then retry. The launcher never forces it to close. Use `--isolated` if your Edge version or organization policy restricts debugging the default profile.

## Diagnostics

```sh
npx -y edge-connect-mcp@latest doctor
```

Checks Node, Edge, profiles, ports, remote debugging, CDP and MCP. It does not launch Edge by default; add `--launch` to allow startup or `--json` for a JSON report.

Edge and CDP may remain running after the client exits. Fully quit that instance and restart normally to disable debugging. Profile subfolders are not security boundaries, and isolated mode is not an OS sandbox. See [Security](SECURITY.md).

[MIT License](LICENSE) · [Contributing](CONTRIBUTING.md) · [Releasing](RELEASING.md)
