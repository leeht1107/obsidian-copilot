import {
  buildQuizContinuationPrompt,
  buildSocraticContinuationPrompt,
  buildSocraticPrompt,
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
      expect(buildQuizContinuationPrompt(1, 3)).toContain('All output must be in Korean');
      expect(buildQuizContinuationPrompt(3, 3)).toContain('All output must be in Korean');
    });

    it('keeps Socratic continuations constrained to Korean', () => {
      expect(buildSocraticContinuationPrompt(false)).toContain('All output must be in Korean');
      expect(buildSocraticContinuationPrompt(true)).toContain('All output must be in Korean');
    });
  });

  describe('Socratic prompts', () => {
    it('does not include contradictory first-response instructions', () => {
      const prompt = buildSocraticPrompt({ scopeInstruction: 'The current note: @note.md' });

      expect(prompt).toContain('START: Begin with a warm, brief greeting');
      expect(prompt).not.toContain('Your FIRST response should jump straight');
    });

    it('detects indented summary markers', () => {
      expect(parseSocraticMeta('  ##SOCRATIC_SUMMARY##\n### 발견의 여정 요약')).toEqual({
        isSummary: true,
      });
    });
  });
});
