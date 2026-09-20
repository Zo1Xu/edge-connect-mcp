import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { doctor } from '../src/doctor.js';
import { prepareEdge, PRIVACY_NOTICE } from '../src/edge.js';
import { activePort, edgeProcesses, matchingProcesses } from '../src/platform.js';
import { verifyCdp } from '../src/cdp.js';
import { probeMcp } from '../src/upstream.js';
import { fileURLToPath } from 'node:url';

// Opt-in desktop test; only this unique temporary browser belongs to the test.
if (typeof WebSocket === 'undefined') throw new Error('The optional desktop smoke test requires Node 22+ for WebSocket cleanup.');
const root = await mkdtemp(path.join(os.tmpdir(), 'edge-connect-mcp-desktop-'));
let connection;
let closed = false;
try {
  console.error(PRIVACY_NOTICE);
  const options = { profile: root, timeout: 30000 };
  connection = await prepareEdge(options, { log: console.error });
  assert.equal(connection.reused, false);
  const reused = await prepareEdge(options);
  assert.equal(reused.reused, true);
  assert.equal(reused.wsEndpoint, connection.wsEndpoint);
  const result = await doctor({ ...options, command: 'doctor' });
  console.log(JSON.stringify(result, null, 2));
  assert.equal(result.ok, true);
  assert.equal(result.checks.find(check => check.name === 'MCP → Edge')?.status, 'pass');
  const bridged = await probeMcp({ executable: process.execPath,
    args: [fileURLToPath(new URL('../bin/edge-connect-mcp.js', import.meta.url)), '--profile', root],
  }, { connectBrowser: true, timeout: 30000 });
  assert.equal(bridged.browserConnected, true);
  console.log('Full CLI stdio → official MCP → real Edge list_pages passed.');
  const attached = await probeMcp({ executable: process.execPath,
    args: [fileURLToPath(new URL('../bin/edge-connect-mcp.js', import.meta.url)), '--user-data-dir', root],
  }, { connectBrowser: true, timeout: 30000 });
  assert.equal(attached.browserConnected, true);
  console.log('Full attach-only CLI → official autoConnect → real test Edge list_pages passed (test profile, not daily authorization UI).');
} finally {
  // Even a failed launch may have created a browser; validate this exact test profile's metadata.
  if (!connection) {
    const port = await activePort(root);
    if (port) connection = await verifyCdp(port.url, { socketPath: port.socketPath }).catch(() => undefined);
  }
  if (connection) {
    await new Promise(resolve => {
        const socket = new WebSocket(connection.wsEndpoint);
        const timer = setTimeout(() => { socket.close(); resolve(); }, 5000);
        socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Browser.close' })));
        socket.addEventListener('close', () => { clearTimeout(timer); closed = true; resolve(); });
        socket.addEventListener('error', () => { clearTimeout(timer); resolve(); });
    });
  }
  // A socket close event can race process exit, or the test browser may already
  // have exited. Verify the exact generated root instead of treating an absent
  // WebSocket close event as evidence that the browser is still running.
  closed = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const snapshot = await edgeProcesses();
    if (!snapshot.warning && matchingProcesses(snapshot.processes, { root }).length === 0) { closed = true; break; }
    await delay(500);
  }
  if (closed) {
    await delay(1500);
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('edge-connect-mcp-desktop-')) throw new Error('Refusing cleanup outside the generated desktop test directory.');
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    console.log('Only the generated test browser was closed; its temporary profile was removed.');
  } else throw new Error(`Test browser closure could not be verified; retained temporary profile: ${root}`);
}
