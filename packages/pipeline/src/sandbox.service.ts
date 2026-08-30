// packages/pipeline/src/sandbox.service.ts
// Runs LLM-written (untrusted) Manim code inside a locked-down container.

import { existsSync } from 'node:fs';
import { chmod } from 'node:fs/promises';
import path from 'node:path';
import { ensureDir } from './storage.service';

const IMAGE = process.env.MANIM_IMAGE ?? 'manimcommunity/manim:v0.19.0';
const TIMEOUT = Number(process.env.RENDER_TIMEOUT_SEC ?? 180);

const DOCKER_CANDIDATES = [
  '/usr/bin/docker',
  '/usr/local/bin/docker',
  '/mnt/wsl/docker-desktop/cli-tools/usr/bin/docker',
];

function resolveDocker(): string {
  const onPath = Bun.which('docker');
  if (onPath) return onPath;
  for (const p of DOCKER_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    'docker CLI not reachable. Start Docker Desktop (wait for "Engine running"), ' +
      'check Settings > Resources > WSL Integration is ON, open a NEW terminal, retry.',
  );
}

export type RenderResult =
  | { ok: true; clipPath: string }
  | { ok: false; stderr: string };

export async function renderManim(code: string, workDir: string): Promise<RenderResult> {
  const docker = resolveDocker();

  await ensureDir(workDir);
  await chmod(workDir, 0o777);
  await Bun.write(path.join(workDir, 'scene.py'), code);

  const args = [
    'run', '--rm', '--network=none',
    '--cpus=2', '--memory=2g', '--pids-limit=256',
    '--user', '0:0',
    '-v', `${path.resolve(workDir)}:/manim`,
    IMAGE,
    'timeout', String(TIMEOUT),
    'manim', '-qm', '--disable_caching', '-o', 'clip.mp4', 'scene.py', 'GeneratedScene',
  ];

  const proc = Bun.spawn([docker, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  if (exitCode !== 0) {
    const out = (stderr + '\n' + stdout).trim();
    const tail = out.slice(-4000) || `render exited with code ${exitCode}`;
    const note = exitCode === 124 ? `\n[render timed out after ${TIMEOUT}s]` : '';
    return { ok: false, stderr: tail + note };
  }

  const glob = new Bun.Glob('media/videos/**/*.mp4');
  const found: string[] = [];
  for await (const rel of glob.scan({ cwd: workDir })) found.push(rel);
  const best =
    found.find((f) => f.endsWith('clip.mp4')) ??
    found.find((f) => !f.includes('partial_movie_files')) ??
    found[0];
  if (best) return { ok: true, clipPath: path.join(workDir, best) };
  return { ok: false, stderr: 'render reported success but produced no mp4' };
}
