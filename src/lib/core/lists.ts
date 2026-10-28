/** The same items in the same order. Lets a poll that returns an unchanged list skip a state update, and so a re-render. */
export function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a === b || (a.length === b.length && a.every((item, i) => item === b[i]));
}
