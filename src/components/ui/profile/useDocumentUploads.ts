'use client';

import React, { useState } from 'react';
import { updateProfileSelf } from '@/lib/hrData';
import { fileToStoredData } from '@/lib/imageCompressor';
import { useActionToast } from '@/components/ui/ActionToastHost';

type DocKey = 'cv' | 'id' | 'passport';
type IdentityDoc = { name: string; data: string };

// The three document slots on "My Documents": CV (replaceable), identity documents (a growing list) and passport
// (replaceable). Each upload converts the file (images to WebP, PDFs as-is), saves it on the person's own record and
// reloads it. One upload at a time per slot; the slot being saved is in `busy`.
export function useDocumentUploads({ enabled, identityDocs, onSaved }: { enabled: boolean; identityDocs: IdentityDoc[]; onSaved: () => Promise<unknown> | void }) {
  const { showToast } = useActionToast();
  const [busy, setBusy] = useState<DocKey | null>(null);

  const uploader = (
    key: DocKey,
    labels: { success: string; failure: string },
    patch: (file: File, data: string) => Parameters<typeof updateProfileSelf>[0],
  ) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !enabled) return;
    setBusy(key);
    try {
      const { data, error } = await fileToStoredData(file);
      if (error) { showToast({ type: 'error', message: error }); return; }
      await updateProfileSelf(patch(file, data));
      await onSaved();
      showToast({ type: 'success', message: labels.success });
    } catch (err) {
      console.error(`[Profile] ${key} upload error:`, err);
      // compressImageToWebP rejects with a specific, actionable message (e.g. HEIC not supported): show it when present.
      showToast({ type: 'error', message: err instanceof Error ? err.message : labels.failure });
    } finally {
      setBusy(null);
    }
  };

  return {
    busy,
    onCv: uploader('cv', { success: 'CV / Resume uploaded successfully!', failure: 'Failed to upload CV. Please try again.' }, (f, data) => ({ cvFileName: f.name, cvFileData: data })),
    onId: uploader('id', { success: 'Identity document uploaded successfully!', failure: 'Failed to upload document. Please try again.' }, (f, data) => ({ identityDocs: [...identityDocs, { name: f.name, data }] })),
    onPassport: uploader('passport', { success: 'Passport uploaded successfully!', failure: 'Failed to upload passport. Please try again.' }, (f, data) => ({ passportFileName: f.name, passportFileData: data })),
  };
}
