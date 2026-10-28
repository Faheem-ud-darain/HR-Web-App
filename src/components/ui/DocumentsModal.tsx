'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Profile, displayName } from '@/lib/hrData';
import { FileTextIcon as FileText, DownloadSimpleIcon as Download, EyeIcon as Eye } from '@phosphor-icons/react/dist/ssr';
import { safeHref } from '@/lib/sanitize';

interface DocumentsModalProps {
  employee: Profile | null;
  onClose: () => void;
}

// Real onboarding document viewer for HR/Admin — documents are stored as
// base64 directly on the profile (same pattern as profilePicture), so
// "download" just triggers a browser download of the data URL and "view"
// opens it in a new tab. No Supabase Storage bucket required.
function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function DocRow({ label, fileName, fileData }: { label: string; fileName?: string; fileData?: string }) {
  if (!fileData) {
    return (
      <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold italic">
          <FileText className="h-4 w-4" /> {label} — not uploaded
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 min-w-0">
        <FileText className="h-4 w-4 text-orange-600 shrink-0" />
        <span className="truncate">{label}{fileName ? ` — ${fileName}` : ''}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => { const href = safeHref(fileData); if (href) window.open(href, '_blank', 'noopener,noreferrer'); }}
          className="text-caption font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg active:scale-97 transition-colors transition-transform transition-shadow flex items-center gap-1"
        >
          <Eye className="h-3.5 w-3.5" /> View
        </button>
        <button
          onClick={() => downloadDataUrl(fileData, fileName || `${label}.dat`)}
          className="text-caption font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2 py-1.5 rounded-lg active:scale-97 transition-colors transition-transform transition-shadow flex items-center gap-1"
        >
          <Download className="h-3.5 w-3.5" /> Download
        </button>
      </div>
    </div>
  );
}

export function DocumentsModal({ employee, onClose }: DocumentsModalProps) {
  return (
    // HR/Admin-only viewer (see comment above), so the real name + alias
    // are always safe to show together here — see displayName() in hrData.ts.
    <Modal isOpen={!!employee} onClose={onClose} title={employee ? `${displayName(employee, 'hr')} — Documents` : 'Documents'}>
      {employee && (
        <div className="space-y-3">
          <DocRow label="CV / Resume" fileName={employee.cvFileName} fileData={employee.cvFileData} />
          {(employee.identityDocs || []).map((doc, idx) => (
            <DocRow key={idx} label={doc.name || `Identity Document ${idx + 1}`} fileName={doc.name} fileData={doc.data} />
          ))}
          {(!employee.identityDocs || employee.identityDocs.length === 0) && (
            <DocRow label={employee.region === 'USA' ? 'Driver License / Work Permit' : 'CNIC (Front/Back)'} />
          )}
          <DocRow label="Passport (Optional)" fileName={employee.passportFileName} fileData={employee.passportFileData} />
        </div>
      )}
    </Modal>
  );
}
