'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ProjectStatusResponse, SceneInfo } from '@repo/shared';
import { API, api } from '../../../lib/api';

const ACTIVE = ['QUEUED', 'PLANNING', 'RENDERING', 'COMPILING'];

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getProject(id).then((p) => { setProject(p); setError(null); })
      .catch((e) => setError((e as Error).message));
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <main className="wrap"><p className="error">{error}</p><Link href="/">← Back</Link></main>;
  if (!project) return <main className="wrap"><p className="sub">Loading…</p></main>;

  const working = ACTIVE.includes(project.status);

  return (
    <main className="wrap">
      <span className="eyebrow"><Link href="/">manimate</Link> / project</span>
      <h1>{project.title}</h1>
      <div className="row">
        <span className="chip" data-s={project.status}>{project.status.toLowerCase()}</span>
        {working && <span className="sub" style={{ margin: 0 }}>{project.progress}%</span>}
      </div>
      <div className="bar"><div style={{ width: `${project.progress}%` }} /></div>

      {project.status === 'FAILED' && project.error && (
        <p className="error">Failed: {project.error}</p>
      )}

      {project.videoUrl && project.status === 'COMPLETED' && (
        <>
          <video controls src={`${API}${project.videoUrl}`} />
          <div className="row">
            <a className="btn ghost" href={`${API}${project.videoUrl}`} download>
              Download MP4
            </a>
          </div>
        </>
      )}

      <h2>Scenes</h2>
      <div className="plane">
        {project.scenes.length === 0 && <p className="sub" style={{ margin: 0 }}>Planning scenes…</p>}
        {project.scenes.map((s) => (
          <SceneCard key={s.index} projectId={project.id} scene={s} onQueued={load} />
        ))}
      </div>
    </main>
  );
}

function SceneCard({ projectId, scene, onQueued }: {
  projectId: string;
  scene: SceneInfo;
  onQueued: () => void;
}) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refine() {
    setBusy(true);
    setErr(null);
    try {
      await api.refineScene(projectId, scene.index, { instruction });
      setInstruction('');
      onQueued();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scene">
      <div className="scene-rail">S{scene.index}</div>
      <div>
        <h3>{scene.title} <span className="chip" data-s={scene.status}>{scene.status.toLowerCase()}</span></h3>
        <p className="desc">{scene.description}</p>

        {scene.clipUrl && <video controls preload="metadata" src={`${API}${scene.clipUrl}`} />}

        {scene.status === 'FAILED' && scene.lastError && (
          <details>
            <summary>Why it failed ({scene.attempts} attempts)</summary>
            <pre>{scene.lastError}</pre>
          </details>
        )}

        {scene.code && (
          <details>
            <summary>View Manim code</summary>
            <pre>{scene.code}</pre>
          </details>
        )}

        {(scene.status === 'RENDERED' || scene.status === 'FAILED') && (
          <div className="row">
            <input
              type="text"
              style={{ flex: 1, minWidth: 200 }}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder='e.g. "make the straight line blue and twice as wide"'
            />
            <button className="btn ghost" onClick={refine} disabled={busy || instruction.trim().length < 3}>
              {busy ? 'Queuing…' : 'Refine scene'}
            </button>
            {err && <span className="error">{err}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
