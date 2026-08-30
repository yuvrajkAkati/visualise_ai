# Manimate

Prompt → LLM-written Manim script → sandboxed render → video. Multi-scene, with per-scene refinement ("make the rectangle blue") that re-renders only that scene.

## Architecture (one paragraph)

The Hono API validates a prompt, writes a `Project` row, enqueues a BullMQ job, and returns `202`. A Bun worker plans scenes with Claude, generates Manim code per scene, renders each scene inside a locked-down Docker container (`--network=none`, CPU/memory caps, timeout), feeds render stderr back to the LLM for up to `MAX_FIX_ATTEMPTS` self-corrections, then concatenates clips with FFmpeg. The Next.js app polls status and shows per-scene previews with a refine box. LLM-generated code is untrusted — it only ever executes inside the sandbox container.

## Prerequisites

- Bun 1.2+
- Docker (for Postgres, Redis, and the Manim sandbox)
- FFmpeg + ffprobe on the host (used for concat + duration probing)

## Quickstart

```bash
bun install
cp .env.example .env            # add your ANTHROPIC_API_KEY
docker compose up -d            # postgres + redis
docker pull manimcommunity/manim:v0.19.0   # pre-pull the sandbox image
bun run db:migrate              # answer the prisma prompts (name: init)
```

**Milestone first — prove the pipeline with no servers:**

```bash
bun run pipeline:test "a blue rectangle appears, then morphs into a circle"
# → prints the path to an MP4 when it works
```

Then run the whole app:

```bash
bun run dev                     # web :3000 · api :4000 · worker
```

## Repo map

- `apps/web` — Next.js UI: prompt in, scene timeline + previews, refine per scene
- `apps/api` — Hono: validate → persist → enqueue → 202; serves clips/videos
- `apps/worker` — BullMQ consumers: generate-video + scene-refine pipelines
- `packages/pipeline` — codegen (plan/generate/fix/refine prompts), Docker sandbox runner, FFmpeg concat
- `packages/database` — Prisma schema + client singleton
- `packages/queue` — queue names, connection, typed job payloads
- `packages/shared` — API DTO types shared by web + api

## Notes & roadmap

- **Single-host v1:** api + worker share `storage/` on one machine. The worker shells out to `docker`, so in production either mount the Docker socket or swap `sandbox.service.ts` for Modal/E2B.
- No auth yet (deliberate, to reach the magic moment fast). Add Hono JWT middleware + a `User` model when you need it.
- Later: xfade transitions, voiceover via `manim-voiceover` (extend `sandbox/Dockerfile`), scene reordering, WebSocket progress instead of polling.
