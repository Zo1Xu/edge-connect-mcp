# Security

**English** | [简体中文](SECURITY.zh-CN.md)

Supported release: **0.1.1**.

Security fixes target the latest release. Report vulnerabilities through [GitHub private reporting](https://github.com/Zo1Xu/edge-connect-mcp/security/advisories/new); report upstream issues through its [security policy](https://github.com/ChromeDevTools/chrome-devtools-mcp/security/policy).

## Browser access

Authorized agents can read pages, execute JavaScript and act using signed-in sessions. Cookies, extensions and sensitive information may be exposed. Page content is untrusted and can contain prompt injection. Use trusted clients and review consequential actions.

Daily mode requires browser-enabled remote debugging and the browser's connection approval when prompted. It never starts, restarts or kills daily Edge, copies cookies or silently switches profiles. Disable daily debugging through `edge://inspect/#remote-debugging`.

`edge-connect-mcp --isolated` retains a separate Agent User Data Dir; upstream `chrome-devtools-mcp --isolated` uses a temporary profile. Neither is an OS sandbox. Accounts signed into an Agent Profile remain accessible to agents. Profile subdirectories are not security boundaries.

## Connection checks

- Daily mode treats `DevToolsActivePort` as a hint, checks TCP and Edge process ownership, and delegates the authorization WebSocket to the official MCP. It does not require HTTP discovery.
- Unavailable or mismatched ownership stops automatic attachment. Local policy checks are best-effort and do not replace `edge://policy` or browser enforcement. Detected disablement stops attachment; policies are never changed.
- `--browser-url` verifies loopback HTTP CDP and self-reported Edge metadata. `--ws-endpoint` directly connects a user-selected loopback WebSocket without prior Edge/profile identity verification; independently verify it first.
- Command-line CDP usually has no authentication. Never expose or forward debugging ports. Connecting to loopback does not prove a manually started listener is bound exclusively to loopback.

These checks reduce accidental connections; they do not authenticate against malicious local processes. Files and processes may change after inspection.

## Lifecycle and reporting

Browsers remain open after MCP disconnects. Agent instances started with debugging switches may keep their listeners until closed. Doctor enumerates pages but does not navigate or close Edge; cancellation stops only its diagnostic MCP child. Dismiss any remaining browser prompt yourself.

Official MCP usage statistics, CrUX requests and update checks are disabled. Edge and AI-provider data handling are controlled separately. Reports omit page contents, but logs can contain local paths. Never upload profiles, cookies, tokens, private URLs or unredacted test logs.

Include versions, OS, impact and reproduction using a fresh test profile in private vulnerability reports.
