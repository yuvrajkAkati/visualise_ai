export type ProjectStatus =
  | 'QUEUED' | 'PLANNING' | 'RENDERING' | 'COMPILING' | 'COMPLETED' | 'FAILED';

export type SceneStatus =
  | 'PENDING' | 'GENERATING' | 'RENDERING' | 'RENDERED' | 'FAILED';

export interface CreateProjectRequest {
  prompt: string;
  title?: string;
}

export interface RefineSceneRequest {
  instruction: string;
}

export interface SceneInfo {
  index: number;
  title: string;
  description: string;
  status: SceneStatus;
  attempts: number;
  durationSec: number | null;
  lastError: string | null;
  code: string | null;
  clipUrl: string | null;
}

export interface ProjectSummary {
  id: string;
  title: string;
  status: ProjectStatus;
  progress: number;
  createdAt: string;
}

export interface ProjectStatusResponse {
  id: string;
  title: string;
  prompt: string;
  status: ProjectStatus;
  progress: number;
  error: string | null;
  scenes: SceneInfo[];
  videoUrl: string | null;
}
