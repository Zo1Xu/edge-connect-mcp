import { access, readFile, stat, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export async function exists(file) { try { await access(file); return true; } catch { return false; } }

export function locations(platform = process.platform, env = process.env, home = os.homedir()) {
  const p = platform === 'win32' ? path.win32 : path.posix;
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || p.join(home, 'AppData', 'Local');
    return {
      daily: p.join(local, 'Microsoft', 'Edge', 'User Data'),
      isolated: p.join(local, 'edge-connect-mcp', 'User Data'),
      executables: [env['PROGRAMFILES(X86)'], env.PROGRAMFILES, local].filter(Boolean)
        .map(root => p.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    };
  }
  if (platform === 'darwin') return {
    daily: p.join(home, 'Library', 'Application Support', 'Microsoft Edge'),
    isolated: p.join(home, 'Library', 'Application Support', 'edge-connect-mcp', 'User Data'),
    executables: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      p.join(home, 'Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge')],
  };
  if (platform === 'linux') return {
    daily: p.join(env.XDG_CONFIG_HOME || p.join(home, '.config'), 'microsoft-edge'),
    isolated: p.join(env.XDG_DATA_HOME || p.join(home, '.local/share'), 'edge-connect-mcp', 'User Data'),
    executables: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable', '/opt/microsoft/msedge/msedge'],
  };
  throw new Error(`Unsupported platform: ${platform}. Run on the same desktop OS as Edge.`);
}

export async function findEdge(explicit, env = process.env) {
  const specified = explicit || env.EDGE_PATH;
  const candidates = specified ? [path.resolve(specified)] : locations().executables;
  if (!specified) for (const root of (env.PATH || '').split(path.delimiter).filter(Boolean)) {
    candidates.push(path.join(root, process.platform === 'win32' ? 'msedge.exe' : 'microsoft-edge'));
  }
  for (const file of candidates) {
    try {
      if (!(await stat(file)).isFile()) continue;
      await access(file, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      return file;
    } catch { /* try next installation */ }
  }
  throw new Error('Microsoft Edge executable not found. Install Edge Stable or set --edge-path / EDGE_PATH.');
}

export async function selectProfile(options) {
  const defaults = locations();
  let root = options.userDataDir ? path.resolve(options.userDataDir) : options.profile ? path.resolve(options.profile) : options.isolated ? defaults.isolated : defaults.daily;
  let directory = options.profileDirectory;
  if (options.profile && await exists(path.join(root, 'Preferences'))) {
    if (!await exists(path.join(path.dirname(root), 'Local State'))) {
      throw new Error('Profile subfolder found without a parent Local State file. Supply the Edge user data directory.');
    }
    if (directory && directory !== path.basename(root)) throw new Error('Conflicting profile subfolder and --profile-directory.');
    directory = path.basename(root);
    root = path.dirname(root);
  }
  if (await exists(root) && !(await stat(root)).isDirectory()) throw new Error('Profile path is not a directory.');
  const dailyRoot = await isDailyRoot(root);
  return { root, directory, mode: options.userDataDir || dailyRoot ? 'daily' : options.profile ? 'custom' : options.isolated ? 'isolated' : 'daily' };
}

// Explicit --profile and filesystem aliases must not turn a standard Edge root
// into a launchable agent directory. --user-data-dir is always attach-only.
export async function isDailyRoot(root, daily = locations().daily) {
  const roots = [daily];
  if (process.platform === 'win32') roots.push(...['Edge Beta', 'Edge Dev', 'Edge SxS'].map(name => path.join(path.dirname(path.dirname(daily)), name, 'User Data')));
  else roots.push(...[' Beta', ' Dev', ' Canary'].map(suffix => process.platform === 'darwin' ? `${daily}${suffix}` : `${daily}-${suffix.trim().toLowerCase()}`));
  const resolved = await realpath(root).catch(() => path.resolve(root));
  for (const candidate of roots) {
    if (samePath(resolved, await realpath(candidate).catch(() => path.resolve(candidate)))) return true;
  }
  return false;
}

// Parse only known switches, without executing or interpreting the command line.
export function flag(command, name) {
  const match = command.match(new RegExp(`(?:^|\\s)(?:"--${name}=([^"\\r\\n]*)"|--${name}(?:=|\\s+)(?:"([^"\\r\\n]*)"|'([^'\\r\\n]*)'|([^\\s]+)))`));
  return match ? match.slice(1).find(value => value !== undefined) : undefined;
}

export async function edgeProcesses() {
  try {
    if (process.platform === 'win32') {
      const script = `Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`;
      const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const { stdout } = await exec(shell, ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
      const parsed = stdout.trim() ? JSON.parse(stdout) : [];
      return { processes: (Array.isArray(parsed) ? parsed : [parsed])
        .filter(item => item.CommandLine && !/(?:^|\s)--type[=\s]/.test(item.CommandLine))
        .map(item => ({ pid: item.ProcessId, command: item.CommandLine })) };
    }
    const { stdout } = await exec('ps', ['-axww', '-o', 'pid=,command='], { timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
    const processes = stdout.split('\n').flatMap(line => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      if (!match || !/(?:\/|^)(?:msedge|microsoft-edge(?:-stable)?|Microsoft Edge)(?:\s|$)/.test(match[2]) || /(?:^|\s)--type[=\s]/.test(match[2])) return [];
      return [{ pid: Number(match[1]), command: match[2] }];
    });
    if (process.platform === 'linux') {
      // ps cannot retain argv boundaries (notably user-data-dir paths containing spaces).
      await Promise.all(processes.map(async item => {
        try { item.argv = (await readFile(`/proc/${item.pid}/cmdline`, 'utf8')).split('\0').filter(Boolean); }
        catch { /* process may have exited, use best-effort ps fallback */ }
      }));
    }
    return { processes };
  } catch (error) {
    return { processes: [], warning: `Cannot inspect Edge processes (${error.code || 'permission denied'}). Fixed-port discovery may be unavailable.` };
  }
}

export function samePath(a, b, platform = process.platform) {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const normalize = value => { const result = p.resolve(value); return platform === 'win32' ? result.toLowerCase() : result; };
  return normalize(a) === normalize(b);
}

export function matchingProcesses(processes, profile, daily = locations().daily, platform = process.platform) {
  return processes.filter(item => {
    // macOS ps prints unquoted argv, including spaces in Application Support. Match the
    // complete known directory followed by a switch/end instead of guessing a path prefix.
    if (!item.argv && platform !== 'win32' && /(?:^|\s)--user-data-dir(?:=|\s+)(?!["'])/.test(item.command)) {
      const escaped = profile.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:^|\\s)--user-data-dir(?:=|\\s+)${escaped}(?=\\s+--|$)`).test(item.command);
    }
    const specified = processFlag(item, 'user-data-dir');
    return samePath(specified || daily, profile.root, platform);
  });
}

export function processFlag(item, name) {
  if (!item.argv) return flag(item.command, name);
  const prefix = `--${name}=`;
  const index = item.argv.findIndex(arg => arg === `--${name}` || arg.startsWith(prefix));
  if (index < 0) return undefined;
  return item.argv[index].startsWith(prefix) ? item.argv[index].slice(prefix.length) : item.argv[index + 1];
}

export async function activePort(root) {
  return (await readActivePort(root)).candidate;
}

export async function readActivePort(root) {
  try {
    const file = path.join(root, 'DevToolsActivePort');
    const metadata = await stat(file);
    if (metadata.size > 4096) return { state: 'invalid_file' };
    const lines = (await readFile(file, 'utf8')).trim().split(/\r?\n/);
    const [number, socketPath] = lines;
    if (lines.length !== 2 || !/^\d+$/.test(number) || +number < 1 || +number > 65535 || !/^\/devtools\/browser(?:\/[\w-]+)?$/.test(socketPath)) return { state: 'invalid_file' };
    return { state: 'present', modifiedAt: metadata.mtime.toISOString(), candidate: { url: `http://127.0.0.1:${number}`, socketPath } };
  } catch (error) { return { state: error.code === 'ENOENT' ? 'missing_file' : 'unreadable_file' }; }
}
