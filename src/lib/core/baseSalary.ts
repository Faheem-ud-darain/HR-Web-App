// The base salary typed into the profile edit form. A blank or mistyped box used to be saved as 0 (`Number(x) || 0`), silently wiping the
// person's salary (and with it their pay and the deduction rates worked out from it). Now only a real number, 0 or more, is accepted; anything
// else is refused so nothing is saved.
export function parseBaseSalary(raw: unknown): number | null {
  const text = String(raw ?? '').trim().replace(/,/g, '');
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
