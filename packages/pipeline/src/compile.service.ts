import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@repo/database';
import { ensureDir, storage } from './storage.service';

function resolveBin(name: string): string {
  const onPath = Bun.which(name);
  if (onPath) return onPath;
  for (const p of [`/usr/bin/${name}`, `/usr/local/bin/${name}`]) {
    if (existsSync(p)) return p;
  }
  throw new Error(`${name} not found on host — run: apt install -y ffmpeg`);
}

async function run(bin: string, args: string[]) {
  const proc = Bun.spawn([bin, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

/** Metadata only — must never kill a render. Returns 0 if unreadable. */
export async function probeDuration(file: string): Promise<number> {
  try {
    const r = await run(resolveBin('ffprobe'), [
      '-v', 'quiet', '-print_format', 'json', '-show_format', file,
    ]);
    if (r.exitCode !== 0) return 0;
    return Number(JSON.parse(r.stdout).format?.duration ?? 0);
  } catch {
    return 0;
  }
}

/** Pure concat — no DB. All clips share codec settings (-qm), so stream copy is safe. */
export async function concatClips(clipPaths: string[], outPath: string): Promise<string> {
  await ensureDir(path.dirname(outPath));
  const listPath = outPath + '.txt';
  await Bun.write(listPath, clipPaths.map((p) => `file '${path.resolve(p)}'`).join('\n'));
  const r = await run(resolveBin('ffmpeg'), [
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outPath,
  ]);
  await unlink(listPath).catch(() => {});
  if (r.exitCode !== 0) {
    throw new Error('ffmpeg concat failed: ' + r.stderr.slice(-1500));
  }
  return outPath;
}

/** DB-aware: concat every rendered scene of a project and upsert the Video row. */
export async function compileProject(projectId: string): Promise<string> {
  const scenes = await prisma.scene.findMany({
    where: { projectId },
    orderBy: { index: 'asc' },
  });
  const clips = scenes.map((s) => s.clipPath).filter((p): p is string => !!p);
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
