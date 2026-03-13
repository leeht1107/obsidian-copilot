import { Modal, Setting, type App } from 'obsidian';

type QuizScope = 'current-note' | 'note' | 'folder';

export interface QuizSetupResult {
  prompt: string;
  displayContent: string;
}

export class QuizSetupModal extends Modal {
  private resolvePromise: ((result: QuizSetupResult | null) => void) | null = null;
  private quizScope: QuizScope = 'current-note';
  private selectedNotePaths = new Set<string>();
  private selectedFolderPath = '';
  private questionCount = '10';
  private focusText = '';

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

    const allNotes = this.app.vault.getMarkdownFiles().map((file) => file.path).sort();
    const allFolders = Array.from(new Set(allNotes
      .map((notePath) => notePath.includes('/') ? notePath.split('/').slice(0, -1).join('/') : '')
      .filter(Boolean))).sort();

    if (this.selectedNotePaths.size === 0 && this.activeFilePath) {
      this.selectedNotePaths.add(this.activeFilePath);
    } else if (this.selectedNotePaths.size === 0 && allNotes.length > 0) {
      this.selectedNotePaths.add(allNotes[0]);
    }
    if (!this.selectedFolderPath && allFolders.length > 0) {
      this.selectedFolderPath = allFolders[0];
    }

    const detailsEl = this.contentEl.createDiv();

    const renderDetails = () => {
      detailsEl.empty();
      if (this.quizScope === 'note') {
        detailsEl.createDiv({
          cls: 'setting-item-description',
          text: 'Choose one or more notes.',
        });
        const noteListEl = detailsEl.createDiv({ cls: 'ocop-quiz-note-list' });
        for (const notePath of allNotes) {
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
      }
      if (this.quizScope === 'folder') {
        new Setting(detailsEl)
          .setName('Choose folder')
          .addDropdown((dropdown) => {
            for (const folderPath of allFolders) {
              dropdown.addOption(folderPath, folderPath);
            }
            dropdown.setValue(this.selectedFolderPath).onChange((value) => {
              this.selectedFolderPath = value;
            });
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
        dropdown.addOption('note', 'Choose note');
        dropdown.addOption('folder', 'Choose folder');
        dropdown.setValue(this.quizScope).onChange((value: QuizScope) => {
          this.quizScope = value;
          renderDetails();
        });
      });

    renderDetails();

    new Setting(this.contentEl)
      .setName('Question count')
      .addDropdown((dropdown) => {
        for (const count of ['5', '10']) {
          dropdown.addOption(count, `${count} questions`);
        }
        dropdown.setValue(this.questionCount).onChange((value) => {
          this.questionCount = value;
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
    let sourceReference = '';

    if (this.quizScope === 'current-note' && this.activeFilePath) {
      scopeInstruction = 'Use the current note only as the source material.';
    } else if (this.quizScope === 'note') {
      const selectedPaths = Array.from(this.selectedNotePaths);
      scopeInstruction = `Use only these selected notes as source material: ${selectedPaths.map((path) => `@${path}`).join(', ')}`;
      sourceReference = ` (${selectedPaths.length} notes)`;
    } else {
      scopeInstruction = `Use notes in the selected folder as source material and build a quiz from recurring concepts: ${this.selectedFolderPath}`;
      sourceReference = ` (${this.selectedFolderPath})`;
    }

    return {
      displayContent: this.focusText ? `/quiz ${this.focusText}${sourceReference}` : `/quiz${sourceReference}`,
      prompt: [
        `한국어로 ${this.questionCount}문제 퀴즈를 만들어 줘.`,
        scopeInstruction,
        this.focusText ? `퀴즈는 특히 ${this.focusText} 중심으로 출제해.` : '',
        this.questionCount === '5'
          ? '기본은 4지선다 객관식으로 하되, 자료 특성상 더 적합하면 다른 형식도 허용해.'
          : '기본은 4지선다 객관식으로 하되, 문제 수가 많으므로 주관식, 단답식, OX, multi-select를 적절히 섞어도 좋아.',
        '중요: 한 번에 모든 문제를 내지 말고 반드시 한 문제씩만 내라.',
        '학생이 답을 고르거나 입력하면, 바로 정답 여부를 알려주고 왜 그런지 한국어로 해설한 뒤 다음 문제로 넘어가라.',
        '각 문제에는 문제 번호를 붙이고, 객관식/멀티셀렉트는 선택지를 명확히 제시하라.',
      ].join(' '),
    };
  }

  private finish(result: QuizSetupResult | null) {
    const resolve = this.resolvePromise;
    this.resolvePromise = null;
    this.close();
    resolve?.(result);
  }
}
