import type { QuizQuestionMeta, QuizQuestionOption, SocraticTurnMeta } from '../types';

export function parseSocraticMeta(content: string): SocraticTurnMeta | undefined {
  if (!/^\s*##SOCRATIC_SUMMARY##/m.test(content)) return undefined;
  return { isSummary: true };
}

export function parseQuizQuestionMeta(content: string): QuizQuestionMeta | undefined {
  const headerMatch = content.match(/^##\s*(\d+)\s*\/\s*(\d+)번 문제/im);
  if (!headerMatch) {
    return undefined;
  }

  const options = Array.from(content.matchAll(/^([A-Z])\.\s+(.+)$/gm)).map<QuizQuestionOption>((match) => ({
    label: match[1],
    text: match[2].trim(),
  }));

  const freeText = options.length === 0 && /\(자유 서술\)|답안 형식:\s*(?:자유 서술|단답|서술|직접 입력)/i.test(content);

  if (options.length === 0 && !freeText) {
    return undefined;
  }

  const multiSelect = /\(복수 선택 가능\)|복수 선택 가능|답안 형식:\s*[A-Z](?:\s*,\s*[A-Z])+/i.test(content);
  return {
    current: Number(headerMatch[1]),
    total: Number(headerMatch[2]),
    multiSelect,
    freeText,
    options,
  };
}

export function normalizeQuizMarkdown(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\n+\(정답을 입력해 주세요[^\n]*\)/g, '');
  const lines = normalized.split('\n');
  const headerIndex = lines.findIndex((line) => /^##\s*\d+\s*\/\s*\d+번 문제$/i.test(line.trim()));
  if (headerIndex === -1) {
    return normalized;
  }

  let cursor = headerIndex + 1;
  while (cursor < lines.length && lines[cursor].trim() === '') {
    cursor += 1;
  }
  while (cursor < lines.length && (/^####\s*문제$/i.test(lines[cursor].trim()) || lines[cursor].trim() === '문제')) {
    cursor += 1;
  }
  while (cursor < lines.length && lines[cursor].trim() === '') {
    cursor += 1;
  }

  const questionLine = lines[cursor] ?? '';
  let questionHeading: string;
  if (questionLine.startsWith('#')) {
    questionHeading = questionLine;
    cursor += 1;
  } else if (questionLine.trim()) {
    questionHeading = `#### ${questionLine.trim()}`;
    cursor += 1;
  } else {
    questionHeading = '';
  }

  const rebuilt = [
    ...lines.slice(0, headerIndex + 1),
    '',
    questionHeading,
    ...lines.slice(cursor),
  ];

  return rebuilt.join('\n');
}
