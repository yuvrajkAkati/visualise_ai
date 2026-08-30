import { Worker } from 'bullmq';
import { prisma } from '@repo/database';
import {
  applyRefinement,
  cleanupTmp,
  compileProject,
  ensureSceneRendered,
  planScenes,
} from '@repo/pipeline';
import { QUEUE, connection, type GenerateJobData, type RefineJobData } from '@repo/queue';

async function setProject(id: string, status: string, progress: number) {
  await prisma.project.update({
    where: { id },
    data: { status: status as never, progress },
  });
}

new Worker<GenerateJobData>(
  QUEUE.GENERATE,
  async (job) => {
    const { projectId } = job.data;
    try {
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        include: { scenes: true },
      });

      // 1. Plan (skipped on retry if scenes already exist — idempotent)
      if (project.scenes.length === 0) {
        await setProject(projectId, 'PLANNING', 5);
        const plan = await planScenes(project.prompt);
        await prisma.scene.createMany({
          data: plan.map((s, index) => ({
            projectId,
            index,
            title: s.title,
            description: s.description,
          })),
        });
      }

      // 2. Codegen + sandboxed render + self-correction, scene by scene
      await setProject(projectId, 'RENDERING', 10);
      const scenes = await prisma.scene.findMany({
        where: { projectId },
        orderBy: { index: 'asc' },
      });
      for (const [i, scene] of scenes.entries()) {
        await ensureSceneRendered(scene.id);
        await setProject(projectId, 'RENDERING', 10 + Math.round(80 * ((i + 1) / scenes.length)));
      }

      // 3. Concat
      await setProject(projectId, 'COMPILING', 92);
      await compileProject(projectId);
      await cleanupTmp(projectId);
      await setProject(projectId, 'COMPLETED', 100);
    } catch (err) {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'FAILED', error: String((err as Error).message).slice(0, 800) },
      });
      throw err; // let BullMQ count the attempt
    }
  },
  { connection, concurrency: 1 }, // docker + ffmpeg are CPU-bound; scale with more workers
);

new Worker<RefineJobData>(
  QUEUE.REFINE,
  async (job) => {
    const { projectId, sceneIndex, instruction } = job.data;
    try {
      const scene = await prisma.scene.findUniqueOrThrow({
        where: { projectId_index: { projectId, index: sceneIndex } },
      });
      await setProject(projectId, 'RENDERING', 50);
      await applyRefinement(scene.id, instruction);
      await setProject(projectId, 'COMPILING', 92);
      await compileProject(projectId);
      await cleanupTmp(projectId);
      await setProject(projectId, 'COMPLETED', 100);
    } catch (err) {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'FAILED', error: String((err as Error).message).slice(0, 800) },
      });
      throw err;
    }
  },
  { connection, concurrency: 1 },
);

console.log('[worker] listening on queues:', QUEUE.GENERATE, '+', QUEUE.REFINE);
