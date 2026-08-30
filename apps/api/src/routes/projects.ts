import { Hono } from 'hono';
import { prisma } from '@repo/database';
import { defaultJobOpts, generateQueue, refineQueue } from '@repo/queue';
import type {
  CreateProjectRequest,
  ProjectStatusResponse,
  ProjectSummary,
  RefineSceneRequest,
} from '@repo/shared';

export const projects = new Hono();

projects.post('/', async (c) => {
  const body = await c.req.json<CreateProjectRequest>().catch(() => null);
  const prompt = body?.prompt?.trim() ?? '';
  if (prompt.length < 3) return c.json({ error: 'Describe the video you want.' }, 400);
  if (prompt.length > 2000) return c.json({ error: 'Prompt too long (2000 char limit).' }, 400);

  const project = await prisma.project.create({
    data: { title: body?.title?.trim() || prompt.slice(0, 60), prompt },
  });
  await generateQueue.add('generate', { projectId: project.id }, defaultJobOpts);

  return c.json({ id: project.id, status: 'QUEUED' }, 202);
});

projects.get('/', async (c) => {
  const rows = await prisma.project.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
  const out: ProjectSummary[] = rows.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    progress: p.progress,
    createdAt: p.createdAt.toISOString(),
  }));
  return c.json(out);
});

projects.get('/:id', async (c) => {
  const project = await prisma.project.findUnique({
    where: { id: c.req.param('id') },
    include: { scenes: { orderBy: { index: 'asc' } }, video: true },
  });
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const res: ProjectStatusResponse = {
    id: project.id,
    title: project.title,
    prompt: project.prompt,
    status: project.status,
    progress: project.progress,
    error: project.error,
    scenes: project.scenes.map((s) => ({
      index: s.index,
      title: s.title,
      description: s.description,
      status: s.status,
      attempts: s.attempts,
      durationSec: s.durationSec,
      lastError: s.lastError,
      code: s.code,
      clipUrl:
        s.status === 'RENDERED'
          ? `/api/projects/${project.id}/scenes/${s.index}/clip`
          : null,
    })),
    videoUrl: project.video ? `/api/projects/${project.id}/video` : null,
  };
  return c.json(res);
});

projects.get('/:id/video', async (c) => {
  const video = await prisma.video.findUnique({ where: { projectId: c.req.param('id') } });
  if (!video) return c.json({ error: 'Video not ready' }, 404);
  return new Response(Bun.file(video.path)); // streams; Range supported → seeking works
});

projects.get('/:id/scenes/:index/clip', async (c) => {
  const scene = await prisma.scene.findUnique({
    where: {
      projectId_index: {
        projectId: c.req.param('id'),
        index: Number(c.req.param('index')),
      },
    },
  });
  if (!scene?.clipPath) return c.json({ error: 'Clip not ready' }, 404);
  return new Response(Bun.file(scene.clipPath));
});

projects.post('/:id/scenes/:index/refine', async (c) => {
  const body = await c.req.json<RefineSceneRequest>().catch(() => null);
  const instruction = body?.instruction?.trim() ?? '';
  if (instruction.length < 3) return c.json({ error: 'Say what to change.' }, 400);

  const projectId = c.req.param('id');
  const sceneIndex = Number(c.req.param('index'));
  const scene = await prisma.scene.findUnique({
    where: { projectId_index: { projectId, index: sceneIndex } },
  });
  if (!scene) return c.json({ error: 'Scene not found' }, 404);

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'RENDERING', progress: 50, error: null },
  });
  await refineQueue.add('refine', { projectId, sceneIndex, instruction }, defaultJobOpts);

  return c.json({ ok: true, status: 'QUEUED' }, 202);
});
