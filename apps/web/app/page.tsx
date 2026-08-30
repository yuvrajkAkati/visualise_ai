'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProjectSummary } from '@repo/shared';
import { api } from '../lib/api';

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<ProjectSummary[]>([]);

  useEffect(() => {
    api.listProjects().then(setRecent).catch(() => setRecent([]));
  }, []);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.createProject({ prompt });
      router.push(`/projects/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <span className="eyebrow">text → manim → video</span>
      <h1>Describe it. Watch it drawn.</h1>
      <p className="sub">
        One prompt in. Claude writes the Manim scenes, a sandbox renders them, FFmpeg
        stitches the video. Refine any scene afterwards.
      </p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="A blue rectangle appears, then morphs into a circle"
        maxLength={2000}
      />
      <div className="row">
        <button className="btn" onClick={generate} disabled={busy || prompt.trim().length < 3}>
          {busy ? 'Starting…' : 'Generate video'}
        </button>
        {error && <span className="error">{error}</span>}
      </div>

      {recent.length > 0 && (
        <>
          <h2>Recent videos</h2>
          <ul className="plist">
            {recent.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`}>{p.title}</Link>
                <span className="chip" data-s={p.status}>{p.status.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
