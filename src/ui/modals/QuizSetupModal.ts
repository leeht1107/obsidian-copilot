import { Modal, Setting, type App } from 'obsidian';

type QuizScope = 'current-note' | 'note' | 'folder';

export interface QuizSetupResult {
  prompt: string;
  displayContent: string;
  totalQuestions: number;
  focusText?: string;
  difficulty?: string;
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

export class QuizSetupModal extends Modal {
  private resolvePromise: ((result: QuizSetupResult | null) => void) | null = null;
  private quizScope: QuizScope = 'current-note';
  private selectedNotePaths = new Set<string>();
  private selectedFolderPaths = new Set<string>();
  private questionCount = '5';
  private difficulty: '하' | '중' | '상' = '중';
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
        dropdown.addOption('상', '상 — 심화 (외부 자료 기반 응용)');
        dropdown.setValue(this.difficulty).onChange((value: '하' | '중' | '상') => {
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
      scopeInstruction = `Use only notes in these selected folders as ground truth source material: ${selectedFolders.join(', ')}`;
      displayScope = selectedFolders.length === 1
        ? `폴더 · ${summarizeFolder(selectedFolders[0])}`
        : `폴더 ${selectedFolders.length}개`;
    }

    const displayLabel = [`/quiz`, displayScope, `${this.questionCount}문제`, this.difficulty, this.focusText || '전체 범위']
      .filter(Boolean)
      .join(' · ');

    const difficultyInstruction = this.difficulty === '하'
      ? 'Ask simple recall/definition questions. Keep choices straightforward.'
      : this.difficulty === '상'
        ? '@context7 Use @context7 to research official documentation related to the quiz topic. Create application-level questions that require deeper understanding beyond the given notes. Stay within the topic scope.'
        : '';

    return {
      displayContent: displayLabel,
      totalQuestions: Number(this.questionCount),
      focusText: this.focusText || undefined,
      difficulty: this.difficulty,
      prompt: [
        `Create a ${this.questionCount}-question quiz in Korean.`,
        scopeInstruction,
        'Do not use any knowledge outside the selected ground truth notes/folder. If the selected material does not support a claim, do not invent it.',
        this.focusText ? `Focus especially on this topic: ${this.focusText}.` : '',
        difficultyInstruction,
        'Use a deliberate mix of question formats: multiple-choice, short-answer, true/false, and multi-select.',
        'It is acceptable to revisit the same concept multiple times in different question styles (for example multiple choice, short answer, true/false, or multi-select) if that improves learning.',
        'Ask exactly one question at a time.',
        'After the student answers, immediately tell them whether they are correct, explain why in Korean, and then move to the next question.',
        'All student-facing output must be in Korean.',
        'Format each question in clean markdown.',
        'CRITICAL RULE: When a question mentions any specific code, function, variable, regex, or command from the source material, you MUST embed the relevant code snippet as a fenced code block (```) INSIDE the question body, between the #### heading and the answer choices. The student cannot see the original note — if you mention code without showing it, the question is unanswerable.',
        'Use this EXACT structure for each question — copy it precisely: Line 1: "## {N}/{T}번 문제". Line 2: blank. Line 3: "#### {question text}" — the question sentence IS the #### heading, nothing else. NEVER write "#### 문제" or any other fixed label on line 3. Line 4: blank. Lines 5+: (if referencing code) fenced code block, then blank line, then answer choices. Final line: "답안 형식: ...".',
        `Format examples (use the one that fits):

Example 1 — conceptual question (no code):

## 1/5번 문제

#### 다음 중 SQL의 SELECT 문에 대한 설명으로 옳지 않은 것은 무엇입니까?

A. SELECT 문은 데이터를 조회할 때 사용된다.
B. SELECT 문에서 FROM 절은 데이터를 가져올 테이블을 지정한다.
C. SELECT 문은 데이터를 삭제하는 데 사용된다.
D. SELECT 문에서 컬럼명을 지정할 수 있다.

답안 형식: A

Example 2 — code-referencing question (MUST include snippet):

## 2/5번 문제

#### 다음 clean_title() 함수에서 2단계(허용 문자 외 제거)의 정규식이 하는 역할로 올바른 것은 무엇입니까?

\`\`\`python
def clean_title(text):
    text = re.sub(r'^\\[.*?\\]\\s*', '', text)   # 1) 접두 태그 제거
    text = re.sub(r'[^가-힣a-zA-Z0-9\\s]', '', text)  # 2) 허용 문자 외 제거
    text = re.sub(r'\\s+', ' ', text).strip()  # 3) 공백 정규화
    return text
\`\`\`

A. 한글, 영문, 숫자, 공백만 남긴다.
B. 모든 특수문자를 공백으로 치환한다.
C. 영문 대문자만 제거한다.
D. 숫자를 모두 제거한다.

답안 형식: A`,
        'Do not wrap the question in code fences or quote blocks.',
        'IMPORTANT: When answer choices differ only by whitespace, escaping, or subtle string differences, render each choice as an inline code span (backticks) or use explicit markers like "·" for spaces so the student can visually distinguish them. Markdown collapses consecutive spaces — never rely on multiple spaces to differentiate choices.',
        'After each question, include a short answer-format hint line. For example: "답안 형식: A" for multiple choice, "답안 형식: A,C" for multi-select, or "답안 형식: 자유 서술" for short-answer.',
        'For multiple-choice and multi-select questions, accept answers case-insensitively (for example b or B) and also accept the selected choice text when it is unambiguous.',
        'After the student answers, respond in markdown with this exact structure: "### 정답 확인", then bullet lines for "정오", "정답", "해설", and "핵심 포인트".',
        'After the feedback block, add a horizontal rule (---) and then continue with the next question.',
        'Never dump or quote raw source material, pasted notes, markdown headings, XML tags, or long excerpts from the source. Only show the quiz question, the student feedback, the correct answer, and the explanation.',
      ].join(' '),
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

  private finish(result: QuizSetupResult | null) {
    const resolve = this.resolvePromise;
    this.resolvePromise = null;
    this.close();
    resolve?.(result);
  }
}
