import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { inspectDaily, probeListener, connectionState, dailyMessage } from '../src/daily.js';
import { selectProfile, locations, readActivePort, isDailyRoot } from '../src/platform.js';
import { inspectEdge, prepareEdge, launchArgs } from '../src/edge.js';
import { parseOptions } from '../src/options.js';
import { doctor } from '../src/doctor.js';
import { upstreamCommand, probeMcp } from '../src/upstream.js';

async function temp(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'edge-connect-daily-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
const policyReader = async () => ({ state: 'not_configured' });
const owner = async () => 'edge';
function inspection(root, daily) {
  return { profile: { root, mode: 'daily' }, processes: [{ pid: 123 }], candidates: [], warnings: [], daily };
}
// A diagnostic peer, not a replacement CDP implementation. Production always
// delegates browser authorization and WebSocket to the pinned official server.
function peer(mode) {
  return { executable: process.execPath, args: ['-e', `
    const readline = require('node:readline');
    readline.createInterface({input: process.stdin}).on('line', line => {
      const request = JSON.parse(line);
      if (!request.id) return;
      let result;
      if (request.method === 'initialize') result = {protocolVersion: '2024-11-05', serverInfo: {name: 'fixture', version: '1'}};
      else if (request.method === 'tools/list') result = {tools: [{name: 'list_pages'}]};
      else {
        if (${JSON.stringify(mode)} === 'wait') return;
        result = ${JSON.stringify(mode)} === 'success' ? {content: [{type: 'text', text: 'private page content'}]} : {isError: true, content: [{type: 'text', text: ${JSON.stringify(mode)}}]};
      }
      process.stdout.write(JSON.stringify({jsonrpc: '2.0', id: request.id, result}) + '\\n');
    });
  `] };
}

test('daily without authorization gives actionable instructions and never launches', async t => {
  const root = await temp(t);
  const daily = await inspectDaily({ root }, [], { policyReader });
  assert.equal(daily.state, 'authorization_required');
  assert.equal(daily.endpointFile, 'missing_file');
  await assert.rejects(prepareEdge({ timeout: 100, launch: true, edgePath: '/does-not-exist' }, { inspection: inspection(root, daily) }), error => {
    assert.equal(error.state, 'authorization_required');
    assert.match(error.message, /Open: edge:\/\/inspect\/#remote-debugging/);
    assert.match(error.message, /Enable: Allow remote debugging for this browser instance/);
    assert.doesNotMatch(error.message, /ECONNREFUSED|restart|fully exit/i);
    return true;
  });
  assert.throws(() => launchArgs({ root, mode: 'daily' }), /attach-only/);
});

test('actual default root and aliases selected through --profile stay attach-only', async () => {
  assert.equal((await selectProfile({ profile: locations().daily })).mode, 'daily');
  assert.equal(await isDailyRoot(path.join(locations().daily, '.', 'Default', '..')), true);
  assert.equal((await selectProfile({ userDataDir: path.resolve('custom existing daily') })).mode, 'daily');
});

test('isolated still selects the same persistent root and launch switches', async () => {
  const selected = await selectProfile({ isolated: true });
  assert.equal(selected.mode, 'isolated');
  assert.equal(selected.root, locations().isolated);
  assert.deepEqual(launchArgs(selected), ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${locations().isolated}`]);
});

test('stale DevToolsActivePort with no listener is not a health proof or primary socket error', async t => {
  const root = await temp(t);
  await writeFile(path.join(root, 'DevToolsActivePort'), '52194\n/devtools/browser/old');
  const daily = await inspectDaily({ root }, [], { policyReader, listener: async () => 'no_listener' });
  assert.equal(daily.state, 'no_listener');
  assert.equal(daily.endpointFile, 'stale_file');
  assert.doesNotMatch(dailyMessage(daily.state), /52194|ECONNREFUSED/);
});

test('real TCP probe distinguishes closed and listening ports without HTTP discovery', async t => {
  let requests = 0;
  const server = http.createServer((_, response) => { requests++; response.writeHead(404).end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());
  assert.equal(await probeListener(url), 'listening');
  await new Promise(resolve => server.close(resolve));
  assert.equal(await probeListener(url), 'no_listener');
  assert.equal(requests, 0);
});

test('live daily candidate bypasses /json/version and hands root to official autoConnect', async t => {
  const root = await temp(t);
  let requests = 0;
  const server = http.createServer((_, response) => { requests++; response.writeHead(404).end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  await writeFile(path.join(root, 'DevToolsActivePort'), `${server.address().port}\n/devtools/browser`);
  const daily = await inspectDaily({ root }, [{ pid: 123 }], { policyReader, owner });
  assert.equal(daily.state, 'ready_to_attach');
  const connection = await prepareEdge({ launch: true, edgePath: '/missing' }, { inspection: inspection(root, daily) });
  const command = await upstreamCommand(connection);
  assert.ok(command.args.includes('--autoConnect'));
  assert.equal(command.args[command.args.indexOf('--user-data-dir') + 1], root);
  assert.ok(!command.args.includes('--wsEndpoint'));
  assert.equal(requests, 0);
});

test('port reuse by unrelated process is rejected before official attachment', async t => {
  const root = await temp(t);
  await writeFile(path.join(root, 'DevToolsActivePort'), '54321\n/devtools/browser/old');
  const daily = await inspectDaily({ root }, [], { policyReader, listener: async () => 'listening', owner: async () => 'mismatch' });
  assert.equal(daily.state, 'endpoint_mismatch');
  assert.equal(daily.endpointFile, 'stale_file');
});

test('policy disabled prevents even endpoint probing', async () => {
  const daily = await inspectDaily({ root: '/daily' }, [], {
    policyReader: async () => ({ state: 'disabled' }),
    readPort: async () => { assert.fail('Must not read or probe an endpoint when policy forbids debugging'); },
  });
  assert.equal(daily.state, 'policy_disabled');
  assert.match(dailyMessage(daily.state), /edge:\/\/policy/);
});

test('unreadable/malformed endpoint hints do not become connection attempts', async () => {
  for (const fileState of ['invalid_file', 'unreadable_file']) {
    const daily = await inspectDaily({ root: '/daily' }, [], { policyReader, readPort: async () => ({ state: fileState }), listener: async () => assert.fail('Must not connect') });
    assert.equal(daily.state, fileState === 'unreadable_file' ? 'discovery_unavailable' : 'authorization_required');
  }
});

test('authorization WebSocket path without GUID is a valid hint; unsafe paths are rejected', async t => {
  const root = await temp(t);
  await writeFile(path.join(root, 'DevToolsActivePort'), '54321\n/devtools/browser');
  assert.equal((await readActivePort(root)).state, 'present');
  for (const value of ['54321\n/devtools/browser?host=evil', '54321\n/devtools/browser/id\nextra', '54321\n//evil', 'x'.repeat(5000)]) {
    await writeFile(path.join(root, 'DevToolsActivePort'), value);
    assert.equal((await readActivePort(root)).state, 'invalid_file');
  }
});

for (const [message, expected] of [
  ['Unexpected server response: 403', 'authorization_rejected'],
  ['Connection rejected', 'authorization_rejected'],
  ['Remote debugging disabled by policy', 'policy_disabled'],
  ['connect ECONNREFUSED 127.0.0.1:52194', 'no_listener'],
  ['MCP tools/call timed out.', 'waiting_for_authorization'],
  ['Unknown protocol error', 'connection_failed'],
]) test(`classifies upstream failure as ${expected}`, async () => {
  assert.equal(connectionState(message), expected);
  if (expected === 'waiting_for_authorization') return;
  await assert.rejects(probeMcp(peer(message), { connectBrowser: true, authorization: true, timeout: 3000, authorizationTimeout: 3000 }), error => {
    assert.equal(error.state, expected);
    assert.equal(error.protocolReady, true);
    assert.doesNotMatch(error.message, /52194|ECONNREFUSED|private page content/);
    return true;
  });
});

test('authorization wait is separate from startup timeout and ends without claiming rejection', async () => {
  const states = [];
  await assert.rejects(probeMcp(peer('wait'), { connectBrowser: true, authorization: true, timeout: 3000, authorizationTimeout: 100, onState: state => states.push(state) }), { state: 'waiting_for_authorization' });
  assert.ok(states.includes('waiting_for_authorization'));
  assert.ok(!states.includes('connected'));
});

test('cancellation terminates only the diagnostic MCP child', async () => {
  const controller = new AbortController();
  await assert.rejects(probeMcp(peer('wait'), { connectBrowser: true, authorization: true, signal: controller.signal,
    onState: state => { if (state === 'waiting_for_authorization') controller.abort(); },
  }), { state: 'cancelled' });
});

test('doctor connected requires successful list_pages; no page data in report', async () => {
  const states = [];
  const result = await doctor({ timeout: 3000, launch: true }, {
    edgeFinder: async () => '/edge',
    inspect: async () => inspection('/daily', { state: 'ready_to_attach', policy: 'not_configured', endpointFile: 'present' }),
    log: text => states.push(text),
    probe: (command, options) => {
      assert.ok(command.args.includes('--autoConnect'));
      return probeMcp(peer('success'), options);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.state, 'connected');
  assert.match(states.join('\n'), /waiting_for_authorization/);
  assert.doesNotMatch(JSON.stringify(result), /private page content/);
  assert.equal(result.checks.find(check => check.name === 'MCP → Edge').status, 'pass');
});

for (const state of ['authorization_required', 'no_listener', 'policy_disabled']) test(`doctor ${state} keeps protocol readiness separate`, async () => {
  const result = await doctor({ timeout: 3000 }, {
    edgeFinder: async () => '/edge',
    inspect: async () => inspection('/daily', { state, policy: state === 'policy_disabled' ? 'disabled' : 'not_configured', endpointFile: state === 'no_listener' ? 'stale_file' : 'missing_file' }),
    probe: (_, options) => { assert.equal(options.connectBrowser, false); return probeMcp(peer('success'), options); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.equal(result.checks.find(check => check.name === 'MCP').status, 'pass');
  assert.notEqual(result.checks.find(check => check.name === 'MCP → Edge').status, 'pass');
});

test('doctor preserves authorization rejection separately from MCP protocol success', async () => {
  const result = await doctor({ timeout: 3000 }, {
    edgeFinder: async () => '/edge',
    inspect: async () => inspection('/daily', { state: 'ready_to_attach', policy: 'unknown', endpointFile: 'present' }),
    probe: (_, options) => probeMcp(peer('Unexpected server response: 403'), options),
  });
  assert.equal(result.state, 'authorization_rejected');
  assert.equal(result.ok, false);
  assert.equal(result.checks.find(check => check.name === 'MCP').status, 'pass');
});

test('listener disappearing after preflight updates stale state without leaking its old port', async () => {
  const result = await doctor({ timeout: 3000 }, {
    edgeFinder: async () => '/edge',
    inspect: async () => inspection('/daily', { state: 'ready_to_attach', policy: 'not_configured', endpointFile: 'present' }),
    probe: (_, options) => probeMcp(peer('connect ECONNREFUSED 127.0.0.1:52194'), options),
  });
  assert.equal(result.state, 'no_listener');
  assert.equal(result.discovery.endpointFile, 'stale_file');
  assert.doesNotMatch(JSON.stringify(result), /52194|ECONNREFUSED/);
});

test('explicit WS failure does not invent a stale profile file', async () => {
  const result = await doctor({ timeout: 3000 }, {
    edgeFinder: async () => '/edge',
    inspect: async () => ({ wsEndpoint: 'ws://127.0.0.1:54321/devtools/browser/id', warnings: [] }),
    probe: (_, options) => probeMcp(peer('connect ECONNREFUSED 127.0.0.1:54321'), options),
  });
  assert.equal(result.state, 'no_listener');
  assert.doesNotMatch(JSON.stringify(result), /stale|DevToolsActivePort/);
});

test('policy name alone and unknown ownership are not treated as policy-disabled or connected', async () => {
  assert.equal(connectionState('Unable to inspect RemoteDebuggingAllowed'), 'connection_failed');
  const daily = await inspectDaily({ root: '/daily' }, [], {
    policyReader: async () => ({ state: 'unknown' }),
    readPort: async () => ({ state: 'present', candidate: { url: 'http://127.0.0.1:54321' } }),
    listener: async () => 'listening', owner: async () => 'unverified',
  });
  assert.equal(daily.state, 'ownership_unverified');
  assert.equal(daily.policy, 'unknown');
});

test('real official 1.9.0 reports rejected WebSocket authorization without HTTP discovery', { timeout: 15000 }, async t => {
  const root = await temp(t);
  let httpRequests = 0, upgrades = 0;
  const server = http.createServer((_, response) => { httpRequests++; response.writeHead(404).end(); });
  server.on('upgrade', (_, socket) => { upgrades++; socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  await writeFile(path.join(root, 'DevToolsActivePort'), `${server.address().port}\n/devtools/browser/test`);
  const command = await upstreamCommand({ mode: 'daily', profile: { root } });
  await assert.rejects(probeMcp(command, { connectBrowser: true, authorization: true, timeout: 5000, authorizationTimeout: 5000 }), { state: 'authorization_rejected', protocolReady: true });
  assert.equal(upgrades, 1);
  assert.equal(httpRequests, 0);
});

test('explicit WebSocket endpoint is validated and handed off without HTTP discovery', async () => {
  const options = parseOptions(['--ws-endpoint', 'ws://localhost:54321/devtools/browser']);
  const connection = await prepareEdge(options);
  assert.equal(connection.mode, 'ws');
  assert.equal(connection.wsEndpoint, 'ws://127.0.0.1:54321/devtools/browser');
  assert.ok((await upstreamCommand(connection)).args.includes('--wsEndpoint'));
  await assert.rejects(inspectEdge({ wsEndpoint: 'ws://example.com:123/devtools/browser/id' }), /loopback/);
  await assert.rejects(inspectEdge({ wsEndpoint: 'ws://127.0.0.1:123/devtools/page/id' }), /browser WebSocket/);
});

for (const args of [
  ['--user-data-dir', 'x', '--isolated'], ['--user-data-dir', 'x', '--profile', 'y'],
  ['--ws-endpoint', 'ws://localhost/devtools/browser/id', '--browser-url', 'http://localhost'],
  ['--ws-endpoint', 'ws://localhost/devtools/browser/id', '--port', '123'],
  ['--authorization-timeout', '0'],
]) test(`reject conflicting attach arguments ${args.join(' ')}`, () => assert.throws(() => parseOptions(args)));
