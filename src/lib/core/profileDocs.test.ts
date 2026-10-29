import { describe, it, expect } from 'vitest';
import { hasDocs, legacyDocsKey, parseLegacyDocs } from './profileDocs';

describe('legacyDocsKey', () => {
  it('uses the old store\'s key', () => expect(legacyDocsKey('abc123')).toBe('hr_profile_docs_abc123'));
});

describe('parseLegacyDocs', () => {
  const docs = { cvFileName: 'cv.pdf', cvFileData: 'data:application/pdf;base64,AAA', identityDocs: [{ name: 'id.png', data: 'data:image/png;base64,BBB' }] };
  it('reads a JSON string and an object the same way', () => {
    expect(parseLegacyDocs(JSON.stringify(docs))).toEqual(docs);
    expect(parseLegacyDocs(docs)).toEqual(docs);
  });
  it('keeps only the document fields', () => {
    expect(parseLegacyDocs({ ...docs, password: 'x', role: 'admin' })).toEqual(docs);
  });
  it('drops empty fields', () => {
    expect(parseLegacyDocs({ cvFileName: '', cvFileData: '', identityDocs: [], passportFileName: 'p.pdf' })).toEqual({ passportFileName: 'p.pdf' });
  });
  it('gives nothing for bad data', () => {
    for (const bad of [null, undefined, 42, 'not json', '[]', [], '"x"']) expect(parseLegacyDocs(bad)).toEqual({});
  });
});

describe('hasDocs', () => {
  it('is true only when something is there', () => {
    expect(hasDocs({})).toBe(false);
    expect(hasDocs(null)).toBe(false);
    expect(hasDocs({ cvFileName: 'cv.pdf' })).toBe(true);
  });
});
