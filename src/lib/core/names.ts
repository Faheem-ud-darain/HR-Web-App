/**
 * A name that fits a tight spot. Short names stay whole; a long one becomes the first name and the first letter of
 * the last name ("Muhammad Abdul Rahman Siddiqui" -> "Muhammad S."). A single very long word is cut with an ellipsis.
 */
export function compactName(fullName: string | null | undefined, maxLength = 16): string {
  const name = (fullName || '').trim().replace(/\s+/g, ' ');
  if (name.length <= maxLength) return name;
  const parts = name.split(' ');
  const first = parts[0];
  const short = parts.length > 1 ? `${first} ${parts[parts.length - 1][0].toUpperCase()}.` : first;
  return short.length <= maxLength ? short : `${short.slice(0, maxLength - 1)}…`;
}
