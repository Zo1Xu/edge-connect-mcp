import http from 'node:http';
import net from 'node:net';

export function localUrl(input, websocket = false) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Invalid CDP URL.'); }
  const hosts = ['127.0.0.1', 'localhost', '[::1]'];
  if (!hosts.includes(url.hostname) || url.protocol !== (websocket ? 'ws:' : 'http:') || url.username || url.password || url.search || url.hash) {
    throw new Error('CDP must use a plain loopback URL (127.0.0.1, localhost or [::1]), without credentials, query or fragment.');
  }
  if (!websocket && url.pathname !== '/') throw new Error('CDP browser URL must not contain a path.');
  if (websocket && !/^\/devtools\/browser\/[\w-]+$/.test(url.pathname)) throw new Error('Invalid browser WebSocket path.');
  // Do not trust hosts-file/DNS mappings of localhost.
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url;
}

export async function verifyCdp(input, { timeout = 1500, socketPath, signal } = {}) {
  const base = localUrl(input);
  const body = await new Promise((resolve, reject) => {
    const request = http.get(new URL('/json/version', base), { signal, agent: false }, response => {
      if (response.statusCode !== 200) {
        response.resume(); reject(new Error(`/json/version returned HTTP ${response.statusCode}; redirects are not followed.`)); return;
      }
      let data = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        data += chunk;
        if (data.length > 65536) request.destroy(new Error('CDP response exceeds 64 KiB.'));
      });
      response.on('end', () => resolve(data));
      response.on('error', reject);
    });
    const timer = setTimeout(() => request.destroy(new Error('CDP /json/version timed out.')), timeout);
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
  });
  let version;
  try { version = JSON.parse(body); } catch { throw new Error('/json/version did not return JSON.'); }
  if (!version || typeof version !== 'object' || !/(?:^|\s)(?:Edg|Edge|HeadlessEdg)\/[\d.]+/.test(`${version.Browser || ''} ${version['User-Agent'] || ''}`)) {
    throw new Error('CDP endpoint is not Microsoft Edge (no Edge version token in Browser/User-Agent).');
  }
  if (!version['Protocol-Version']) throw new Error('CDP protocol version is missing.');
  const ws = localUrl(version.webSocketDebuggerUrl, true);
  if (ws.hostname !== base.hostname || (ws.port || '80') !== (base.port || '80')) throw new Error('CDP WebSocket endpoint does not match the verified HTTP endpoint.');
  if (socketPath && ws.pathname !== socketPath) throw new Error('Stale DevToolsActivePort file: browser identity changed.');
  return { url: base.origin, wsEndpoint: ws.href, browser: version.Browser, protocol: version['Protocol-Version'] };
}

export function portAvailable(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}
