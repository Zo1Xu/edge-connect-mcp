import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { parseOptions, supportedNode } from '../src/options.js';
import { locations, flag, processFlag, matchingProcesses, activePort, selectProfile, samePath } from '../src/platform.js';
import { localUrl, verifyCdp, portAvailable } from '../src/cdp.js';
import { launchArgs, prepareEdge, findConnection } from '../src/edge.js';

async function temp(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'edge-connect-mcp-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function endpoint(t, transform = value => value, status = 200) {
  const server = http.createServer((request, response) => {
    assert.equal(request.url, '/json/version');
    response.writeHead(status, { 'Content-Type': 'application/json', Location: 'http://example.invalid/' });
    const value = transform({ Browser: 'Edg/140.0.0.0', 'Protocol-Version': '1.3',
      webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/devtools/browser/test-123` });
    response.end(typeof value === 'string' ? value : JSON.stringify(value));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('CLI defaults and explicit selections', () => {
  assert.deepEqual(parseOptions([]), { command: 'serve', timeout: 20000 });
  assert.equal(parseOptions(['--isolated']).isolated, true);
  assert.equal(parseOptions(['--profile', 'folder with spaces']).profile, 'folder with spaces');
  assert.equal(parseOptions(['doctor', '--launch', '--json', '--port=43123']).port, 43123);
  assert.equal(parseOptions(['--browserUrl=http://localhost:43210']).browserUrl, 'http://localhost:43210');
});
for (const args of [
  ['--isolated', '--profile', 'x'], ['--browser-url', 'http://localhost:43210', '--isolated'],
  ['--browser-url', 'http://localhost:43210', '--port', '43210'], ['--port', '0'], ['--port', '65536'],
  ['--port', '2.5'], ['--port', 'Infinity'], ['--profile'], ['--wat'], ['--json'], ['--launch'],
  ['--profile-directory', '..'], ['--profile-directory', 'a/b'], ['--timeout', '1'], ['--isolated=false'],
]) test(`reject invalid arguments ${args.join(' ')}`, () => assert.throws(() => parseOptions(args)));

test('Node support follows official dependency engine', () => {
  for (const version of ['20.19.0', '22.12.0', '24.0.0']) assert.equal(supportedNode(version), true);
  for (const version of ['18.20.0', '20.18.0', '21.0.0', '22.11.0']) assert.equal(supportedNode(version), false);
});

test('OS paths derive from environment and have separate persistent isolated roots', () => {
  const win = locations('win32', { LOCALAPPDATA: 'Z:\\People\\Alice\\Local', PROGRAMFILES: 'Z:\\Apps' }, 'Z:\\People\\Alice');
  assert.equal(win.daily, 'Z:\\People\\Alice\\Local\\Microsoft\\Edge\\User Data');
  assert.notEqual(win.isolated, win.daily);
  assert.ok(win.executables.includes('Z:\\Apps\\Microsoft\\Edge\\Application\\msedge.exe'));
  assert.equal(locations('linux', { XDG_CONFIG_HOME: '/config', XDG_DATA_HOME: '/data' }, '/home/alice').daily, '/config/microsoft-edge');
  assert.equal(locations('darwin', {}, '/Users/alice').daily, '/Users/alice/Library/Application Support/Microsoft Edge');
  assert.throws(() => locations('freebsd'));
});

test('switch parsing handles Windows and Unix quoted paths', () => {
  for (const command of ['edge --user-data-dir="C:\\Some Folder\\Data"', 'edge "--user-data-dir=C:\\Some Folder\\Data"', "edge --user-data-dir 'C:\\Some Folder\\Data'"]) {
    assert.equal(flag(command, 'user-data-dir'), 'C:\\Some Folder\\Data');
  }
  assert.equal(flag('edge --remote-debugging-port=43123', 'remote-debugging-port'), '43123');
  assert.equal(flag('edge --type=renderer', 'remote-debugging-port'), undefined);
  assert.equal(samePath('C:\\Users\\Alice', 'c:\\users\\alice', 'win32'), true);
});

test('daily discovery does not accidentally select another user data directory', () => {
  const daily = path.resolve('daily');
  const other = path.resolve('other');
  const processes = [{ command: 'edge --remote-debugging-port=43123', pid: 1 },
    { command: `edge --user-data-dir="${other}" --remote-debugging-port=43210`, pid: 2 }];
  assert.deepEqual(matchingProcesses(processes, { root: daily }, daily).map(p => p.pid), [1]);
  assert.deepEqual(matchingProcesses(processes, { root: other }, daily).map(p => p.pid), [2]);
});

test('Linux argv preserves unquoted spaces and avoids custom-profile mixups', () => {
  const root = path.resolve('home', 'Alice Smith', 'Edge Data');
  const item = { pid: 1, command: `edge --user-data-dir=${root} --remote-debugging-port=43123`,
    argv: ['edge', `--user-data-dir=${root}`, '--remote-debugging-port', '43123'] };
  assert.equal(processFlag(item, 'user-data-dir'), root);
  assert.equal(processFlag(item, 'remote-debugging-port'), '43123');
  assert.equal(matchingProcesses([item], { root }, '/other').length, 1);
  assert.equal(matchingProcesses([item], { root: '/other' }, '/other').length, 0);
});

test('macOS ps fallback preserves a complete known path with spaces', () => {
  const root = '/Users/alice/Library/Application Support/Microsoft Edge';
  const item = { pid: 1, command: `edge --user-data-dir=${root} --remote-debugging-port=43123` };
  assert.equal(matchingProcesses([item], { root }, '/other', 'darwin').length, 1);
  assert.equal(matchingProcesses([item], { root: '/Users/alice/Library/Application' }, '/other', 'darwin').length, 0);
});

test('existing profile subfolder maps to its user data root', async t => {
  const root = await temp(t);
  await mkdir(path.join(root, 'Profile 2'));
  await writeFile(path.join(root, 'Local State'), '{}');
  await writeFile(path.join(root, 'Profile 2', 'Preferences'), '{}');
  const selected = await selectProfile({ profile: path.join(root, 'Profile 2') });
  assert.equal(selected.root, root);
  assert.equal(selected.directory, 'Profile 2');
  await assert.rejects(selectProfile({ profile: path.join(root, 'Profile 2'), profileDirectory: 'Default' }), /Conflicting/);
});

test('DevToolsActivePort parsing rejects stale malformed metadata', async t => {
  const root = await temp(t);
  assert.equal(await activePort(root), undefined);
  for (const data of ['0\n/devtools/browser/id', '65536\n/devtools/browser/id', '43123\nhttps://remote.invalid/', '43123\n/devtools/page/id']) {
    await writeFile(path.join(root, 'DevToolsActivePort'), data);
    assert.equal(await activePort(root), undefined);
  }
  await writeFile(path.join(root, 'DevToolsActivePort'), '43123\r\n/devtools/browser/test-1\r\n');
  assert.deepEqual(await activePort(root), { url: 'http://127.0.0.1:43123', socketPath: '/devtools/browser/test-1' });
});

for (const url of ['http://0.0.0.0:43123', 'http://192.168.1.2:43123', 'http://example.com', 'https://localhost:43123', 'http://user:password@localhost', 'http://localhost/foo', 'http://localhost/?x=1', 'http://localhost/#x']) {
  test(`reject unsafe endpoint ${url}`, () => assert.throws(() => localUrl(url)));
}
test('localhost is pinned to numeric loopback and IPv6 loopback is accepted', () => {
  assert.equal(localUrl('http://localhost:43123').hostname, '127.0.0.1');
  assert.equal(localUrl('http://[::1]:43123').hostname, '[::1]');
});

test('verifies genuine Edge JSON metadata and port occupancy', async t => {
  const url = await endpoint(t);
  const result = await verifyCdp(url);
  assert.equal(result.browser, 'Edg/140.0.0.0');
  assert.equal(await portAvailable(Number(new URL(url).port)), false);
  await assert.rejects(verifyCdp(url, { socketPath: '/devtools/browser/stale' }), /Stale/);
});
test('accepts Edge token in User-Agent when Browser says Chrome', async t => {
  const url = await endpoint(t, data => ({ ...data, Browser: 'Chrome/140.0', 'User-Agent': 'Mozilla/5.0 Chrome/140.0 Edg/140.0' }));
  assert.ok((await verifyCdp(url)).wsEndpoint);
});
for (const [name, transform, pattern] of [
  ['Chrome', data => ({ ...data, Browser: 'Chrome/140.0' }), /not Microsoft Edge/],
  ['non JSON', () => '<html>Error</html>', /did not return JSON/],
  ['null JSON', () => 'null', /not Microsoft Edge/],
  ['missing protocol', data => ({ ...data, 'Protocol-Version': undefined }), /protocol version/],
  ['remote socket', data => ({ ...data, webSocketDebuggerUrl: 'ws://example.com/devtools/browser/id' }), /loopback/],
  ['wrong socket port', data => ({ ...data, webSocketDebuggerUrl: 'ws://127.0.0.1:1/devtools/browser/id' }), /does not match/],
  ['page socket', data => ({ ...data, webSocketDebuggerUrl: 'ws://127.0.0.1:1/devtools/page/id' }), /browser WebSocket/],
  ['oversized response', () => 'x'.repeat(70000), /exceeds/],
]) test(`rejects CDP ${name}`, async t => assert.rejects(verifyCdp(await endpoint(t, transform)), pattern));

test('HTTP redirects are never followed', async t => {
  const url = await endpoint(t, value => value, 302);
  await assert.rejects(verifyCdp(url), /redirects are not followed/);
});
test('HTTP timeout and cancellation', async t => {
  const server = http.createServer(() => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  await assert.rejects(verifyCdp(url, { timeout: 50 }), /timed out/);
  await assert.rejects(verifyCdp(url, { signal: AbortSignal.abort() }), /aborted/);
});
test('launch uses ephemeral loopback CDP and chosen profile without shell arguments', () => {
  const args = launchArgs({ root: '/some path/user data', directory: 'Profile 2' });
  assert.ok(args.includes('--remote-debugging-address=127.0.0.1'));
  assert.ok(args.includes('--remote-debugging-port=0'));
  assert.ok(args.includes('--user-data-dir=/some path/user data'));
  assert.ok(args.includes('--profile-directory=Profile 2'));
  assert.ok(!args.some(arg => arg.includes('no-sandbox') || arg.includes('allow-origins')));
});
test('reuse verified endpoint without requiring an executable or launching', async t => {
  const url = await endpoint(t);
  const result = await prepareEdge({ browserUrl: url, edgePath: '/missing', timeout: 100 });
  assert.equal(result.reused, true);
});
test('running non-debuggable Edge is never killed or silently isolated', async () => {
  await assert.rejects(prepareEdge({ timeout: 100 }, { inspection: {
    warnings: [], candidates: [], profile: { root: '/daily', mode: 'daily' }, processes: [{ pid: 1 }],
  } }), /will never kill Edge/);
});
test('failed discovery candidates do not mask a subsequent valid endpoint', async t => {
  const url = await endpoint(t);
  const result = await findConnection({ candidates: [{ url: 'http://remote.invalid' }, { url }] });
  assert.equal(result.errors.length, 1);
  assert.equal(result.connection.url, url);
});

test('occupied explicit port does not attach an unrelated Edge profile', async t => {
  const root = await temp(t);
  const url = await endpoint(t);
  await assert.rejects(prepareEdge({ port: Number(new URL(url).port), edgePath: process.execPath, timeout: 100 }, {
    inspection: { warnings: [], candidates: [], processes: [], profile: { root, mode: 'custom' } },
  }), /occupied/);
});

test('startup failure is bounded and produces recovery guidance', async t => {
  const root = await temp(t);
  await assert.rejects(prepareEdge({ edgePath: process.execPath, timeout: 100 }, {
    inspection: { warnings: [], candidates: [], processes: [], profile: { root, mode: 'custom' } },
  }), /did not expose a verified CDP endpoint|failed to start/);
});

test('absent everyday profile is not silently created', async t => {
  const root = path.join(await temp(t), 'missing');
  await assert.rejects(prepareEdge({ timeout: 100 }, {
    inspection: { warnings: [], candidates: [], processes: [], profile: { root, mode: 'daily' } },
  }), /Everyday Edge user data directory not found/);
});
