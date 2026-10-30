'use client';

import React, { useState } from 'react';
import { DownloadSimpleIcon as Download, TrashIcon as Trash2 } from '@/components/ui/icons';
import { hrActions, saveProfileExtras, type Profile } from '@/lib/hrData';
import { Button } from '../Button';
import { ConfirmDialog } from '../ConfirmDialog';
import { useEmployeeArchive } from './useEmployeeArchive';

interface ProfileActionsProps {
  profile: Profile;
  onEdit: () => void;
  onOffboard: () => void;
  onChanged: () => void | Promise<unknown>;
  // Called after the account has been deleted for good.
  onDeleted: () => void;
}

// The buttons at the bottom of the card for someone who can manage this profile: edit, offboard (or reactivate), and
// for an offboarded employee the data download and the permanent delete. Deletion purges everything held on them and
// cannot be undone, so it stays disabled until their data has been downloaded.
export function ProfileActions({ profile, onEdit, onOffboard, onChanged, onDeleted }: ProfileActionsProps) {
  const archive = useEmployeeArchive(profile);
  const [reactivating, setReactivating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const reactivate = async () => {
    if (reactivating) return;
    setReactivating(true);
    try {
      await saveProfileExtras(profile.id, { offboarded: false, offboardDate: undefined, offboardingStatus: undefined });
      await onChanged();
    } finally {
      setReactivating(false);
    }
  };

  const deletePermanently = async () => {
    setDeleting(true);
    try {
      // Purges the profile, documents, payroll, leaves, tasks, tickets, timesheets, screenshots, tracking token and
      // notifications, not just the profile listing (see hrActions.deleteEmployee).
      await hrActions.deleteEmployee(profile.id, profile.email, profile.fullName);
      setConfirmingDelete(false);
      onDeleted();
    } catch (err) {
      console.error('Employee deletion failed:', err);
      alert('Could not fully delete this employee. Some of their data may have already been removed — check the console, refresh, and try again. If it keeps failing, their profile is still intact.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-2 pt-3 border-t border-slate-100">
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onEdit}>Edit Credentials</Button>
        {profile.offboarded
          ? <Button variant="success" className="flex-1" onClick={reactivate} disabled={reactivating}>{reactivating ? 'Reactivating…' : 'Reactivate Employee'}</Button>
          : <Button variant="danger" className="flex-1" onClick={onOffboard}>Offboard Account</Button>}
      </div>

      {profile.offboarded && (
        <div className="space-y-1.5 pt-1">
          <Button type="button" variant="outline" fullWidth onClick={archive.download} disabled={archive.exporting}>
            <Download className="h-3.5 w-3.5" />
            {archive.exporting ? 'Preparing download…' : archive.downloaded ? 'Re-download Employee Data' : 'Download Employee Data First'}
          </Button>
          {archive.exporting && archive.progress && (
            <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3" role="status" aria-live="polite">
              <div className="flex items-center justify-between gap-2 text-caption font-semibold text-slate-600">
                <span className="min-w-0 truncate">{archive.progress.label}</span>
                <span className="shrink-0 tabular-nums">{archive.progress.percent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-orange-500 transition-all duration-300" style={{ width: `${archive.progress.percent}%` }} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-caption font-medium text-slate-400">Large accounts with many screenshots can take a few minutes. Keep this window open.</p>
                <Button type="button" variant="ghost" size="xs" onClick={archive.cancel} className="shrink-0 text-rose-600!">Cancel</Button>
              </div>
            </div>
          )}
          {!archive.exporting && archive.note && <p className="text-caption font-semibold text-slate-500 text-center" role="status">{archive.note}</p>}
          <Button variant="softRose" fullWidth disabled={!archive.downloaded} onClick={() => setConfirmingDelete(true)} title={!archive.downloaded ? "Download this employee's data first — deletion is permanent and cannot be undone." : undefined}>
            <Trash2 className="h-3.5 w-3.5" /> Delete Account Permanently
          </Button>
          {!archive.downloaded && (
            <p className="text-caption text-slate-400 font-medium text-center">Download their data first — includes documents, payroll, leave/task/ticket history, and screenshots. Deletion cannot be undone.</p>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmingDelete}
        onClose={() => !deleting && setConfirmingDelete(false)}
        onConfirm={deletePermanently}
        title="Permanently delete this account?"
        message={`This will completely and irreversibly purge ${profile.fullName} from the database: profile, uploaded documents (CV/passport/ID), payroll history, leave applications, tasks, tickets, timesheets, screenshots, and their tracking device access. This cannot be undone — make sure you've downloaded a copy first.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete Permanently'}
        variant="danger"
        requireTextMatch="DELETE"
        loading={deleting}
      />
    </div>
  );
}
