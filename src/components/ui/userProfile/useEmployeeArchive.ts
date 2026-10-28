'use client';

import { useEffect, useRef, useState } from 'react';
import { hrActions, type ArchiveProgress, type Profile } from '@/lib/hrData';

// "Download Employee Data": builds the zip of everything held on one employee, with live progress (it can take minutes
// for someone with thousands of screenshots) and a cancel. Deleting an account is only allowed after a download has
// succeeded, so `downloaded` gates that button.
export function useEmployeeArchive(profile: Profile) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ArchiveProgress | null>(null);
  const [note, setNote] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []); // closing the card stops an export in flight

  const download = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setExporting(true);
    setNote('');
    setProgress({ phase: 'records', label: 'Starting…', percent: 1 });
    try {
      const { filename, blob, screenshotsTotal, screenshotsSkipped } = await hrActions.exportEmployeeArchive(profile, { onProgress: setProgress, signal: controller.signal });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownloaded(true);
      setNote(screenshotsSkipped > 0
        ? `Downloaded. ${screenshotsSkipped} of ${screenshotsTotal} screenshots could not be fetched (expired or too slow) and are not in the file.`
        : `Downloaded${screenshotsTotal ? ` with ${screenshotsTotal} screenshots` : ''}.`);
    } catch (err) {
      if (controller.signal.aborted) setNote('Download cancelled.');
      else {
        console.error('Employee data export failed:', err);
        alert('Could not prepare the data export. See console for details — deletion is still blocked until this succeeds.');
      }
    } finally {
      abortRef.current = null;
      setExporting(false);
      setProgress(null);
    }
  };

  return { exporting, progress, note, downloaded, download, cancel: () => abortRef.current?.abort() };
}
