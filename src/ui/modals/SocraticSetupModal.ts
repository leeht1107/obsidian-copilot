import { Modal, Setting, type App } from 'obsidian';

type SocraticScope = 'current-note' | 'note' | 'folder';

export interface SocraticSetupResult {
  prompt: string;
  displayContent: string;
  focusText?: string;
}

function getBasename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

function summarizeSelectedNotes(paths: string[]): string {
  if (paths.length === 0) return '노트 0개';
  const names = paths.map(getBasename);
  if (names.length === 1) return `노트 · ${names[0]}`;
  if (names.length === 2) return `노트 2개 · ${names[0]}, ${names[1]}`;
  return `노트 ${names.length}개 · ${names[0]}, ${names[1]} 외 ${names.length - 2}개`;
}

function summarizeFolder(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts.slice(-2).join('/') || normalized;
}

export class SocraticSetupModal extends Modal {
  private resolvePromise: ((result: SocraticSetupResult | null) => void) | null = null;
  private socraticScope: SocraticScope = 'current-note';
  private selectedNotePaths = new Set<string>();
  private selectedFolderPaths = new Set<string>();
  private focusText = '';
  private useFullVault = false;

  constructor(app: App, private readonly activeFilePath: string | null, initialFocusText = '') {
    super(app);
    this.focusText = initialFocusText.trim();
    if (!activeFilePath) {
      this.socraticScope = 'note';
    }
  }

  onOpen() {
    this.setTitle('Start Socratic dialogue');
    this.modalEl.addClass('ocop-slash-modal');
    this.renderContent();
  }

  private renderContent() {
    this.contentEl.empty();

    const allNotes = this.app.vault.getMarkdownFiles().map((file) => file.path).sort();
    const subjectRoot = this.getSubjectRoot(this.activeFilePath);
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

      if (this.socraticScope === 'note') {
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
      if (this.socraticScope === 'folder') {
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
      .setDesc('Choose what the dialogue should be based on.')
      .addDropdown((dropdown) => {
        if (this.activeFilePath) {
          dropdown.addOption('current-note', 'Current note');
        }
        dropdown.addOption('note', 'Choose note');
        dropdown.addOption('folder', 'Choose folder');
        dropdown.setValue(this.socraticScope).onChange((value: SocraticScope) => {
          this.socraticScope = value;
          renderDetails();
        });
      });

    renderDetails();

    new Setting(this.contentEl)
      .setName('Focus topic (optional)')
      .setDesc('Example: 정규화, 트랜잭션, 재귀함수')
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
    const startBtn = buttonsEl.createEl('button', { text: 'Start dialogue', cls: 'ocop-save-btn mod-cta' });
    startBtn.addEventListener('click', () => this.finish(this.buildResult()));
  }

  onClose() {
    this.contentEl.empty();
    if (this.resolvePromise) {
      this.resolvePromise(null);
      this.resolvePromise = null;
    }
  }

  openAndWait(): Promise<SocraticSetupResult | null> {
    this.open();
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  private buildResult(): SocraticSetupResult {
    let scopeInstruction = '';
    let displayScope = '현재 노트';

    if (this.socraticScope === 'current-note' && this.activeFilePath) {
      scopeInstruction = `The following note is the source material for the dialogue: @${this.activeFilePath}`;
      displayScope = `현재 노트 · ${getBasename(this.activeFilePath)}`;
    } else if (this.socraticScope === 'note') {
      const selectedPaths = Array.from(this.selectedNotePaths);
      scopeInstruction = `The following notes are the source material for the dialogue: ${selectedPaths.map((path) => `@${path}`).join(', ')}`;
      displayScope = summarizeSelectedNotes(selectedPaths);
    } else {
      const selectedFolders = Array.from(this.selectedFolderPaths);
      const folderNotes = this.app.vault.getMarkdownFiles()
        .filter((f) => selectedFolders.some((folder) => f.path.startsWith(`${folder}/`)))
        .map((f) => f.path)
        .sort();
      scopeInstruction = folderNotes.length > 0
        ? `The following notes are the source material for the dialogue: ${folderNotes.map((p) => `@${p}`).join(', ')}`
        : `No markdown files found in selected folders: ${selectedFolders.join(', ')}. Please inform the user.`;
      displayScope = selectedFolders.length === 1
        ? `폴더 · ${summarizeFolder(selectedFolders[0])}`
        : `폴더 ${selectedFolders.length}개`;
    }

    const displayLabel = ['/socratic', displayScope, this.focusText || '전체 범위']
      .filter(Boolean)
      .join(' · ');

    return {
      displayContent: displayLabel,
      focusText: this.focusText || undefined,
      prompt: [
        'You are a warm, encouraging subject-matter expert who guides students through Socratic questioning. Based on the SOURCE MATERIAL below, silently identify the academic domain (e.g., 데이터베이스, 알고리즘, 미적분학, 경제학, 운영체제 etc.) and naturally adopt the voice of an approachable, knowledgeable professor in that field — curious about the student\'s thinking and genuinely celebratory of intellectual effort.',
        'TONE: Write in warm, conversational Korean (해요체). From the SECOND response onward, open each response with a brief, genuine acknowledgment of the student\'s effort or thinking — e.g. "오, 흥미로운 생각이네요!", "좋은 관점이에요~", "그 부분을 먼저 생각했군요!" — before redirecting with a probing question. Your FIRST response should jump straight into the opening question with no preamble. Never sound clinical, robotic, or overly formal.',
        'RESPONSE PATTERN — follow this for every response:',
        '1. ACKNOWLEDGE: 학생 답변에서 맞거나 좋은 부분을 구체적으로 짚어줘요. ("맞아요, X는 정확해요!", "그 부분을 잘 짚었어요~")',
        '2. GUIDE: 부족하거나 틀린 부분이 있으면 힌트, 예시, 비유를 통해 방향을 잡아줘요. 직접 정답을 말하지 말고, 핵심에 가까워지도록 디딤돌을 놓아주세요.',
        '3. PROBE: 다음 단계로 나아가는 심화 질문을 하나 던져요.',
        'ADAPTATION: 학생이 잘 따라오면 간단 인정 → 바로 심화 질문. 학생이 헤매면 상세 피드백 → 예시/비유 제공 → 쉬운 질문으로 되돌아감. 복잡한 개념은 하위 단계로 나눠서 하나씩 진행.',
        'BOUNDARIES: 정답을 통째로 알려주지 마세요 — 학생이 스스로 도달하도록 가이드. 학생이 맞았으면 "맞아요!"라고 인정하고 바로 다음 단계로. 학생이 "모르겠어요" 하면 더 쉬운 비유나 예시를 제공한 뒤 다시 질문.',
        `SOURCE MATERIAL: ${scopeInstruction}`,
        this.focusText ? `Focus the dialogue on this topic: ${this.focusText}.` : '',
        'DIALOGUE STRUCTURE: Continue the dialogue until the student has arrived at a clear insight through their own reasoning. When that moment comes, ask one final synthesizing question (e.g. "지금까지의 대화를 바탕으로, 핵심 개념을 한 문장으로 정리한다면?"). After the student replies to that final question, output the session summary:',
        '  ##SOCRATIC_SUMMARY##',
        '  ### 발견의 여정 요약',
        '  In Korean: summarize the key insights the student arrived at THEMSELVES — quote their own words where possible. Acknowledge what they still need to explore. End with one open question for further reflection.',
        'All output must be in Korean.',
        'START: Begin with a warm, brief greeting (e.g. "안녕하세요! 반가워요 😊"). Then ask the student which part of the material they want to explore or what they find curious/confusing. Do NOT jump into a specific topic question yet — let the student choose the starting point. Keep it to 2-3 sentences max.',
      ].filter(Boolean).join('\n'),
    };
  }

  private getSubjectRoot(activeFilePath: string | null): string | null {
    if (!activeFilePath || !activeFilePath.includes('/')) {
      return null;
    }

    const segments = activeFilePath.split('/').slice(0, -1);
    const subjectSegments = segments.slice(0, Math.min(3, segments.length));
    return subjectSegments.length > 0 ? subjectSegments.join('/') : null;
  }

  private finish(result: SocraticSetupResult | null) {
    const resolve = this.resolvePromise;
    this.resolvePromise = null;
    this.close();
    resolve?.(result);
  }
}
