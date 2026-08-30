import { copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { prisma, type Scene } from '@repo/database';
import { fixSceneCode, generateSceneCode, refineSceneCode, type ChatMsg } from './codegen.service';
import { probeDuration } from './compile.service';
import { renderManim } from './sandbox.service';
import { ensureDir, storage } from './storage.service';

const MAX_ATTEMPTS = Number(process.env.MAX_FIX_ATTEMPTS ?? 3);

/**
 * The heart of the product: render, and on failure feed stderr + code back to the
 * LLM for a corrected file, up to MAX_ATTEMPTS times. Persists code, attempts,
 * lastError, and the chat history on the Scene row as it goes.
 */
async function renderLoop(scene: Scene, code: string, history: ChatMsg[]): Promise<void> {
  let currentCode = code;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await prisma.scene.update({
      where: { id: scene.id },
      data: { status: 'RENDERING', code: currentCode, attempts: attempt, messages: history as object[] },
    });

    const workDir = storage.tmpDir(scene.projectId, `s${scene.index}-a${attempt}`);
    const result = await renderManim(currentCode, workDir);

    if (result.ok) {
      const dest = storage.clipPath(scene.projectId, scene.index);
      await ensureDir(path.dirname(dest));
      await copyFile(result.clipPath, dest);
      const durationSec = await probeDuration(dest);
      await prisma.scene.update({
        where: { id: scene.id },
        data: {
          status: 'RENDERED',
          clipPath: dest,
          durationSec,
          lastError: null,
          messages: history as object[],
        },
      });
      await rm(workDir, { recursive: true, force: true });
      return;
    }

    await prisma.scene.update({
      where: { id: scene.id },
      data: { lastError: result.stderr },
    });

    if (attempt < MAX_ATTEMPTS) {
      currentCode = await fixSceneCode(currentCode, result.stderr);
      history.push(
        { role: 'user', content: `Render failed. stderr tail:\n${result.stderr.slice(-1500)}` },
        { role: 'assistant', content: currentCode },
      );
    }
  }

  await prisma.scene.update({ where: { id: scene.id }, data: { status: 'FAILED' } });
  throw new Error(`Scene ${scene.index} failed after ${MAX_ATTEMPTS} attempts`);
}

/** Generate code (if needed) and render one scene. Skips scenes already RENDERED. */
export async function ensureSceneRendered(sceneId: string): Promise<void> {
  const scene = await prisma.scene.findUniqueOrThrow({ where: { id: sceneId } });
  if (scene.status === 'RENDERED' && scene.clipPath && (await Bun.file(scene.clipPath).exists())) {
    return;
  }

  let history = (scene.messages as ChatMsg[]) ?? [];
  let code = scene.code;

  if (!code) {
    await prisma.scene.update({ where: { id: scene.id }, data: { status: 'GENERATING' } });
    code = await generateSceneCode(scene.description);
    history = [
      { role: 'user', content: scene.description },
      { role: 'assistant', content: code },
    ];
  }

  await renderLoop(scene, code, history);
}

/** Reprompt one scene ("make the rectangle blue"), re-render it with the fix loop. */
export async function applyRefinement(sceneId: string, instruction: string): Promise<void> {
  const scene = await prisma.scene.findUniqueOrThrow({ where: { id: sceneId } });
  const history = ((scene.messages as ChatMsg[]) ?? []).slice(-12); // keep context bounded

  await prisma.scene.update({ where: { id: scene.id }, data: { status: 'GENERATING' } });
  const code = await refineSceneCode(history, instruction);
  history.push({ role: 'user', content: instruction }, { role: 'assistant', content: code });

  await renderLoop(scene, code, history);
}
