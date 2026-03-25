import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function isExistingFile(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch { return false; }
}

/** process.env 케이싱 불일치 처리 (Windows: PATH / Path / path 모두 대응) */
function getEnvValue(key: string): string | undefined {
  const exact = process.env[key];
  if (exact !== undefined) return exact;
  const lower = key.toLowerCase();
  for (const k of Object.keys(process.env)) {
    if (k.toLowerCase() === lower) return process.env[k];
  }
  return undefined;
}

/** "value" → value */
function stripSurroundingQuotes(value: string): string {
  if (value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
       (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

/** $PATH, ${PATH}, %PATH% 같은 자기참조 플레이스홀더 필터 */
function isPathPlaceholder(value: string): boolean {
  return /^\$\{?PATH\}?$|^%PATH%$/i.test(value);
}

/** ~/foo → /Users/mark/foo */
function expandHomePath(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return os.homedir() + p.slice(1);
  }
  return p;
}

/** PATH 문자열 → string[] (따옴표 제거 + ~ 확장 + 플레이스홀더 필터) */
function parsePathEntries(pathValue?: string): string[] {
  if (!pathValue) return [];
  const delimiter = process.platform === 'win32' ? ';' : ':';
  return pathValue
    .split(delimiter)
    .map(e => expandHomePath(stripSurroundingQuotes(e.trim())))
    .filter(e => e.length > 0 && !isPathPlaceholder(e));
}

/** 중복 제거 (Windows는 대소문자 무시) */
function dedupePaths(entries: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const e of entries) {
    const key = process.platform === 'win32' ? e.toLowerCase() : e;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(e);
    }
  }
  return result;
}

/**
 * npm global prefix를 env var에서만 읽음 (execSync 없음).
 * npm_config_prefix → npm prefix dir
 * Windows fallback: APPDATA\npm
 */
function getNpmGlobalPrefix(): string | null {
  const prefix = getEnvValue('npm_config_prefix');
  if (prefix && prefix !== 'undefined') return prefix;

  if (process.platform === 'win32') {
    const appData = getEnvValue('APPDATA');
    if (appData) return path.join(appData, 'npm');
  }

  return null;
}

/**
 * Returns bin dirs for all installed NVM Node.js versions on Mac/Linux.
 * Obsidian is a GUI app and doesn't source .zshrc/.bashrc, so NVM_BIN is
 * typically not set. We read ~/.nvm/alias/default directly instead.
 */
function nvmCandidateDirs(home: string): string[] {
  const dirs: string[] = [];
  const nvmDir = path.join(home, '.nvm');

  // Primary: read the default alias file to find the active version
  try {
    const raw = fs.readFileSync(path.join(nvmDir, 'alias', 'default'), 'utf8').trim();
    // Could be "20.0.0", "v20.0.0", or an LTS alias like "lts/hydrogen"
    const version = raw.startsWith('v') ? raw : /^\d/.test(raw) ? `v${raw}` : null;
    if (version) {
      dirs.push(path.join(nvmDir, 'versions', 'node', version, 'bin'));
    }
  } catch { /* nvm not installed */ }

  // Fallback: scan installed versions and try up to 3 most recent
  try {
    const nvmNodeDir = path.join(nvmDir, 'versions', 'node');
    if (fs.existsSync(nvmNodeDir)) {
      const versions = (fs.readdirSync(nvmNodeDir) as string[])
        .filter((v: string) => v.startsWith('v'))
        .sort((a: string, b: string) => {
          const pa = a.slice(1).split('.').map(Number);
          const pb = b.slice(1).split('.').map(Number);
          for (let i = 0; i < 3; i++) {
            const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
            if (diff !== 0) return diff;
          }
          return 0;
        });
      for (const v of versions.slice(0, 3)) {
        dirs.push(path.join(nvmNodeDir, v, 'bin'));
      }
    }
  } catch { /* ignore */ }

  return dirs;
}

/**
 * Returns bin dirs for fnm (Fast Node Manager) on Mac/Linux.
 * Like NVM, fnm's PATH hook isn't available in GUI apps unless FNM_MULTISHELL_PATH is set.
 */
function fnmCandidateDirs(home: string): string[] {
  const dirs: string[] = [];

  // FNM_MULTISHELL_PATH is set by fnm's shell hook — may be absent in GUI apps
  const multishell = process.env.FNM_MULTISHELL_PATH;
  if (multishell) dirs.push(multishell);

  // Common fnm data dirs
  const fnmDataDirs = [
    process.env.FNM_DIR,
    path.join(home, '.local', 'share', 'fnm'),
    path.join(home, '.fnm'),
  ].filter(Boolean) as string[];

  for (const fnmDir of fnmDataDirs) {
    const nodeVersionsDir = path.join(fnmDir, 'node-versions');
    try {
      if (fs.existsSync(nodeVersionsDir)) {
        const versions = (fs.readdirSync(nodeVersionsDir) as string[])
          .sort((a: string, b: string) => {
            const pa = a.replace(/^v/, '').split('.').map(Number);
            const pb = b.replace(/^v/, '').split('.').map(Number);
            for (let i = 0; i < 3; i++) {
              const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
              if (diff !== 0) return diff;
            }
            return 0;
          });
        for (const v of versions.slice(0, 3)) {
          dirs.push(path.join(nodeVersionsDir, v, 'installation', 'bin'));
        }
      }
    } catch { /* ignore */ }
  }

  return dirs;
}

export function findCopilotCLIPath(): string | null {
  const home = os.homedir();
  const isWindows = process.platform === 'win32';
  // npm creates .cmd wrappers on Windows; .exe only from volta/scoop shims
  const binaryNames = isWindows ? ['copilot.cmd', 'copilot.exe'] : ['copilot'];

  // 1. 하드코딩 후보 경로
  const candidateDirs: string[] = isWindows
    ? [
        path.join(home, 'AppData', 'Roaming', 'npm'),
        // nvm-windows: NVM_SYMLINK is a system env var pointing to active Node dir
        getEnvValue('NVM_SYMLINK') ?? '',
        // nvm-windows: NVM_HOME stores all versions; active is via NVM_SYMLINK
        getEnvValue('NVM_HOME') ?? '',
        // LocalAppData nodejs locations (some installers / nvm-windows symlinks)
        path.join(home, 'AppData', 'Local', 'Programs', 'nodejs'),
        path.join(home, 'AppData', 'Local', 'Programs', 'node'),
        // scoop shims
        path.join(home, 'scoop', 'shims'),
        path.join(getEnvValue('ProgramFiles') ?? 'C:\\Program Files', 'nodejs'),
        path.join(home, '.volta', 'bin'),
        path.join(home, '.local', 'bin'),
      ].filter(Boolean)
    : [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        path.join(home, '.local', 'bin'),
        path.join(home, '.volta', 'bin'),
        path.join(home, '.asdf', 'shims'),
        path.join(home, '.asdf', 'bin'),
        path.join(home, '.npm-global', 'bin'),
        path.join(home, 'bin'),
        ...nvmCandidateDirs(home),
        ...fnmCandidateDirs(home),
      ];

  for (const dir of candidateDirs) {
    for (const name of binaryNames) {
      const p = path.join(dir, name);
      if (isExistingFile(p)) return p;
    }
  }

  // 2. npm global prefix (env var 기반, execSync 없음)
  const npmPrefix = getNpmGlobalPrefix();
  if (npmPrefix) {
    const binDir = isWindows ? npmPrefix : path.join(npmPrefix, 'bin');
    for (const name of binaryNames) {
      const p = path.join(binDir, name);
      if (isExistingFile(p)) return p;
    }
  }

  // 3. PATH 탐색 (따옴표 제거 + ~ 확장 + 플레이스홀더 필터 + 중복 제거)
  for (const dir of dedupePaths(parsePathEntries(getEnvValue('PATH')))) {
    for (const name of binaryNames) {
      const p = path.join(dir, name);
      if (isExistingFile(p)) return p;
    }
  }

  return null;
}
