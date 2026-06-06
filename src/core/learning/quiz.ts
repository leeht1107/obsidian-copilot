export type QuizDifficulty = '하' | '중' | '상';

export const QUIZ_EXTERNAL_MCP_SERVERS = ['context7'] as const;

export interface QuizPromptInput {
  questionCount: number | string;
  difficulty: QuizDifficulty;
  scopeInstruction: string;
  focusText?: string;
}

export interface QuizDisplayInput {
  displayScope: string;
  questionCount: number | string;
  difficulty: QuizDifficulty;
  focusText?: string;
}

export interface ParsedQuizDisplayContent {
  totalQuestions: number;
  difficulty: QuizDifficulty;
  focusText?: string;
}

export interface QuizContinuationPromptInput {
  currentQuestion: number;
  totalQuestions: number;
  difficulty?: QuizDifficulty;
  sourceInstruction?: string;
  focusText?: string;
  questionContext?: QuizQuestionContext;
}

export interface QuizQuestionContext {
  questionNumber: number;
  totalQuestions: number;
  questionText: string;
}

const DIFFICULTY_INSTRUCTIONS: Record<QuizDifficulty, string> = {
  '하': 'Ask simple recall/definition questions. Keep choices straightforward. Do not use any knowledge outside the selected ground truth notes/folder. If the selected material does not support a claim, do not invent it.',
  '중': 'Do not use any knowledge outside the selected ground truth notes/folder. If the selected material does not support a claim, do not invent it.',
  '상': 'Create application-level questions that apply the core concepts to novel real-world scenarios (e.g., applying "data science project" concepts to "AI development project"). You may use @context7 or web search to find related official documentation and supplement the questions. Do not be strictly bounded by the notes.',
};

export function shouldEnableQuizExternalTools(difficulty: QuizDifficulty): boolean {
  return difficulty === '상';
}

export function buildQuizDisplayContent(input: QuizDisplayInput): string {
  return ['/quiz', input.displayScope, `${input.questionCount}문제`, input.difficulty, input.focusText || '전체 범위']
    .filter(Boolean)
    .join(' · ');
}

export function parseQuizDisplayContent(displayContent?: string): ParsedQuizDisplayContent | null {
  if (!displayContent) return null;

  const parts = displayContent.split(' · ');
  if (parts[0] !== '/quiz') return null;

  const countIndex = parts.findIndex((part) => /^\d+문제$/.test(part));
  if (countIndex === -1) return null;

  const totalQuestions = Number(parts[countIndex].replace('문제', ''));
  const difficulty = parts[countIndex + 1] as QuizDifficulty | undefined;
  if (!Number.isFinite(totalQuestions) || !isQuizDifficulty(difficulty)) {
    return null;
  }

  const focusLabel = parts.slice(countIndex + 2).join(' · ').trim();
  return {
    totalQuestions,
    difficulty,
    focusText: focusLabel && focusLabel !== '전체 범위' ? focusLabel : undefined,
  };
}

export function buildQuizPrompt(input: QuizPromptInput): string {
  const difficultyInstruction = DIFFICULTY_INSTRUCTIONS[input.difficulty];
  const questionCount = String(input.questionCount);

  return [
    `Create a ${questionCount}-question quiz in Korean.`,
    input.scopeInstruction,
    difficultyInstruction,
    input.focusText ? `Focus especially on this topic: ${input.focusText}.` : '',
    'Use a deliberate mix of question formats: multiple-choice, short-answer, true/false, and multi-select.',
    'Ask exactly one question at a time.',
    'After the student answers, immediately tell them whether they are correct, explain why in Korean, and then move to the next question.',
    'Format each question in clean markdown.',
    'CRITICAL RULE: When a question mentions any specific code, function, variable, regex, or command from the source material, you MUST embed the relevant code snippet as a fenced code block (```) INSIDE the question body, between the #### heading and the answer choices. The student cannot see the original note — if you mention code without showing it, the question is unanswerable.',
    'Use this EXACT structure for each question — copy it precisely: Line 1: "## {N}/{T}번 문제". Line 2: blank. Line 3: "#### {question text}" — the question sentence IS the #### heading, nothing else. NEVER write "#### 문제" or any other fixed label on line 3. Line 4: blank. Lines 5+: (if referencing code) fenced code block, then blank line, then answer choices. Do NOT include an "답안 형식" hint line — the UI renders answer buttons automatically. For free-text questions with no choices, add "(자유 서술)" on its own line after the question.',
    `Format examples (use the one that fits):

Example 1 — conceptual question (no code):

## 1/5번 문제

#### 다음 중 SQL의 SELECT 문에 대한 설명으로 옳지 않은 것은 무엇입니까?

A. SELECT 문은 데이터를 조회할 때 사용된다.
B. SELECT 문에서 FROM 절은 데이터를 가져올 테이블을 지정한다.
C. SELECT 문은 데이터를 삭제하는 데 사용된다.
D. SELECT 문에서 컬럼명을 지정할 수 있다.

Example 2 — code-referencing question (MUST include snippet):

## 2/5번 문제

#### 다음 함수에서 정규식이 하는 역할로 올바른 것은?

\`\`\`python
# (relevant code snippet from source material)
\`\`\`

A. ... B. ... C. ... D. ...`,
    'Do not wrap the question in code fences or quote blocks.',
    'IMPORTANT: When answer choices differ only by whitespace, escaping, or subtle string differences, render each choice as an inline code span (backticks) or use explicit markers like "·" for spaces so the student can visually distinguish them. Markdown collapses consecutive spaces — never rely on multiple spaces to differentiate choices.',
    'Do NOT include "답안 형식: ..." lines. For free-text/short-answer questions, write "(자유 서술)" on its own line. For multi-select questions, write "(복수 선택 가능)" on its own line.',
    'For multiple-choice and multi-select questions, accept answers case-insensitively (for example b or B) and also accept the selected choice text when it is unambiguous.',
    'After the student answers, respond in markdown with this exact structure: "### 정답 확인", then bullet lines for "정오", "정답", "해설", "오개념 진단", "핵심 포인트", and "다음 회복 질문". The recovery question should be short, source-grounded, and designed to repair the misconception without starting an unrelated topic.',
    'After the feedback block, add a horizontal rule (---) and then continue with the next question.',
    'Never dump or quote raw source material, pasted notes, markdown headings, XML tags, or long excerpts from the source. Only show the quiz question, the student feedback, the correct answer, and the explanation.',
  ].filter(Boolean).join(' ');
}

export function buildQuizContinuationPrompt(input: QuizContinuationPromptInput): string {
  const {
    currentQuestion,
    totalQuestions,
    difficulty,
    sourceInstruction,
    focusText,
    questionContext,
  } = input;
  const questionToGrade = questionContext?.questionNumber ?? currentQuestion;
  const quizTotal = questionContext?.totalQuestions ?? totalQuestions;
  const isFinalQuestion = questionToGrade >= quizTotal;
  const nextQuestionNumber = Math.min(questionToGrade + 1, quizTotal);
  const difficultyInstruction = difficulty ? DIFFICULTY_INSTRUCTIONS[difficulty] : '';
  const questionContextInstruction = questionContext
    ? [
      'Grade this exact quiz question from the previous assistant turn before creating any next question:',
      '<quiz_question_to_grade>',
      questionContext.questionText,
      '</quiz_question_to_grade>',
      'The student answer is in the <query> block below. Use <quiz_question_to_grade> as the grading target and the selected source notes only as the answer key/ground truth.',
    ].join('\n')
    : '';
  const groundingInstructions = [
    questionContextInstruction,
    sourceInstruction,
    difficultyInstruction,
    focusText ? `Continue focusing on this topic: ${focusText}.` : '',
    'Continue the SAME quiz scope. Do not switch to unrelated general knowledge topics.',
    'If the source material is referenced with @ note paths, use those same notes as the only ground truth before creating the next question.',
    'Use this EXACT structure for the next question: Line 1: "## {N}/{T}번 문제". Line 2: blank. Line 3: "#### {question text}". Line 4: blank. Lines 5+: answer choices or "(자유 서술)".',
  ].filter(Boolean).join(' ');

  if (!isFinalQuestion) {
    return `You are continuing an active quiz. The student is answering question ${questionToGrade} of ${quizTotal}. Evaluate the student's answer in Korean, then ask exactly question ${nextQuestionNumber} of ${quizTotal} in Korean. ${groundingInstructions} All output must be in Korean.`;
  }

  return `[SYSTEM INSTRUCTION — MANDATORY]
This is the FINAL question (${questionToGrade}/${quizTotal}). You MUST complete ALL three steps below in order. Do NOT stop after step 1.

Source and scope constraints for this quiz:
${groundingInstructions}

Step 1: Evaluate the student's answer in Korean (### 정답 확인 format, same as before).

Step 2: Show overall score:
### 퀴즈 결과: N/${quizTotal} 정답 (N%)
Count ALL correct answers from questions 1-${quizTotal} in this conversation.

Step 3: Provide wrong-answer review as 조교 (teaching assistant):
### 오답 복습 정리
For EACH wrong answer, write:
**N번 문제 — (topic keyword)**
- **학생 답:** (student's choice)
- **정답:** (correct answer)
- **왜 틀렸나:** 1-2 sentence misconception explanation
- **오개념 진단:** name the misconception or missing distinction
- **핵심 정리:** correct concept summary with code snippet if relevant
- **다음 회복 질문:** one short source-grounded question that helps repair the misconception

End with: 💡 조교 한마디: encouragement + study tip based on error patterns.
If ALL correct: congratulate and highlight the most important concept.

All output must be in Korean. Do NOT ask another question. Do NOT skip steps 2 and 3.`;
}

function isQuizDifficulty(value: string | undefined): value is QuizDifficulty {
  return value === '하' || value === '중' || value === '상';
}
