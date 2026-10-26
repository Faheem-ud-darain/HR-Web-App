// hr_leaves only stores the employee's NAME (employee_name; the collection has no id/email
// column), so leaves are matched to people by name. These helpers make that match forgiving about
// letter case and stray whitespace, in one place.

export function normalizeEmployeeName(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function sameEmployeeName(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeEmployeeName(a);
  return x !== '' && x === normalizeEmployeeName(b);
}
