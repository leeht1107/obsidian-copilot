/**
 * SetupWizardModal — first-run setup wizard for students installing via BRAT.
 *
 * Auto-opens when GitHub Copilot CLI is not found.
 * Guides through: auto-install → copilot login → done.
 * Falls back to manual instructions when Node.js / npm is absent.
 */

import { Modal, Notice, type App } from 'obsidian';

import type ObsidianCopilotPlugin from '../../main';
import {
  checkSetupStatus,
  installCopilotCLI,
  markShownThisSession,
} from '../../core/setup/AutoSetupService';
import { findCopilotCLIPath } from '../../utils/copilotCli';

type Phase = 'installing' | 'login' | 'done' | 'manual' | 'error';

export class SetupWizardModal extends Modal {
  private phase: Phase = 'installing';
  private installLog: string[] = [];
  private errorDetail = '';

  constructor(app: App, private plugin: ObsidianCopilotPlugin) {
    super(app);
  }

  onOpen() {
    markShownThisSession();
    this.modalEl.addClass('ocop-setup-modal');
    this.setTitle('Obsidian Copilot 초기 설정');

    const { cliFound, npmFound } = checkSetupStatus();

    if (cliFound) {
      // Edge case: CLI appeared between check and open
      this.phase = 'done';
      this.render();
      return;
    }

    if (npmFound) {
      this.phase = 'installing';
      this.render();
      void this.runInstall();
    } else {
      this.phase = 'manual';
      this.render();
    }
  }

  private render() {
    this.contentEl.empty();
    switch (this.phase) {
      case 'installing': this.renderInstalling(); break;
      case 'login':      this.renderLogin();      break;
      case 'done':       this.renderDone();       break;
      case 'manual':     this.renderManual();     break;
      case 'error':      this.renderError();      break;
    }
  }

  // ── Phase: installing ───────────────────────────────────────────────────────

  private renderInstalling() {
    const wrap = this.contentEl.createDiv({ cls: 'ocop-setup-section' });
    wrap.createEl('p', {
      text: '📦 GitHub Copilot CLI 설치 중...',
      cls: 'ocop-setup-status',
    });
    const log = wrap.createDiv({ cls: 'ocop-setup-log' });
    for (const line of this.installLog.slice(-6)) {
      log.createDiv({ cls: 'ocop-setup-log-line', text: line });
    }
    if (this.installLog.length === 0) {
      log.createDiv({ cls: 'ocop-setup-log-line ocop-setup-muted', text: 'npm install -g @github/copilot 실행 중...' });
    }
  }

  private async runInstall() {
    const result = await installCopilotCLI((msg) => {
      if (msg) {
        this.installLog.push(msg);
        if (this.phase === 'installing') this.render();
      }
    });

    if (result.success) {
      void this.plugin.agentService.prewarmCapabilities();
      this.phase = 'login';
    } else {
      this.errorDetail = result.error ?? '알 수 없는 오류';
      this.phase = 'error';
    }
    this.render();
  }

  // ── Phase: login ────────────────────────────────────────────────────────────

  private renderLogin() {
    const wrap = this.contentEl.createDiv({ cls: 'ocop-setup-section' });

    wrap.createEl('p', { text: '✅ CLI 설치 완료!', cls: 'ocop-setup-success' });
    wrap.createEl('p', {
      text: '마지막으로 터미널에서 아래 명령을 실행해 GitHub 계정을 연결하세요.',
      cls: 'ocop-setup-desc',
    });

    this.renderCmdRow(wrap, 'copilot login');

    wrap.createEl('p', {
      text: '브라우저에서 GitHub 로그인이 완료되면 아래 버튼을 누르세요.',
      cls: 'ocop-setup-hint',
    });

    const btn = wrap.createEl('button', { text: '로그인 완료 →', cls: 'mod-cta ocop-setup-action-btn' });
    btn.addEventListener('click', () => {
      this.phase = 'done';
      this.render();
    });
  }

  // ── Phase: done ─────────────────────────────────────────────────────────────

  private renderDone() {
    const wrap = this.contentEl.createDiv({ cls: 'ocop-setup-section' });
    wrap.createEl('p', {
      text: '🎉 모든 설정이 완료됐습니다!',
      cls: 'ocop-setup-success',
    });
    wrap.createEl('p', {
      text: 'Obsidian Copilot 사이드바에서 바로 대화를 시작할 수 있습니다.',
      cls: 'ocop-setup-desc',
    });
    const btn = wrap.createEl('button', { text: '시작하기', cls: 'mod-cta ocop-setup-action-btn' });
    btn.addEventListener('click', () => this.close());
  }

  // ── Phase: manual ───────────────────────────────────────────────────────────

  private renderManual() {
    const wrap = this.contentEl.createDiv({ cls: 'ocop-setup-section' });

    wrap.createEl('p', {
      text: 'GitHub Copilot CLI를 사용하려면 Node.js가 필요합니다.',
      cls: 'ocop-setup-desc',
    });

    const list = wrap.createEl('ol', { cls: 'ocop-setup-steps' });

    // Step 1 — Node.js
    const s1 = list.createEl('li');
    s1.createSpan({ text: 'Node.js 설치: ' });
    const link = s1.createEl('a', { text: 'nodejs.org 다운로드 →', href: '#' });
    link.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      // Open externally via Obsidian helper
      (this.app as any).openUrl?.('https://nodejs.org');
    });

    // Step 2 — npm install
    const s2 = list.createEl('li');
    s2.createSpan({ text: 'CLI 설치 (터미널): ' });
    this.renderCmdRow(s2, 'npm install -g @github/copilot');

    // Step 3 — login
    const s3 = list.createEl('li');
    s3.createSpan({ text: 'GitHub 로그인 (터미널): ' });
    this.renderCmdRow(s3, 'copilot login');

    wrap.createEl('p', {
      text: '설치 완료 후 아래 버튼으로 다시 확인하세요.',
      cls: 'ocop-setup-hint',
    });

    const btn = wrap.createEl('button', { text: '설치 완료 확인', cls: 'mod-cta ocop-setup-action-btn' });
    btn.addEventListener('click', () => {
      if (findCopilotCLIPath() || this.plugin.settings.copilotCliPath) {
        this.phase = 'done';
        this.render();
      } else {
        new Notice('CLI를 아직 찾을 수 없습니다. 설치 후 다시 확인해 주세요.');
      }
    });

    const skipBtn = wrap.createEl('button', { text: '나중에', cls: 'ocop-setup-skip-btn' });
    skipBtn.addEventListener('click', () => this.close());
  }

  // ── Phase: error ────────────────────────────────────────────────────────────

  private renderError() {
    const wrap = this.contentEl.createDiv({ cls: 'ocop-setup-section' });

    wrap.createEl('p', { text: '⚠️ 자동 설치에 실패했습니다.', cls: 'ocop-setup-warn' });

    if (this.errorDetail) {
      const detail = wrap.createDiv({ cls: 'ocop-setup-log' });
      detail.createDiv({ cls: 'ocop-setup-log-line', text: this.errorDetail });
    }

    wrap.createEl('p', {
      text: '아래 명령을 터미널에서 직접 실행해 주세요.',
      cls: 'ocop-setup-desc',
    });
    this.renderCmdRow(wrap, 'npm install -g @github/copilot');

    wrap.createEl('p', {
      text: '권한 오류가 발생하면 Mac/Linux에서는 명령 앞에 sudo를 붙이세요.',
      cls: 'ocop-setup-hint',
    });
    this.renderCmdRow(wrap, 'sudo npm install -g @github/copilot');

    const btn = wrap.createEl('button', { text: '설치 완료 확인', cls: 'mod-cta ocop-setup-action-btn' });
    btn.addEventListener('click', () => {
      if (findCopilotCLIPath() || this.plugin.settings.copilotCliPath) {
        this.phase = 'login';
        this.render();
      } else {
        new Notice('CLI를 아직 찾을 수 없습니다. 설치 후 다시 확인해 주세요.');
      }
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private renderCmdRow(parent: HTMLElement, cmd: string) {
    const row = parent.createDiv({ cls: 'ocop-setup-cmd-row' });
    row.createEl('code', { text: cmd, cls: 'ocop-setup-cmd' });
    const btn = row.createEl('button', { text: '복사', cls: 'ocop-setup-copy-btn' });
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(cmd);
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = '복사'; }, 1800);
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
