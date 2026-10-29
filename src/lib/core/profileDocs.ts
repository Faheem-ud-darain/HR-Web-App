// Employees' onboarding documents (CV, identity scans, passport). They used to live in one key-value row per
// employee ("hr_profile_docs_<id>" in hr_delcargo_store) and were moved to a collection with the same name, one row per
// employee. The move never copied the old rows, so anything uploaded before it was invisible. These helpers read the
// old shape so the app can fall back to it, and the backfill can copy it forward.

const DOC_KEYS = ['cvFileName', 'cvFileData', 'identityDocs', 'passportFileName', 'passportFileData'] as const;

export type ProfileDocs = Partial<{
  cvFileName: string; cvFileData: string; identityDocs: { name: string; data: string }[]; passportFileName: string; passportFileData: string;
}>;

/** The key the old store used for one employee's documents. */
export const legacyDocsKey = (profileId: string): string => `hr_profile_docs_${profileId}`;

/** The document fields in an old key-value row (a JSON string or an object), and nothing else. Bad data gives {}. */
export function parseLegacyDocs(value: unknown): ProfileDocs {
  let v: unknown = value;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return {}; }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const src = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of DOC_KEYS) {
    const val = src[key];
    if (key === 'identityDocs' ? Array.isArray(val) && val.length > 0 : typeof val === 'string' && val !== '') out[key] = val;
  }
  return out as ProfileDocs;
}

/** True when there is at least one document field. */
export const hasDocs = (docs: ProfileDocs | null | undefined): boolean => !!docs && Object.keys(docs).length > 0;
