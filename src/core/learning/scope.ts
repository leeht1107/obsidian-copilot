export type LearningScope = 'current-note' | 'note' | 'folder';

export function getBasename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

export function summarizeSelectedNotes(paths: string[]): string {
  if (paths.length === 0) return '노트 0개';
  const names = paths.map(getBasename);
  if (names.length === 1) return `노트 · ${names[0]}`;
  if (names.length === 2) return `노트 2개 · ${names[0]}, ${names[1]}`;
  return `노트 ${names.length}개 · ${names[0]}, ${names[1]} 외 ${names.length - 2}개`;
}

export function summarizeFolder(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts.slice(-2).join('/') || normalized;
}

export function getSubjectRoot(activeFilePath: string | null): string | null {
  if (!activeFilePath || !activeFilePath.includes('/')) {
    return null;
  }

  const segments = activeFilePath.split('/').slice(0, -1);
  const subjectSegments = segments.slice(0, Math.min(3, segments.length));
  return subjectSegments.length > 0 ? subjectSegments.join('/') : null;
}

export function getFolderNotePaths(notePaths: string[], selectedFolders: string[]): string[] {
  return notePaths
    .filter((notePath) => selectedFolders.some((folder) => notePath.startsWith(`${folder}/`)))
    .sort();
}
