import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { supportedNode } from './options.js';
import { findEdge, exists } from './platform.js';
import { inspectEdge, findConnection, prepareEdge, RESTART_HELP } from './edge.js';
import { portAvailable } from './cdp.js';
import { upstreamCommand, probeMcp } from './upstream.js';

export async function doctor(options, { log = () => {}, signal } = {}) {
  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, detail });
  add('Node', supportedNode() ? 'pass' : 'fail', process.versions.node);
  try { await findEdge(options.edgePath); add('Edge', 'pass', 'Microsoft Edge executable found.'); }
  catch (error) { add('Edge', options.browserUrl ? 'warn' : 'fail', error.message); }
  let info, connection;
  try {
    info = await inspectEdge(options);
    info.warnings.forEach(message => add('Discovery', 'warn', message));
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
    const result = await probeMcp(command, { connectBrowser: Boolean(connection), timeout: options.timeout });
    add('MCP', 'pass', `Official chrome-devtools-mcp ${command.version}: initialize and tools/list passed (${result.tools} tools).`);
    add('MCP → Edge', connection ? 'pass' : 'warn', connection ? 'Official list_pages tool succeeded; page contents are omitted from this report.' : 'Skipped: no verified Edge CDP endpoint. MCP protocol readiness alone does not prove browser connectivity.');
  } catch (error) { add('MCP', 'fail', error.message); }
  return { ok: !checks.some(check => check.status === 'fail'), checks };
}
