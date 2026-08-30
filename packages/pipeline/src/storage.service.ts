import path from 'node:path';
import { mkdir, rm } from 'node:fs/promises';

// Default resolves to <repo>/storage no matter which app's cwd we run under.
const ROOT = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.resolve(import.meta.dir, '../../../storage');

export const storage = {
  root: ROOT,
  tmpDir: (projectId: string, label: string) => path.join(ROOT, 'tmp', projectId, label),
  clipPath: (projectId: string, index: number) =>
    path.join(ROOT, 'clips', projectId, `scene-${index}.mp4`),
  videoPath: (projectId: string) => path.join(ROOT, 'videos', `${projectId}.mp4`),
};

export async function ensureDir(p: string) {
  await mkdir(p, { recursive: true });
  return p;
}

export async function cleanupTmp(projectId: string) {
  await rm(path.join(ROOT, 'tmp', projectId), { recursive: true, force: true });
}
