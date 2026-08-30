import type {
  CreateProjectRequest,
  ProjectStatusResponse,
  ProjectSummary,
  RefineSceneRequest,
} from '@repo/shared';

export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  createProject: (body: CreateProjectRequest) =>
    fetch(`${API}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => j<{ id: string }>(r)),

  listProjects: () => fetch(`${API}/api/projects`).then((r) => j<ProjectSummary[]>(r)),

  getProject: (id: string) =>
    fetch(`${API}/api/projects/${id}`, { cache: 'no-store' }).then((r) =>
      j<ProjectStatusResponse>(r),
    ),

  refineScene: (id: string, index: number, body: RefineSceneRequest) =>
    fetch(`${API}/api/projects/${id}/scenes/${index}/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => j<{ ok: boolean }>(r)),
};
