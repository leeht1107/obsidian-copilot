/**
 * AutoSetupService — detects missing GitHub Copilot CLI and handles auto-install.
 *
 * Runs entirely in-process (no shell sources), so it works in GUI environments
 * (Obsidian, Electron) where .zshrc / .bashrc are never sourced.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { findCopilotCLIPath } from '../../utils/copilotCli';
import { getEnhancedPath } from '../../utils/env';

const isWindows = process.platform === 'win32';

/** Prevent showing the wizard more than once per Obsidian session. */
let shownThisSession = false;

export function markShownThisSession(): void {
  shownThisSession = true;
}

export function hasShownThisSession(): boolean {
  return shownThisSession;
}

/**
 * Find the npm binary using the same enhanced PATH that getEnhancedPath() builds.
 * This covers Homebrew, NVM, fnm, Volta, nvm-windows, Scoop, etc.
 */
export function findNpmPath(): string | null {
  const npmNames = isWindows ? ['npm.cmd'] : ['npm'];

  // getEnhancedPath() already includes all common Node.js bin dirs
  const dirs = getEnhancedPath().split(isWindows ? ';' : ':');

  for (const dir of dirs) {
    if (!dir) continue;
    for (const name of npmNames) {
      try {
        const p = path.join(dir, name);
        if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
      } catch { /* inaccessible dir */ }
    }
  }

  return null;
}

export interface SetupStatus {
  /** True if the copilot CLI binary is found and usable. */
  cliFound: boolean;
  /** True if npm is available for auto-install. */
  npmFound: boolean;
}

export function checkSetupStatus(): SetupStatus {
  return {
    cliFound: findCopilotCLIPath() !== null,
    npmFound: findNpmPath() !== null,
  };
}

export interface InstallResult {
  success: boolean;
  /** Path to the CLI binary if installation succeeded. */
  cliPath?: string;
  /** Human-readable error if installation failed. */
  error?: string;
}

/**
 * Run `npm install -g @github/copilot` in the background.
 * Calls onProgress with stdout lines so the UI can show live output.
 */
export async function installCopilotCLI(
  onProgress: (msg: string) => void
): Promise<InstallResult> {
  const npmPath = findNpmPath();
  if (!npmPath) {
    return { success: false, error: 'npm을 찾을 수 없습니다' };
  }

  return new Promise<InstallResult>((resolve) => {
    const proc = spawn(npmPath, ['install', '-g', '@github/copilot'], {
      env: { ...process.env, PATH: getEnhancedPath() },
      // shell:true needed on Windows for .cmd shim execution
      shell: isWindows,
    });

    proc.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) onProgress(line);
    });

    const stderrLines: string[] = [];
    proc.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) stderrLines.push(line);
    });

    proc.on('close', (code: number | null) => {
      if (code === 0) {
        resolve({ success: true, cliPath: findCopilotCLIPath() ?? undefined });
      } else {
        resolve({
          success: false,
          error: stderrLines.join('\n') || `npm exited with code ${code ?? '?'}`,
        });
      }
    });

    proc.on('error', (err: Error) => {
      resolve({ success: false, error: err.message });
    });
  });
}
