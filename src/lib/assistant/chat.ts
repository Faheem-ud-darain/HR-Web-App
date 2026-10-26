// Runs one assistant turn: sends the conversation to a free Groq model with the fixed read-only tools,
// executes the tool calls the model asks for, and returns the final answer. Edge-safe (fetch only).
import { normalizeActions, defaultActions, type AssistantAction, type AssistantRole } from './tools';
import { demoRunner, type ToolRunner } from './runner';
import { systemPrompt } from './prompt';

export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface AssistantResult { answer: string; toolsUsed: string[]; model: string; actions: AssistantAction[] }

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Primary first; the fallback has its own separate limits on the free plan.
export const MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'];
const MAX_ROUNDS = 5;
const MAX_HISTORY = 8;
const MAX_CONTENT = 2000;

interface ToolCall { id: string; function: { name: string; arguments: string } }
interface ApiMessage { role: string; content?: string | null; tool_calls?: ToolCall[]; tool_call_id?: string }

export function trimHistory(history: ChatMessage[]): ChatMessage[] {
  return history
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT) }));
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

async function runWithModel(model: string, history: ChatMessage[], apiKey: string, fetchImpl: typeof fetch, now: Date, role: AssistantRole, runner: ToolRunner): Promise<AssistantResult> {
  const messages: ApiMessage[] = [{ role: 'system', content: systemPrompt(now, runner.mode === 'live', role) }, ...history];
  const toolsUsed: string[] = [];
  let actions: AssistantAction[] = [];
  const calls: { name: string; result: Record<string, unknown> }[] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetchImpl(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, tools: runner.defs, temperature: 0.2, max_tokens: 700 }),
    });
    if (!res.ok) throw Object.assign(new Error(`provider ${res.status}`), { status: res.status });
    const data = await res.json() as { choices?: { message?: ApiMessage }[] };
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('empty provider reply');
    if (msg.tool_calls?.length) {
      messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls) {
        let result: Record<string, unknown>;
        try {
          const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
          if (call.function.name === 'suggest_actions') {
            // Buttons are validated against the allow-list; the model never builds a link itself.
            actions = normalizeActions(args.actions, role);
            result = { ok: true, shown: actions.length };
          } else {
            result = runner.defs.some(t => t.function.name === call.function.name) ? await runner.run(call.function.name, args) : { error: 'Unknown tool.' };
            toolsUsed.push(call.function.name);
            calls.push({ name: call.function.name, result });
          }
        } catch {
          result = { error: 'Could not read the tool arguments.' };
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }
    const answer = cleanAnswer(msg.content ?? '');
    if (!answer) throw new Error('empty answer');
    // Names and bank details are put back here, on the server, only for the person reading the answer.
    const shown = (actions.length ? actions : defaultActions(calls, role));
    const restored: AssistantAction[] = [];
    for (const a of shown) restored.push({ ...a, label: (await runner.finish(a.label)).slice(0, 40), ...(a.search ? { search: await runner.finish(a.search) } : {}), ...(a.text ? { text: await runner.finish(a.text) } : {}) });
    return { answer: (await runner.finish(answer)).slice(0, 4000), toolsUsed, model, actions: restored };
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
