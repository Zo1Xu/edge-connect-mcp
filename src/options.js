export const HELP = `edge-connect-mcp [doctor] [options]

Default: attach to everyday Edge through browser-approved remote debugging.
Open: edge://inspect/#remote-debugging
Enable: Allow remote debugging for this browser instance
WARNING: AI agents can access pages, signed-in sessions, cookies and sensitive data.

  --isolated                 Use a separate, persistent Edge user data directory
  --profile <path>           Use a user data directory or an existing profile subfolder
  --user-data-dir <path>     Attach to an existing Edge user data root (never launch)
  --profile-directory <name> Choose a profile inside the selected user data directory
  --edge-path <path>         Edge executable (also EDGE_PATH)
  --browser-url <url>        Attach to an explicit loopback CDP HTTP endpoint
  --ws-endpoint <url>        Attach directly to a user-selected loopback browser WebSocket
  --port <number>            Explicit CDP port (default: Edge chooses a free port)
  --timeout <milliseconds>   Startup timeout (default: 20000)
  --authorization-timeout <ms> Doctor authorization/connection wait (default: 60000)
  --launch                  doctor only: allow agent-profile startup; daily never launches
  --json                    doctor only: machine-readable report
  --help, -h                Show help
  --version, -v             Show version

doctor may request browser authorization; it never launches daily Edge or closes Edge.
All launcher messages go to stderr during MCP operation.
`;

export function parseOptions(args) {
  const options = { command: 'serve', timeout: 20000 };
  if (args[0] === 'doctor') { options.command = 'doctor'; args = args.slice(1); }
  const values = new Map([
    ['--profile', 'profile'], ['--profile-directory', 'profileDirectory'],
    ['--user-data-dir', 'userDataDir'], ['--userDataDir', 'userDataDir'],
    ['--edge-path', 'edgePath'], ['--browser-url', 'browserUrl'],
    ['--browserUrl', 'browserUrl'], ['--port', 'port'], ['--timeout', 'timeout'],
    ['--ws-endpoint', 'wsEndpoint'], ['--wsEndpoint', 'wsEndpoint'],
    ['--authorization-timeout', 'authorizationTimeout'],
  ]);
  const booleans = new Map([
    ['--isolated', 'isolated'], ['--launch', 'launch'], ['--json', 'json'],
    ['--help', 'help'], ['-h', 'help'], ['--version', 'version'], ['-v', 'version'],
  ]);
  for (let i = 0; i < args.length; i++) {
    const [key, ...tail] = args[i].split('=');
    if (booleans.has(key) && !tail.length) { options[booleans.get(key)] = true; continue; }
    if (!values.has(key)) throw new Error(`Unknown argument: ${args[i]}. Use --help.`);
    const value = tail.length ? tail.join('=') : args[++i];
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value.`);
    options[values.get(key)] = value;
  }
  if (options.isolated && options.profile) throw new Error('--isolated and --profile are mutually exclusive.');
  if (options.userDataDir && (options.isolated || options.profile)) throw new Error('--user-data-dir is attach-only and cannot be combined with --isolated or --profile.');
  if (options.browserUrl && options.wsEndpoint) throw new Error('--browser-url and --ws-endpoint are mutually exclusive.');
  if ((options.browserUrl || options.wsEndpoint) && (options.isolated || options.profile || options.userDataDir || options.profileDirectory || options.port)) {
    throw new Error('Explicit endpoints cannot be combined with profile selection or --port.');
  }
  if (options.command !== 'doctor' && (options.launch || options.json)) throw new Error('--launch and --json are doctor-only options.');
  if (options.command !== 'doctor' && options.authorizationTimeout !== undefined) throw new Error('--authorization-timeout is doctor-only. In serve mode the MCP client controls request timeouts.');
  for (const [key, min, max] of [['port', 1, 65535], ['timeout', 100, 300000], ['authorizationTimeout', 100, 300000]]) {
    if (options[key] === undefined) continue;
    if (!/^\d+$/.test(String(options[key]))) throw new Error(`Invalid ${key}.`);
    options[key] = Number(options[key]);
    if (options[key] < min || options[key] > max) throw new Error(`${key} must be ${min}–${max}.`);
  }
  if (options.profileDirectory && !/^[^/\\\x00-\x1f]+$/.test(options.profileDirectory)) throw new Error('Profile directory must be a single folder name.');
  if (['.', '..'].includes(options.profileDirectory)) throw new Error('Invalid profile directory.');
  return options;
}

export function supportedNode(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  return (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major >= 23;
}
