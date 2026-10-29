'use client';

import { useState } from 'react';
import { updateProfileSelf } from '@/lib/hrData';
import { useActionToast } from '@/components/ui/ActionToastHost';

// Changing your own profile picture: pick a file, crop it (AvatarCropperModal), save. Shared by the employee and
// the HR/Admin profile pages through ProfileHero, which owns the picker button.
export function useProfilePhoto({ profileId, logTag, onSaved }: { profileId?: string; logTag: string; onSaved: () => Promise<unknown> | void }) {
  const { showToast } = useActionToast();
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const pick = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast({ type: 'error', message: 'Please choose an image file.' });
      return;
    }
    setPendingFile(file);
  };

  const handleSave = async (webpDataUrl: string) => {
    if (!profileId) return;
    try {
      await updateProfileSelf({ profilePicture: webpDataUrl });
      await onSaved();
      setPendingFile(null);
      showToast({ type: 'success', message: 'Profile picture updated!' });
    } catch (err) {
      console.error(`[${logTag}] Photo update error:`, err);
      showToast({ type: 'error', message: 'Failed to save profile picture.' });
    }
  };

  return { pendingFile, clearPending: () => setPendingFile(null), pick, handleSave };
}
