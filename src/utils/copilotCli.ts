import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function isExistingFile(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch { return false; }
}

export function findCopilotCLIPath(): string | null {
  const home = os.homedir();
  const isWindows = process.platform === 'win32';
  const binaryName = isWindows ? 'copilot.exe' : 'copilot';

  const candidates = [
    '/usr/local/bin/copilot',
    '/opt/homebrew/bin/copilot',
    path.join(home, '.local', 'bin', 'copilot'),
    path.join(home, '.volta', 'bin', 'copilot'),
    path.join(home, '.npm-global', 'bin', 'copilot'),
    path.join(home, 'bin', 'copilot'),
  ];

  for (const p of candidates) {
    if (isExistingFile(p)) return p;
  }

  // PATH search
  const pathEnv = process.env.PATH ?? '';
  const delimiter = isWindows ? ';' : ':';
  for (const dir of pathEnv.split(delimiter)) {
    const p = path.join(dir.trim(), binaryName);
    if (isExistingFile(p)) return p;
  }

  return null;
}
