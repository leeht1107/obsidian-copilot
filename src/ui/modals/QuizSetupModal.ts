import { Modal, Setting, type App } from 'obsidian';

type QuizScope = 'current-note' | 'note' | 'folder';

export interface QuizSetupResult {
  prompt: string;
  displayContent: string;
}

export class QuizSetupModal extends Modal {
  private resolvePromise: ((result: QuizSetupResult | null) => void) | null = null;
  private quizScope: QuizScope = 'current-note';
  private selectedNotePath = '';
  private selectedFolderPath = '';
  private questionCount = '10';

  constructor(app: App, private readonly activeFilePath: string | null) {
    super(app);
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

    if (!this.selectedNotePath && this.activeFilePath) {
      this.selectedNotePath = this.activeFilePath;
    } else if (!this.selectedNotePath && allNotes.length > 0) {
      this.selectedNotePath = allNotes[0];
    }
    if (!this.selectedFolderPath && allFolders.length > 0) {
      this.selectedFolderPath = allFolders[0];
    }

    const detailsEl = this.contentEl.createDiv();

    const renderDetails = () => {
      detailsEl.empty();
      if (this.quizScope === 'note') {
        new Setting(detailsEl)
          .setName('Choose note')
          .addDropdown((dropdown) => {
            for (const notePath of allNotes) {
              dropdown.addOption(notePath, notePath);
            }
            dropdown.setValue(this.selectedNotePath).onChange((value) => {
              this.selectedNotePath = value;
            });
          });
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
      scopeInstruction = `Use only the selected note as source material: @${this.selectedNotePath}`;
      sourceReference = ` (${this.selectedNotePath})`;
    } else {
      scopeInstruction = `Use notes in the selected folder as source material and build a quiz from recurring concepts: ${this.selectedFolderPath}`;
      sourceReference = ` (${this.selectedFolderPath})`;
    }

    return {
      displayContent: `/quiz${sourceReference}`,
      prompt: [
        `Create a ${this.questionCount}-question quiz for a student.`,
        scopeInstruction,
        this.questionCount === '5'
          ? 'Default to multiple-choice questions unless another format is clearly better for the material.'
          : 'Use mostly multiple-choice questions, but mix in short-answer, true/false, and multi-select questions when they improve coverage.',
        'Include answer choices where needed and provide a clear answer key after the quiz.',
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
