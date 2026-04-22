const LAST_FOLDER_NAME_KEY = 'brainstorm:local-docs-folder-name';

interface BrowserFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

interface BrowserDirectoryHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<BrowserDirectoryHandle | BrowserFileHandle>;
}

interface FileSystemAccessWindow extends Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<BrowserDirectoryHandle>;
}

const SEARCHABLE_EXTENSIONS = new Set([
  '.md',
  '.mdx',
  '.txt',
  '.text',
  '.rst',
  '.html',
  '.htm',
  '.json',
  '.yaml',
  '.yml',
  '.csv',
]);

let directoryHandle: BrowserDirectoryHandle | null = null;

export interface LocalDocSearchState {
  supported: boolean;
  folderName: string | null;
  authorized: boolean;
  requiresReauthorize: boolean;
}

export interface LocalDocSearchHit {
  id: string;
  title: string;
  path: string;
  snippet: string;
  rawText: string;
  score: number;
}

export function getLocalDocSearchState(): LocalDocSearchState {
  const supported = typeof window !== 'undefined' && typeof (window as FileSystemAccessWindow).showDirectoryPicker === 'function';
  const folderName = readLastFolderName();
  return {
    supported,
    folderName,
    authorized: supported && directoryHandle !== null,
    requiresReauthorize: supported && directoryHandle === null && !!folderName,
  };
}

export async function authorizeLocalDocsDirectory(): Promise<LocalDocSearchState> {
  const picker = typeof window === 'undefined'
    ? undefined
    : (window as FileSystemAccessWindow).showDirectoryPicker;
  if (typeof picker !== 'function') {
    throw new Error('This browser does not support the File System Access API.');
  }

  directoryHandle = await picker({ mode: 'read' });
  writeLastFolderName(directoryHandle.name);
  return getLocalDocSearchState();
}

export function clearLocalDocsDirectory(): LocalDocSearchState {
  directoryHandle = null;
  return getLocalDocSearchState();
}

export async function searchLocalDocs(
  query: string,
  options: { limit?: number } = {},
): Promise<LocalDocSearchHit[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];
  if (!directoryHandle) {
    throw new Error('Choose a local docs folder first.');
  }

  const hits: LocalDocSearchHit[] = [];
  const limit = Math.max(1, options.limit ?? 8);

  try {
    await walkDirectory(directoryHandle, '', async (fileHandle, relativePath) => {
      if (hits.length >= limit) return true;
      if (!isSearchableFile(relativePath)) return false;

      const file = await fileHandle.getFile();
      const rawText = await file.text();
      const match = scoreText(rawText, normalizedQuery);
      if (!match) return false;

      hits.push({
        id: `${relativePath}:${match.index}`,
        title: firstNonEmptyLine(rawText) ?? file.name,
        path: relativePath,
        snippet: buildSnippet(rawText, match.index, normalizedQuery.length),
        rawText,
        score: match.score,
      });

      return hits.length >= limit;
    });
  } catch (err) {
    if (isPermissionError(err)) {
      clearLocalDocsDirectory();
      throw new Error('Folder access expired. Re-authorize the local docs folder and run the search again.');
    }
    throw err;
  }

  return hits.sort((left, right) => right.score - left.score);
}

async function walkDirectory(
  handle: BrowserDirectoryHandle,
  prefix: string,
  visitFile: (fileHandle: BrowserFileHandle, relativePath: string) => Promise<boolean>,
): Promise<boolean> {
  for await (const entry of handle.values()) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') {
      if (await walkDirectory(entry, relativePath, visitFile)) {
        return true;
      }
      continue;
    }

    if (await visitFile(entry, relativePath)) {
      return true;
    }
  }

  return false;
}

function firstNonEmptyLine(text: string): string | null {
  const line = text
    .split(/\r?\n/)
    .map(value => value.trim())
    .find(Boolean);
  return line ?? null;
}

function isSearchableFile(path: string): boolean {
  const lower = path.toLowerCase();
  return Array.from(SEARCHABLE_EXTENSIONS).some(ext => lower.endsWith(ext));
}

function scoreText(text: string, normalizedQuery: string): { index: number; score: number } | null {
  const normalizedText = text.toLowerCase();
  const index = normalizedText.indexOf(normalizedQuery);
  if (index === -1) return null;

  let count = 0;
  let cursor = index;
  while (cursor !== -1) {
    count += 1;
    cursor = normalizedText.indexOf(normalizedQuery, cursor + normalizedQuery.length);
  }

  return {
    index,
    score: count * 1000 - index,
  };
}

function buildSnippet(text: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - 90);
  const end = Math.min(text.length, matchIndex + matchLength + 120);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
}

function readLastFolderName(): string | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(LAST_FOLDER_NAME_KEY);
}

function writeLastFolderName(folderName: string): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  window.localStorage.setItem(LAST_FOLDER_NAME_KEY, folderName);
}

function isPermissionError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
}
