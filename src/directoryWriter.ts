import type { Language } from './i18n';

export type ProjectFileOutput = {
  rootName: string;
  files: Record<string, string>;
};

type LocalWritable = {
  write(data: string): Promise<void>;
  close(): Promise<void>;
};

type LocalFileHandle = {
  createWritable(): Promise<LocalWritable>;
};

type LocalDirectoryHandle = {
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<LocalDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<LocalFileHandle>;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<LocalDirectoryHandle>;
};

export class DirectoryOutputError extends Error {
  constructor(public readonly code: 'UNSUPPORTED' | 'DIRECTORY_EXISTS' | 'CANCELLED' | 'WRITE_FAILED', message: string) {
    super(message);
    this.name = 'DirectoryOutputError';
  }
}

async function directoryExists(parent: LocalDirectoryHandle, name: string) {
  try {
    await parent.getDirectoryHandle(name);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return false;
    throw error;
  }
}

async function ensureDirectory(root: LocalDirectoryHandle, segments: string[]) {
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}

export async function selectDirectoryAndWriteProject(output: ProjectFileOutput, language: Language = 'en') {
  const l = (english: string, chinese: string) => language === 'en' ? english : chinese;
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) {
    throw new DirectoryOutputError('UNSUPPORTED', l(
      'This browser cannot write to a selected directory. Use the latest Chrome, Edge, or another Chromium browser.',
      '当前浏览器不支持目录写入，请使用最新版 Chrome、Edge 或其他 Chromium 浏览器。',
    ));
  }

  let selectedDirectory: LocalDirectoryHandle;
  try {
    selectedDirectory = await picker.call(window, { mode: 'readwrite' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new DirectoryOutputError('CANCELLED', l('Directory selection was cancelled.', '已取消目录选择。'));
    }
    throw new DirectoryOutputError('WRITE_FAILED', error instanceof Error ? error.message : l('Could not access the selected directory.', '无法访问所选目录。'));
  }

  if (await directoryExists(selectedDirectory, output.rootName)) {
    throw new DirectoryOutputError(
      'DIRECTORY_EXISTS',
      l(
        `A folder named “${output.rootName}” already exists in the selected location. No files were written, protecting the existing source.`,
        `所选位置已存在“${output.rootName}”目录。为保护已有源码，本次没有写入任何文件。`,
      ),
    );
  }

  try {
    const projectDirectory = await selectedDirectory.getDirectoryHandle(output.rootName, { create: true });
    const entries = Object.entries(output.files).sort(([left], [right]) => left.localeCompare(right));

    for (const [path, content] of entries) {
      const segments = path.split('/').filter(Boolean);
      const fileName = segments.pop();
      if (!fileName) continue;
      const directory = await ensureDirectory(projectDirectory, segments);
      const fileHandle = await directory.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
    }

    return {
      directoryName: selectedDirectory.name,
      projectDirectoryName: output.rootName,
      fileCount: entries.length,
    };
  } catch (error) {
    throw new DirectoryOutputError(
      'WRITE_FAILED',
      l(
        `Failed to write source files: ${error instanceof Error ? error.message : 'unknown error'}.`,
        `源码写入失败：${error instanceof Error ? error.message : '未知错误'}。`,
      ),
    );
  }
}
