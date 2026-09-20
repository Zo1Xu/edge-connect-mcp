# Security policy

**English** | [简体中文](SECURITY.zh-CN.md)

## Supported versions

Security fixes target the latest release of `edge-connect-mcp`. Upgrade to the latest version when reporting a vulnerability.

## Trust boundary

The default mode connects to your everyday Edge user data directory. Authorized MCP clients and agents can read pages, inspect network requests, run page JavaScript and act using signed-in sessions. Cookies, extensions and other sensitive state may also be exposed. Page content is untrusted and may contain prompt injection. Use trusted clients and review consequential actions in those clients.

`--isolated` uses a separate persistent user data directory, not an OS sandbox. Accounts signed into it remain accessible to agents. A profile subfolder is not a security boundary: CDP may expose other profiles in the same browser process.

## CDP and browser lifecycle

CDP usually has no authentication. The launcher binds to loopback, rejects non-loopback endpoints and HTTP redirects, validates the browser WebSocket address and passes it to the official MCP. `localhost` is normalized to a numeric loopback address. These checks prevent accidental connections, not impersonation by a malicious local process; Edge identity fields are self-reported. Never forward or publicly expose CDP ports.

For a manually started browser, ensure its listener is not exposed on another interface. A loopback connection cannot prove an existing service listens exclusively on loopback; local processes may still access CDP and user data.

Browsers remain open after the MCP client disconnects, and CDP may remain accessible. Fully quit the relevant Edge instance and restart normally to disable debugging. The launcher never kills an existing browser, copies cookies, deletes profiles or bypasses organizational policy.

Official MCP usage statistics, CrUX requests and update checks are disabled by default. Edge telemetry and AI-provider data handling are controlled separately. Reports omit page contents, but errors or logs may contain local paths; redact them before sharing.

## Reporting vulnerabilities

Use [GitHub private vulnerability reporting](https://github.com/Zo1Xu/edge-connect-mcp/security/advisories/new). Do not disclose exploit details, credentials, CDP WebSocket URLs or browsing data in public issues.

Include package, Node and Edge versions, OS, reproduction using a fresh test profile, impact and suggested mitigation. Never include real cookies or tokens. Report upstream issues through the [official upstream security policy](https://github.com/ChromeDevTools/chrome-devtools-mcp/security/policy) as well.
