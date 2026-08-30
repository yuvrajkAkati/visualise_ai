// packages/pipeline/src/codegen.service.ts
// Provider-agnostic codegen: talks to ANY OpenAI-compatible chat-completions
// endpoint. Pick a provider with three env vars — no code changes:
//
//   Gemini (free tier):  LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
//                        LLM_MODEL=gemini-2.5-flash
//   Groq (free tier):    LLM_BASE_URL=https://api.groq.com/openai/v1
//                        LLM_MODEL=llama-3.3-70b-versatile
//   OpenRouter (:free):  LLM_BASE_URL=https://openrouter.ai/api/v1
//   Ollama (local):      LLM_BASE_URL=http://localhost:11434/v1   (any LLM_API_KEY)
//   Anthropic (paid):    LLM_BASE_URL=https://api.anthropic.com/v1
//                        LLM_MODEL=claude-sonnet-4-6

import { PLANNER_SYSTEM, codegenSystem, extractPython, fixerUser, refineUser } from './prompts';

const BASE_URL = (process.env.LLM_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, '');
const MODEL = process.env.LLM_MODEL ?? 'gemini-2.5-flash';
const API_KEY = process.env.LLM_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '';

export type ChatMsg = { role: 'user' | 'assistant'; content: string };

async function complete(system: string, messages: ChatMsg[], maxTokens = 3000): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
    });

    // Free tiers rate-limit (429): wait and retry instead of failing the scene.
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('retry-after') ?? 15);
      console.log(`  llm rate-limited, retrying in ${wait}s...`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }

    if (!res.ok) {
      throw new Error(`LLM request failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('LLM returned no text');
    return text;
  }
  throw new Error('LLM request failed: rate-limited after retries');
}

export async function planScenes(prompt: string): Promise<{ title: string; description: string }[]> {
  const raw = await complete(PLANNER_SYSTEM, [{ role: 'user', content: prompt }], 1500);
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, 4).map((s, i) => ({
        title: String(s.title ?? `Scene ${i + 1}`),
        description: String(s.description ?? ''),
      }));
    }
  } catch {
    // fall through to single-scene fallback
  }
  return [{ title: 'Scene 1', description: prompt }];
}

export async function generateSceneCode(description: string): Promise<string> {
  const text = await complete(codegenSystem(), [{ role: 'user', content: description }]);
  return extractPython(text);
}

export async function fixSceneCode(code: string, stderrTail: string): Promise<string> {
  const text = await complete(codegenSystem(), [{ role: 'user', content: fixerUser(code, stderrTail) }]);
  return extractPython(text);
}

/** history = full codegen/refine chat for this scene; instruction = the user's new ask. */
export async function refineSceneCode(history: ChatMsg[], instruction: string): Promise<string> {
  const messages: ChatMsg[] = [...history, { role: 'user', content: refineUser(instruction) }];
  const text = await complete(codegenSystem(), messages);
  return extractPython(text);
}