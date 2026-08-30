/**
 * Week-2 milestone: prove prompt → plan → codegen → sandbox render → concat
 * with NO database, NO queue, NO servers. Just Docker + ffmpeg + an API key.
 *
 *   bun run pipeline:test "a blue rectangle appears, then morphs into a circle"
 */
import path from 'node:path';
import {
  concatClips,
  fixSceneCode,
  generateSceneCode,
  planScenes,
  renderManim,
  storage,
} from '@repo/pipeline';

const prompt =
  process.argv.slice(2).join(' ') ||
  'a blue straight line appears, then morphs into a circle';
const MAX = Number(process.env.MAX_FIX_ATTEMPTS ?? 3);

console.log(`\n▶ prompt: ${prompt}\n`);
const plan = await planScenes(prompt);
console.log(`▶ planned ${plan.length} scene(s): ${plan.map((s) => s.title).join(' · ')}\n`);

const clips: string[] = [];
for (const [i, scene] of plan.entries()) {
  let code = await generateSceneCode(scene.description);
  let done = false;
  for (let attempt = 1; attempt <= MAX && !done; attempt++) {
    console.log(`  scene ${i} · attempt ${attempt} · rendering...`);
    const dir = storage.tmpDir('cli', `s${i}-a${attempt}`);
    const result = await renderManim(code, dir);
    if (result.ok) {
      clips.push(result.clipPath);
      console.log(`  scene ${i} ✔ rendered`);
      done = true;
    } else {
      console.log(`  scene ${i} ✘ failed — asking the LLM to fix it`);
      console.log(result.stderr.split('\n').slice(-6).join('\n'));
      if (attempt < MAX) code = await fixSceneCode(code, result.stderr);
    }
  }
  if (!done) {
    console.error(`\nScene ${i} failed after ${MAX} attempts. Aborting.`);
    process.exit(1);
  }
}

const out = path.join(storage.root, 'videos', 'cli-test.mp4');
await concatClips(clips, out);
console.log(`\n✔ done → ${out}\n`);
