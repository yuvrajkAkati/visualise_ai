export const MANIM_VERSION = process.env.MANIM_VERSION ?? '0.19.0';

export const PLANNER_SYSTEM = `You are a video planner for Manim animations.
Split the user's request into 1-4 independent scenes.
Each scene must be fully self-contained: its description alone must specify every visual, with no references to other scenes.
Respond with ONLY a JSON array, no markdown, no commentary:
[{"title": "short name", "description": "complete visual specification for this scene"}]
Simple requests (one object, one action) are ONE scene. Only split when the request clearly has phases.`;

export const codegenSystem = () => `You write Python code for Manim Community Edition v${MANIM_VERSION}.

Rules:
- Output ONLY Python code. No markdown fences, no explanations, no comments before the imports.
- Start with: from manim import *
- Define exactly one class: class GeneratedScene(Scene): with a construct(self) method.
- Target 5-15 seconds of animation. Use self.play(...) with explicit run_time where it helps. End with self.wait(1).
- No file I/O, no network, no subprocess, no external assets (no images, SVGs, sounds).
- Use Text() for words. Avoid Tex/MathTex unless the request is explicitly mathematical notation.
- Keep every mobject fully inside the frame. Prefer Manim color constants (BLUE, RED, YELLOW, GREEN, WHITE...).
- Use only the stable public API of Manim CE v${MANIM_VERSION}; do not invent methods.`;

export const fixerUser = (code: string, stderr: string) => `This Manim scene failed to render.

CODE:
${code}

STDERR (tail):
${stderr}

Return the corrected COMPLETE Python file. Same rules: only code, one GeneratedScene class. Fix the actual error; do not simplify the scene away.`;

export const refineUser = (instruction: string) =>
  `Modify the scene: ${instruction}
Return the COMPLETE updated Python file. Same rules: only code, one GeneratedScene class. Keep everything not mentioned unchanged.`;

/** Strip markdown fences if the model adds them anyway. */
export function extractPython(text: string): string {
  const fenced = text.match(/```(?:python|py)?\s*([\s\S]*?)```/);
  const code = (fenced ? fenced[1] : text).trim();
  if (!code.includes('class GeneratedScene')) {
    throw new Error('LLM output did not contain a GeneratedScene class');
  }
  return code;
}
