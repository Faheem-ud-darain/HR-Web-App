// The same question asked again in the SAME chat is not worked out again: Del points to the answer it already gave, which costs no tokens
// and no waiting. (A person can still ask for a fresh look-up from the button.) Only questions that were answered from the data count: a
// repeated "hello" is just a greeting.
export interface ChatLine { id: string; role: 'user' | 'assistant'; content: string; error?: boolean; toolsUsed?: string[]; repeatOf?: string; at?: number }

/** Case, punctuation and extra spaces do not make a question different. */
export const normaliseQuestion = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** The earlier answer to this same question in this chat, with the question that was asked, or null. The newest match wins. */
export function findEarlierAnswer(messages: ChatLine[], question: string): { asked: ChatLine; answer: ChatLine } | null {
  const wanted = normaliseQuestion(question);
  if (wanted.length < 8) return null;
  for (let i = messages.length - 2; i >= 0; i--) {
    const asked = messages[i]; const answer = messages[i + 1];
    if (asked.role !== 'user' || asked.repeatOf || normaliseQuestion(asked.content) !== wanted) continue;
    if (answer.role === 'assistant' && !answer.error && !answer.repeatOf && (answer.toolsUsed?.length ?? 0) > 0) return { asked, answer };
  }
  return null;
}

/** "just now", "5 minutes ago", "2 hours ago": how long ago the earlier answer was given, or '' when that is not known. */
export function ageText(at: number | undefined, now: number): string {
  if (!at || at > now) return '';
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} hour${hours === 1 ? '' : 's'} ago` : `${Math.floor(hours / 24)} day${hours < 48 ? '' : 's'} ago`;
}

export const repeatNote = (age: string): string => `You asked this earlier in this chat${age ? ` (${age})` : ''}, so I have not looked it up again. The answer is above.`;
