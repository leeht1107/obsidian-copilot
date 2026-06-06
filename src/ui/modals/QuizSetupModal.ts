import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';

import {
  buildQuizDisplayContent,
  buildQuizPrompt,
  getBasename,
  getFolderNotePaths,
  getSubjectRoot,
  type LearningScope,
  type QuizDifficulty,
  shouldEnableQuizExternalTools,
  summarizeFolder,
  summarizeSelectedNotes,
} from '../../core/learning';

export interface QuizSetupResult {
  prompt: string;
  displayContent: string;
  totalQuestions: number;
  difficulty: QuizDifficulty;
  sourceInstruction: string;
  focusText?: string;
  /** True when difficulty is '상' — caller should enable web search and context7. */
  enableExternalTools?: boolean;
}

export class QuizSetupModal extends Modal {
  private resolvePromise: ((result: QuizSetupResult | null) => void) | null = null;
  private quizScope: LearningScope = 'current-note';
  private selectedNotePaths = new Set<string>();
  private selectedFolderPaths = new Set<string>();
  private questionCount = '5';
  private difficulty: QuizDifficulty = '중';
  private focusText = '';
  private useFullVault = false;

  constructor(app: App, private readonly activeFilePath: string | null, initialFocusText = '') {
    super(app);
    this.focusText = initialFocusText.trim();
    if (!activeFilePath) {
      this.quizScope = 'note';
    }
  }

  onOpen() {
    this.setTitle('Create quiz');
    this.modalEl.addClass('ocop-slash-modal');

    this.renderContent();
  }

  private renderContent() {
    this.contentEl.empty();

    const allNotes = this.app.vault.getMarkdownFiles().map((file) => file.path).sort();
    const subjectRoot = getSubjectRoot(this.activeFilePath);
    const scopedNotes = subjectRoot
      ? allNotes.filter((notePath) => notePath === subjectRoot || notePath.startsWith(`${subjectRoot}/`))
      : allNotes;
    const candidateNotes = this.useFullVault ? allNotes : scopedNotes;
    const allFolders = Array.from(new Set(candidateNotes
      .map((notePath) => notePath.includes('/') ? notePath.split('/').slice(0, -1).join('/') : '')
      .filter(Boolean))).sort();

    if (this.selectedNotePaths.size === 0 && this.activeFilePath) {
      this.selectedNotePaths.add(this.activeFilePath);
    } else if (this.selectedNotePaths.size === 0 && candidateNotes.length > 0) {
      this.selectedNotePaths.add(candidateNotes[0]);
    }
    if (this.selectedFolderPaths.size === 0 && allFolders.length > 0) {
      this.selectedFolderPaths.add(allFolders[0]);
    }

    const detailsEl = this.contentEl.createDiv();

    const renderDetails = () => {
      detailsEl.empty();
      if (subjectRoot) {
        new Setting(detailsEl)
          .setName('Scope source')
          .setDesc(this.useFullVault ? 'Showing the full vault.' : `Showing notes under ${subjectRoot}`)
          .addToggle((toggle) => {
            toggle.setValue(this.useFullVault).onChange((value) => {
              this.useFullVault = value;
              this.selectedNotePaths.clear();
              this.selectedFolderPaths.clear();
              this.renderContent();
            });
          });
      }

      if (this.quizScope === 'note') {
        detailsEl.createDiv({
          cls: 'setting-item-description',
          text: 'Choose one or more notes.',
        });
        const noteListEl = detailsEl.createDiv({ cls: 'ocop-quiz-note-list' });
        for (const notePath of candidateNotes) {
          const noteItem = noteListEl.createDiv({ cls: 'ocop-quiz-note-item' });
          const checkbox = noteItem.createEl('input', { attr: { type: 'checkbox' } });
          checkbox.checked = this.selectedNotePaths.has(notePath);
          checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
              this.selectedNotePaths.add(notePath);
            } else if (this.selectedNotePaths.size > 1) {
              this.selectedNotePaths.delete(notePath);
            } else {
              checkbox.checked = true;
            }
          });
          noteItem.createSpan({ text: notePath });
        }
        detailsEl.createDiv({
          cls: 'setting-item-description',
          text: `현재 선택: ${this.selectedNotePaths.size}개 노트`,
        });
      }
      if (this.quizScope === 'folder') {
        detailsEl.createDiv({
          cls: 'setting-item-description',
          text: 'Choose one or more folders.',
        });
        const folderListEl = detailsEl.createDiv({ cls: 'ocop-quiz-note-list' });
        for (const folderPath of allFolders) {
          const folderItem = folderListEl.createDiv({ cls: 'ocop-quiz-note-item' });
          const checkbox = folderItem.createEl('input', { attr: { type: 'checkbox' } });
          checkbox.checked = this.selectedFolderPaths.has(folderPath);
          checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
              this.selectedFolderPaths.add(folderPath);
            } else if (this.selectedFolderPaths.size > 1) {
              this.selectedFolderPaths.delete(folderPath);
            } else {
              checkbox.checked = true;
            }
            renderDetails();
          });
          folderItem.createSpan({ text: folderPath });
        }
        const folderNoteCount = candidateNotes.filter((notePath) =>
          Array.from(this.selectedFolderPaths).some((folderPath) => notePath.startsWith(`${folderPath}/`) || notePath === folderPath)
        ).length;
        detailsEl.createDiv({
          cls: 'setting-item-description',
          text: `현재 선택: 폴더 ${this.selectedFolderPaths.size}개 · 포함 노트 ${folderNoteCount}개`,
        });
      }
    };

    new Setting(this.contentEl)
      .setName('Scope')
      .setDesc('Choose what the quiz should be based on.')
      .addDropdown((dropdown) => {
        if (this.activeFilePath) {
          dropdown.addOption('current-note', 'Current note');
        }
        dropdown.addOption('note', 'Choose multiple notes');
        dropdown.addOption('folder', 'Choose folder');
        dropdown.setValue(this.quizScope).onChange((value: LearningScope) => {
          this.quizScope = value;
          renderDetails();
        });
      });

    renderDetails();

    new Setting(this.contentEl)
      .setName('Question count')
      .addDropdown((dropdown) => {
        for (const count of ['3', '4', '5', '6', '7', '8', '9', '10']) {
          dropdown.addOption(count, `${count} questions`);
        }
        dropdown.setValue(this.questionCount).onChange((value) => {
          this.questionCount = value;
        });
      });

    new Setting(this.contentEl)
      .setName('Difficulty')
      .addDropdown((dropdown) => {
        dropdown.addOption('하', '하 — 기본 암기/이해 확인');
        dropdown.addOption('중', '중 — 종합 이해 (기본값)');
        dropdown.addOption('상', '상 — 심화 (Web + Context7 자동 활성화)');
        dropdown.setValue(this.difficulty).onChange((value: QuizDifficulty) => {
          this.difficulty = value;
        });
      });

    new Setting(this.contentEl)
      .setName('Focus topic (optional)')
      .setDesc('Example: PK, 정규화, 트랜잭션')
      .addText((text) => {
        text
          .setPlaceholder('Leave empty to cover the full selected scope')
          .setValue(this.focusText)
          .onChange((value) => {
            this.focusText = value.trim();
          });
      });

    const buttonsEl = this.contentEl.createDiv({ cls: 'ocop-mcp-buttons' });
    const cancelBtn = buttonsEl.createEl('button', { text: 'Cancel', cls: 'ocop-cancel-btn' });
    cancelBtn.addEventListener('click', () => this.finish(null));
    const createBtn = buttonsEl.createEl('button', { text: 'Create quiz', cls: 'ocop-save-btn mod-cta' });
    createBtn.addEventListener('click', () => this.finish(this.buildResult()));
  }

  onClose() {
    this.contentEl.empty();
    if (this.resolvePromise) {
      this.resolvePromise(null);
      this.resolvePromise = null;
    }
  }

  openAndWait(): Promise<QuizSetupResult | null> {
    this.open();
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  private buildResult(): QuizSetupResult {
    let scopeInstruction = '';
    let displayScope = '현재 노트';

    if (this.quizScope === 'current-note' && this.activeFilePath) {
      scopeInstruction = `Use only the current note as ground truth source material: @${this.activeFilePath}`;
      displayScope = `현재 노트 · ${getBasename(this.activeFilePath)}`;
    } else if (this.quizScope === 'note') {
      const selectedPaths = Array.from(this.selectedNotePaths);
      scopeInstruction = `Use only these selected notes as ground truth source material: ${selectedPaths.map((path) => `@${path}`).join(', ')}`;
      displayScope = summarizeSelectedNotes(selectedPaths);
    } else {
      const selectedFolders = Array.from(this.selectedFolderPaths);
      const folderNotes = getFolderNotePaths(
        this.app.vault.getMarkdownFiles().map((file) => file.path),
        selectedFolders
      );
      scopeInstruction = folderNotes.length > 0
        ? `Use only these selected notes as ground truth source material: ${folderNotes.map((p) => `@${p}`).join(', ')}`
        : `No markdown files found in selected folders: ${selectedFolders.join(', ')}. Please inform the user.`;
      displayScope = selectedFolders.length === 1
        ? `폴더 · ${summarizeFolder(selectedFolders[0])}`
        : `폴더 ${selectedFolders.length}개`;
    }

    const focusText = this.focusText || undefined;

    return {
      displayContent: buildQuizDisplayContent({
        displayScope,
        questionCount: this.questionCount,
        difficulty: this.difficulty,
        focusText,
      }),
      totalQuestions: Number(this.questionCount),
      difficulty: this.difficulty,
      sourceInstruction: scopeInstruction,
      focusText,
      enableExternalTools: shouldEnableQuizExternalTools(this.difficulty),
      prompt: buildQuizPrompt({
        questionCount: this.questionCount,
        difficulty: this.difficulty,
        scopeInstruction,
        focusText,
      }),
    };
  }

  private finish(result: QuizSetupResult | null) {
    const resolve = this.resolvePromise;
    this.resolvePromise = null;
    this.close();
    resolve?.(result);
  }
}
