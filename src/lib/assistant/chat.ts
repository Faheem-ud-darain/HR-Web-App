// Runs one assistant turn: sends the conversation to a free Groq model with the fixed read-only tools,
// executes the tool calls the model asks for, and returns the final answer. Edge-safe (fetch only).
import { defaultActions, type AssistantAction, type AssistantRole } from './tools';
import { demoRunner, type ToolRunner } from './runner';
import { systemPrompt } from './prompt';
import { routeTools } from './toolRouter';

export interface ChatMessage { role: 'user' | 'assistant'; content: string }
/** What one question cost: the tokens the provider counted (or an estimate when it did not say), and how many times the model was asked. */
export interface AssistantUsage { promptTokens: number; completionTokens: number; totalTokens: number; steps: number; model: string; estimated: boolean }
export interface AssistantResult { answer: string; toolsUsed: string[]; model: string; actions: AssistantAction[]; usage: AssistantUsage }

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Primary first; the fallback has its own separate limits on the free plan.
export const MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'];
const MAX_ROUNDS = 5;
const MAX_HISTORY = 4; // the last two exchanges are enough for a follow-up; every older message is paid for again on every step
const MAX_CONTENT = 2000;
const MAX_ANSWER_IN_HISTORY = 500; // an earlier answer is context, not something to quote back in full
const RETRY_AFTER_MAX_SECONDS = 15; // a rate limit that clears this soon is waited out once instead of failing

interface ToolCall { id: string; function: { name: string; arguments: string } }
interface ApiMessage { role: string; content?: string | null; tool_calls?: ToolCall[]; tool_call_id?: string }

export function trimHistory(history: ChatMessage[]): ChatMessage[] {
  return history
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY)
    .map(m => ({ role: m.role, content: m.content.slice(0, m.role === 'assistant' ? MAX_ANSWER_IN_HISTORY : MAX_CONTENT) }));
}

// Models like to use no-break and narrow spaces and non-breaking hyphens; they stop text and table cells
// from wrapping in a narrow chat window, so they become ordinary spaces and hyphens.
function cleanAnswer(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/[\u00A0\u2007\u2009\u202F]/g, ' ')
    .replace(/[\u2010\u2011\u2012\u2013]/g, '-')
    // Next steps belong in the buttons. If the model also wrote them out as text (a "Next steps" block, or
    // pseudo-code like "(open_page, page: ...)"), remove that so no code-looking text reaches the person.
    .replace(/\n?[ \t]*(?:-{3,}[ \t]*\n)?[ \t]*\**(?:Next steps?|Next actions?|Suggested actions?):?\**:?[ \t]*\n[\s\S]*$/i, '')
    .replace(/\n?\s*\{\s*"actions"\s*:[\s\S]*$/i, '')
    .replace(/^[ \t]*\[[^\]\n]*\][ \t]*\((?:open_page|ask_followup)[^)\n]*\)[ \t]*$/gim, '')
    .replace(/^[ \t]*\[(?:Ask follow-?up|Follow-?up|Button|Action)s?:[^\]\n]*\][ \t]*$/gim, '')
    .replace(/(?:\n[ \t]*-{3,}[ \t]*)+$/g, '')
    .trim();
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const guess = (x: unknown) => Math.ceil(JSON.stringify(x).length / 4); // about four characters per token

async function runWithModel(model: string, history: ChatMessage[], apiKey: string, fetchImpl: typeof fetch, now: Date, role: AssistantRole, runner: ToolRunner): Promise<AssistantResult> {
  // Only the tools and background notes this question needs are sent (see toolRouter.ts).
  const { defs, topics } = routeTools(runner.defs, history.filter(m => m.role === 'user').map(m => m.content));
  const messages: ApiMessage[] = [{ role: 'system', content: systemPrompt(now, runner.mode === 'live', role, topics) }, ...history];
  const toolsUsed: string[] = [];
  const calls: { name: string; result: Record<string, unknown> }[] = [];
  const usage: AssistantUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, steps: 0, model, estimated: false };
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const send = () => fetchImpl(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, tools: defs, temperature: 0.2, max_tokens: 700 }),
    });
    let res = await send();
    if (res.status === 429) { // over the per-minute allowance: if it clears within seconds, wait and try once more
      const wait = Number(res.headers?.get?.('retry-after'));
      if (wait > 0 && wait <= RETRY_AFTER_MAX_SECONDS) { await sleep(wait * 1000); res = await send(); }
    }
    if (!res.ok) throw Object.assign(new Error(`provider ${res.status}`), { status: res.status });
    const data = await res.json() as { choices?: { message?: ApiMessage }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('empty provider reply');
    usage.steps++;
    if (typeof data.usage?.prompt_tokens === 'number') { usage.promptTokens += data.usage.prompt_tokens; usage.completionTokens += data.usage.completion_tokens || 0; }
    else { usage.estimated = true; usage.promptTokens += guess({ messages, tools: defs }); usage.completionTokens += guess(msg); }
    if (msg.tool_calls?.length) {
      messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls) {
        let result: Record<string, unknown>;
        try {
          const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
          result = defs.some(t => t.function.name === call.function.name) ? await runner.run(call.function.name, args) : { error: 'Unknown tool.' };
          toolsUsed.push(call.function.name);
          calls.push({ name: call.function.name, result });
        } catch {
          result = { error: 'Could not read the tool arguments.' };
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }
    const answer = cleanAnswer(msg.content ?? '');
    if (!answer) throw new Error('empty answer');
    usage.totalTokens = usage.promptTokens + usage.completionTokens;
    console.log('[assistant] tokens', JSON.stringify({ total: usage.totalTokens, prompt: usage.promptTokens, completion: usage.completionTokens, steps: usage.steps, tools: toolsUsed, model, estimated: usage.estimated }));
    // Names and bank details are put back here, on the server, only for the person reading the answer. The buttons come from what the tools returned.
    const restored: AssistantAction[] = [];
    for (const a of defaultActions(calls, role)) restored.push({ ...a, label: (await runner.finish(a.label)).slice(0, 40), ...(a.search ? { search: await runner.finish(a.search) } : {}), ...(a.text ? { text: await runner.finish(a.text) } : {}) });
    return { answer: (await (runner.finishAnswer ?? runner.finish)(answer)).slice(0, 4000), toolsUsed, model, actions: restored, usage };
  }
  throw new Error('too many tool rounds');
}

/** Tries each model in turn; a rate limit or provider error moves on to the next one. */
export async function runAssistant(history: ChatMessage[], apiKey: string, opts: { fetchImpl?: typeof fetch; models?: string[]; now?: Date; role?: AssistantRole; runner?: ToolRunner } = {}): Promise<AssistantResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const runner = opts.runner ?? demoRunner;
  const trimmed = await runner.prepare(trimHistory(history));
  if (trimmed.length === 0 || trimmed[trimmed.length - 1].role !== 'user') throw new Error('Nothing to answer.');
  let lastError: unknown;
  for (const model of opts.models ?? MODELS) {
    try {
      return await runWithModel(model, trimmed, apiKey, fetchImpl, opts.now ?? new Date(), opts.role ?? 'hr', runner);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('The assistant could not answer.');
}
