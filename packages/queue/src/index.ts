import { Queue } from 'bullmq';

export const QUEUE = {
  GENERATE: 'video-generation',
  REFINE: 'scene-refine',
} as const;

export const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

export type GenerateJobData = { projectId: string };
export type RefineJobData = { projectId: string; sceneIndex: number; instruction: string };

export const generateQueue = new Queue<GenerateJobData>(QUEUE.GENERATE, { connection });
export const refineQueue = new Queue<RefineJobData>(QUEUE.REFINE, { connection });

export const defaultJobOpts = {
  attempts: 2,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const;
