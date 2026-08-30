import { $ } from 'bun';
import path from 'node:path';
import { prisma } from '@repo/database';
import { ensureDir, storage } from './storage.service';

export async function probeDuration(file: string): Promise<number> {
  const meta = await $`ffprobe -v quiet -print_format json -show_format ${file}`.json();
  return Number(meta.format?.duration ?? 0);
}

/** Pure concat — no DB. All clips share codec settings (-qm), so stream copy is safe. */
export async function concatClips(clipPaths: string[], outPath: string): Promise<string> {
  await ensureDir(path.dirname(outPath));
  const listPath = outPath + '.txt';
  await Bun.write(listPath, clipPaths.map((p) => `file '${path.resolve(p)}'`).join('\n'));
  await $`ffmpeg -y -f concat -safe 0 -i ${listPath} -c copy ${outPath}`.quiet();
  await $`rm -f ${listPath}`;
  return outPath;
}

/** DB-aware: concat every rendered scene of a project and upsert the Video row. */
export async function compileProject(projectId: string): Promise<string> {
  const scenes = await prisma.scene.findMany({
    where: { projectId },
    orderBy: { index: 'asc' },
  });
  const clips = scenes.map((s  : any) => s.clipPath).filter((p : any): p is string => !!p);
  if (clips.length === 0 || clips.length !== scenes.length) {
    throw new Error('cannot compile: not every scene has a rendered clip');
  }

  const outPath = await concatClips(clips, storage.videoPath(projectId));
  const durationSec = await probeDuration(outPath);
  const sizeBytes = Bun.file(outPath).size;

  await prisma.video.upsert({
    where: { projectId },
    create: { projectId, path: outPath, durationSec, sizeBytes },
    update: { path: outPath, durationSec, sizeBytes },
  });
  return outPath;
}
