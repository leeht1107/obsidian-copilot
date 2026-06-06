import {
  buildQuizContinuationPrompt,
  buildSocraticContinuationPrompt,
  buildSocraticPrompt,
  inferSocraticSupportLevel,
  parseQuizDisplayContent,
  parseSocraticMeta,
  shouldEnableQuizExternalTools,
} from '@/core/learning';

describe('learning helpers', () => {
  describe('quiz display parsing', () => {
    it('parses generated quiz labels for toolbar session inference', () => {
      expect(parseQuizDisplayContent('/quiz · 현재 노트 · db.md · 7문제 · 상 · 정규화')).toEqual({
        totalQuestions: 7,
        difficulty: '상',
        focusText: '정규화',
      });
    });

    it('treats 전체 범위 as empty focus text', () => {
      expect(parseQuizDisplayContent('/quiz · 노트 · a.md · 5문제 · 중 · 전체 범위')).toEqual({
        totalQuestions: 5,
        difficulty: '중',
        focusText: undefined,
      });
    });
  });

  describe('quiz external tools', () => {
    it('only enables external tools for high difficulty', () => {
      expect(shouldEnableQuizExternalTools('상')).toBe(true);
      expect(shouldEnableQuizExternalTools('중')).toBe(false);
      expect(shouldEnableQuizExternalTools('하')).toBe(false);
    });
  });

  describe('continuation prompts', () => {
    it('keeps quiz continuations constrained to Korean', () => {
      expect(buildQuizContinuationPrompt({ currentQuestion: 1, totalQuestions: 3 })).toContain('All output must be in Korean');
      expect(buildQuizContinuationPrompt({ currentQuestion: 3, totalQuestions: 3 })).toContain('All output must be in Korean');
    });

    it('keeps quiz continuations constrained to the original source scope', () => {
      const prompt = buildQuizContinuationPrompt({
        currentQuestion: 1,
        totalQuestions: 3,
        difficulty: '중',
        sourceInstruction: 'Use only the current note as ground truth source material: @db.md',
        focusText: 'CTE vs VIEW',
      });

      expect(prompt).toContain('@db.md');
      expect(prompt).toContain('Do not use any knowledge outside the selected ground truth notes/folder');
      expect(prompt).toContain('Continue the SAME quiz scope');
      expect(prompt).toContain('## {N}/{T}번 문제');
      expect(prompt).toContain('CTE vs VIEW');
    });

    it('includes exact previous quiz question context when grading a bare answer', () => {
      const prompt = buildQuizContinuationPrompt({
        currentQuestion: 2,
        totalQuestions: 5,
        difficulty: '중',
        questionContext: {
          questionNumber: 1,
          totalQuestions: 5,
          questionText: [
            '## 1/5번 문제',
            '',
            '#### 이름 없는 인라인뷰에서 노트가 지적한 통증이 아닌 것은?',
            '',
            'A. 가독성 문제',
            'B. 의도 불명 문제',
            'C. 수정 부담 문제',
            'D. 성능 향상',
          ].join('\n'),
        },
      });

      expect(prompt).toContain('student is answering question 1 of 5');
      expect(prompt).toContain('ask exactly question 2 of 5');
      expect(prompt).toContain('<quiz_question_to_grade>');
      expect(prompt).toContain('D. 성능 향상');
      expect(prompt).toContain('source notes only as the answer key/ground truth');
    });

    it('keeps Socratic continuations constrained to Korean', () => {
      expect(buildSocraticContinuationPrompt(false)).toContain('All output must be in Korean');
      expect(buildSocraticContinuationPrompt(true)).toContain('All output must be in Korean');
    });

    it('keeps Socratic continuations grounded in the original source and focus', () => {
      const prompt = buildSocraticContinuationPrompt({
        isSummaryPhase: false,
        sourceInstruction: 'The following note is the source material for the dialogue: @db.md',
        focusText: 'CTE vs VIEW',
        supportLevel: 2,
      });

      expect(prompt).toContain('Mark\'s digital teaching twin');
      expect(prompt).toContain('@db.md');
      expect(prompt).toContain('CTE vs VIEW');
      expect(prompt).toContain('Current mode: rescue');
      expect(prompt).toContain('Do not run a twenty-questions game');
      expect(prompt).toContain('All output must be in Korean');
    });

    it('keeps summary-phase Socratic continuations from asking another question', () => {
      const prompt = buildSocraticContinuationPrompt({
        isSummaryPhase: true,
        sourceInstruction: 'The following note is the source material for the dialogue: @db.md',
      });

      expect(prompt).toContain('##SOCRATIC_SUMMARY##');
      expect(prompt).toContain('Do NOT ask any more questions');
      expect(prompt).toContain('@db.md');
    });
  });

  describe('Socratic prompts', () => {
    it('uses a source-grounded digital twin persona without contradictory first-response instructions', () => {
      const prompt = buildSocraticPrompt({ scopeInstruction: 'The current note: @note.md' });

      expect(prompt).toContain('Mark\'s digital teaching twin');
      expect(prompt).toContain('Korean AI 조교');
      expect(prompt).toContain('SOURCE BOUNDARY');
      expect(prompt).toContain('질문만 반복하지도 마세요');
      expect(prompt).toContain('START: Begin with a warm, brief greeting');
      expect(prompt).not.toContain('Your FIRST response should jump straight');
    });

    it('raises support level for stuck learners and lowers it for strong answers', () => {
      expect(inferSocraticSupportLevel(1, '모르겠어요')).toBe(2);
      expect(inferSocraticSupportLevel(2, '정답 알려줘')).toBe(3);
      expect(inferSocraticSupportLevel(2, 'CTE는 단일 문장 안에서만 유효하고 VIEW는 카탈로그에 저장되므로 세션과 팀 단위 재사용성에서 차이가 납니다. 그래서 일회성 가독성은 CTE, 반복 재사용과 권한 관리는 VIEW가 더 적합합니다.')).toBe(1);
    });

    it('detects indented summary markers', () => {
      expect(parseSocraticMeta('  ##SOCRATIC_SUMMARY##\n### 발견의 여정 요약')).toEqual({
        isSummary: true,
      });
    });
  });
});
