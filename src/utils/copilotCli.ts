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

export function findCopilotCLIPath(): string | null {
  const home = os.homedir();
  const isWindows = process.platform === 'win32';
  const binaryName = isWindows ? 'copilot.exe' : 'copilot';

  // 1. 하드코딩 후보 경로
  const candidates: string[] = isWindows
    ? [
        path.join(home, 'AppData', 'Roaming', 'npm', binaryName),
        path.join(getEnvValue('ProgramFiles') ?? 'C:\\Program Files', 'nodejs', binaryName),
        path.join(home, '.volta', 'bin', binaryName),
        path.join(home, '.local', 'bin', binaryName),
      ]
    : [
        '/usr/local/bin/copilot',
        '/opt/homebrew/bin/copilot',
        path.join(home, '.local', 'bin', 'copilot'),
        path.join(home, '.volta', 'bin', 'copilot'),
        path.join(home, '.asdf', 'shims', 'copilot'),
        path.join(home, '.asdf', 'bin', 'copilot'),
        path.join(home, '.npm-global', 'bin', 'copilot'),
        path.join(home, 'bin', 'copilot'),
      ];

  for (const p of candidates) {
    if (isExistingFile(p)) return p;
  }

  // 2. npm global prefix (env var 기반, execSync 없음)
  const npmPrefix = getNpmGlobalPrefix();
  if (npmPrefix) {
    const binDir = isWindows ? npmPrefix : path.join(npmPrefix, 'bin');
    const p = path.join(binDir, binaryName);
    if (isExistingFile(p)) return p;
  }

  // 3. PATH 탐색 (따옴표 제거 + ~ 확장 + 플레이스홀더 필터 + 중복 제거)
  for (const dir of dedupePaths(parsePathEntries(getEnvValue('PATH')))) {
    const p = path.join(dir, binaryName);
    if (isExistingFile(p)) return p;
  }

  return null;
}
