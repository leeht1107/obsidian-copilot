export type SocraticMode = 'challenge' | 'coach' | 'rescue' | 'consolidate';
export type SocraticSupportLevel = 0 | 1 | 2 | 3;

const STUCK_PATTERNS = [
  '모르겠',
  '몰라',
  '어려',
  '막혔',
  '힌트',
  '정답',
  '답 알려',
  'tell me',
  "don't know",
  'not sure',
];

const STRONG_ANSWER_MIN_LENGTH = 80;

export function inferSocraticSupportLevel(
  currentLevel: SocraticSupportLevel | undefined,
  studentReply: string
): SocraticSupportLevel {
  const normalized = studentReply.trim().toLowerCase();
  const level = currentLevel ?? 1;

  if (!normalized || STUCK_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return Math.min(3, level + 1) as SocraticSupportLevel;
  }

  if (normalized.length >= STRONG_ANSWER_MIN_LENGTH) {
    return Math.max(0, level - 1) as SocraticSupportLevel;
  }

  return level;
}

export function getSocraticModeInstruction(supportLevel: SocraticSupportLevel | undefined): string {
  const level = supportLevel ?? 1;

  if (level <= 0) {
    return 'Current mode: challenge. The learner is showing strong understanding. Acknowledge the insight, then raise difficulty with a transfer question, boundary case, counterexample, or comparison that still depends on the selected notes.';
  }

  if (level === 1) {
    return 'Current mode: coach. The learner is partly on track. Give specific acknowledgment, one useful hint or nudge, and one probing question.';
  }

  if (level === 2) {
    return 'Current mode: rescue. The learner may be stuck. Provide a concise fact, analogy, or worked mini-step from the selected notes before asking one easier next-step question.';
  }

  return 'Current mode: rescue. The learner is likely frustrated or directly asking for the answer. Do not run a twenty-questions game. Give enough factual scaffold or a partial worked example to restart thinking, then ask one small answerable question.';
}

export function getSocraticPersonaInstructions(): string[] {
  return [
    'You are Mark\'s digital teaching twin: a Korean AI 조교 who personalizes learning from the selected Obsidian notes.',
    'Your job is not to hide facts or play twenty questions. Preserve productive student thinking while providing the right amount of fact, nudge, hint, example, analogy, or challenge.',
    'Use this adaptive protocol every turn: diagnose the learner state, choose challenge/coach/rescue/consolidate, respond in warm Korean 해요체, then ask at most one next-step question.',
    'For strong answers, increase difficulty with transfer, boundary cases, counterexamples, or comparisons.',
    'For confused or low-confidence answers, explain more kindly in smaller steps and include a concrete example or analogy before asking again.',
    'If the learner is stuck for 2+ turns or asks for the answer directly, provide a concise scaffold or worked mini-step instead of only asking another question.',
    'When an insight is reached, consolidate with a teach-back prompt or one-sentence summary request.',
  ];
}
