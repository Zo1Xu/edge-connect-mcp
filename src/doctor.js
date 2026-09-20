import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { supportedNode } from './options.js';
import { findEdge, exists } from './platform.js';
import { inspectEdge, findConnection, prepareEdge, RESTART_HELP } from './edge.js';
import { portAvailable } from './cdp.js';
import { upstreamCommand, probeMcp } from './upstream.js';
import { dailyMessage } from './daily.js';

export async function doctor(options, { log = () => {}, signal, inspect = inspectEdge, probe = probeMcp, edgeFinder = findEdge } = {}) {
  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, detail });
  add('Node', supportedNode() ? 'pass' : 'fail', process.versions.node);
  try { await edgeFinder(options.edgePath); add('Edge', 'pass', 'Microsoft Edge executable found.'); }
  catch (error) { add('Edge', options.browserUrl || options.wsEndpoint ? 'warn' : 'fail', error.message); }
  let info, connection;
  try {
    info = await inspect(options, { signal });
    info.warnings.forEach(message => add('Discovery', 'warn', message));
    if (info.daily || info.wsEndpoint) return await attachDoctor(options, info, checks, { probe, log, signal });
    if (info.profile) {
      let parent = info.profile.root;
      const present = await exists(parent);
      while (!await exists(parent) && path.dirname(parent) !== parent) parent = path.dirname(parent);
      if (!(await stat(parent)).isDirectory()) throw new Error('Profile or nearest parent is not a directory.');
      await access(parent, constants.R_OK | constants.W_OK);
      add('Profile', present ? 'pass' : info.profile.mode === 'daily' ? 'fail' : 'warn',
        present ? `${info.profile.mode} user data directory is readable/writable. This is not a sandbox boundary between its subprofiles.` : `${info.profile.mode} directory does not exist yet. ${info.profile.mode === 'daily' ? 'Open Edge once or select a profile.' : 'Will be created when launched.'}`);
    } else add('Profile', 'warn', 'Explicit endpoint: profile ownership cannot be inferred; user selected the endpoint.');
    const found = await findConnection(info, signal);
    connection = found.connection;
    if (!connection && options.launch) connection = await prepareEdge(options, { inspection: info, log, signal });
    add('Port', connection ? 'pass' : options.port && !await portAvailable(options.port) ? 'fail' : 'warn',
      connection ? `Verified loopback endpoint on port ${new URL(connection.url).port || '80'}.` : 'No verified port. Default launch asks Edge to allocate a free port; no fixed port is assumed.');
    add('Remote Debugging', connection ? 'pass' : 'fail', connection ? 'Remote debugging responds.' : info.processes.length ? RESTART_HELP : 'No active endpoint found. Run doctor --launch to start Edge, or supply --browser-url.');
    add('CDP', connection ? 'pass' : 'fail', connection ? `${connection.browser}; protocol ${connection.protocol}; Edge identity and browser WebSocket URL validated.` : found.errors.join('; ') || '/json/version is not available.');
  } catch (error) { add('CDP / Profile', 'fail', error.message); }
  try {
    const command = await upstreamCommand(connection?.wsEndpoint || 'ws://127.0.0.1:1/devtools/browser/doctor');
    const result = await probe(command, { connectBrowser: Boolean(connection), timeout: options.timeout, signal });
    add('MCP', 'pass', `Official chrome-devtools-mcp ${command.version}: initialize and tools/list passed (${result.tools} tools).`);
    add('MCP → Edge', connection ? 'pass' : 'warn', connection ? 'Official list_pages tool succeeded; page contents are omitted from this report.' : 'Skipped: no verified Edge CDP endpoint. MCP protocol readiness alone does not prove browser connectivity.');
  } catch (error) { add('MCP', 'fail', error.message); }
  return { ok: !checks.some(check => check.status === 'fail'), checks };
}

async function attachDoctor(options, info, checks, { probe, log, signal }) {
  const add = (name, status, detail) => checks.push({ name, status, detail });
  const daily = info.daily;
  const describe = state => !daily && state === 'no_listener' ? 'No active listener at the user-selected WebSocket endpoint.' : dailyMessage(state);
  let state = daily?.state || 'ready_to_attach';
  const canConnect = state === 'ready_to_attach';
  if (daily) {
    add('Profile', daily.endpointFile === 'unreadable_file' ? 'fail' : 'info', 'Daily attach only. User Data Dir identifies the browser; Profile Directory does not limit CDP access.');
    add('Policy', daily.policy === 'disabled' ? 'fail' : daily.policy === 'unknown' ? 'warn' : 'pass',
      daily.policy === 'disabled' ? dailyMessage('policy_disabled') : `Local policy check: ${daily.policy}. This is not a complete effective-policy audit; check edge://policy if needed.`);
    add('Discovery', daily.endpointFile === 'stale_file' ? 'warn' : 'info', `DevToolsActivePort: ${daily.endpointFile || 'not_checked'}. Discovery hint only; no browser-health claim.`);
    add('Port', canConnect ? 'pass' : 'warn', canConnect ? 'A local listener belongs to the selected Edge process; authorization is not yet verified.' : 'No verified active Edge listener. No port is chosen or browser launched.');
    if (options.launch) add('Launch', 'info', '--launch does not start or restart daily Edge.');
  } else {
    add('Profile', 'warn', 'User-selected WebSocket endpoint; profile ownership and Edge identity are not preverified.');
  }
  const connection = daily ? { mode: 'daily', profile: info.profile } : { wsEndpoint: info.wsEndpoint };
  let protocolReady = false;
  let connected = false;
  try {
    const command = await upstreamCommand(connection);
    const result = await probe(command, { connectBrowser: canConnect, authorization: true,
      timeout: options.timeout, authorizationTimeout: options.authorizationTimeout || 60000, signal,
      onState: next => { state = next; log(`[${next}] ${describe(next)}`); },
    });
    protocolReady = true;
    connected = result.browserConnected;
    if (connected) state = 'connected';
    add('MCP', 'pass', `Official chrome-devtools-mcp ${command.version}: initialize and tools/list passed (${result.tools} tools).`);
  } catch (error) {
    protocolReady = Boolean(error.protocolReady);
    if (canConnect) state = error.state || (signal?.aborted ? 'cancelled' : 'connection_failed');
    add('MCP', protocolReady ? 'pass' : 'fail', protocolReady ? `initialize and tools/list passed (${error.tools} tools); browser connection is reported separately.` : 'Official MCP protocol check failed. Check the pinned dependency and Node version.');
  }
  if (daily && state === 'no_listener') {
    daily.endpointFile = 'stale_file';
    const discovery = checks.find(check => check.name === 'Discovery' && check.detail.startsWith('DevToolsActivePort:'));
    if (discovery) Object.assign(discovery, { status: 'warn', detail: 'DevToolsActivePort: stale_file. No active listener; the hint is not a healthy endpoint.' });
  }
  add('Remote Debugging', connected ? 'pass' : 'fail', describe(state));
  add('CDP', connected ? 'pass' : 'warn', connected ? 'Browser connection verified by the official MCP tool. HTTP /json/version was not required.' : 'Not verified. Endpoint files and MCP initialization alone do not prove CDP connectivity.');
  add('MCP → Edge', connected ? 'pass' : canConnect ? 'fail' : 'warn', connected ? 'Official list_pages succeeded; page contents are omitted.' : canConnect ? describe(state) : 'Skipped: no attachable endpoint; resolve the reported discovery or policy state first.');
  return { ok: connected && protocolReady && !checks.some(check => check.status === 'fail'), mode: daily ? 'daily' : 'ws', state,
    ...(daily ? { discovery: { endpointFile: daily.endpointFile || 'not_checked', modifiedAt: daily.modifiedAt }, policy: daily.policy } : {}), checks };
}
