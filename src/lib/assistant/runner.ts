// What the assistant loop needs from "the data behind the tools". Two implementations: the made-up demo data
// (demoRunner) and the real database (live.ts). Everything the model sees goes through `prepare` (hides
// names) and everything shown to the person goes through `finish` (puts names and bank details back).
import { TOOL_DEFS, runTool, mergeBankPlaceholders, type ToolDef } from './tools';
import type { ChatMessage } from './chat';

export interface ToolRunner {
  readonly mode: 'demo' | 'live';
  readonly defs: ToolDef[];
  /** Conversation as the model may see it (names hidden). */
  prepare(history: ChatMessage[]): Promise<ChatMessage[]>;
  run(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Final answer as the person may see it (names and bank details put back). */
  finish(answer: string): Promise<string>;
}

export const demoRunner: ToolRunner = {
  mode: 'demo',
  defs: TOOL_DEFS,
  prepare: async history => history,
  run: async (name, args) => runTool(name, args),
  finish: async answer => mergeBankPlaceholders(answer),
};
