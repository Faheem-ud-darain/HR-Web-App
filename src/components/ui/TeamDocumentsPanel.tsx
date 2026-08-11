'use client';

import React, { useRef, useState } from 'react';
import { Team, TeamDocument, useTeamDocuments, hrActions } from '@/lib/hrData';
import { formatDateNY } from '@/lib/timezone';
import {
  Upload, FileText, FileImage, FileVideo, Download, Trash2, Loader2,
  X, FolderOpen, File as FileIcon,
} from 'lucide-react';

interface TeamDocumentsPanelProps {
  team: Team | null;
  currentUserEmail: string;
  currentUserRole: 'admin' | 'hr' | 'employee' | 'team_lead';
  currentUserName: string;
  // Admin/HR always; Team Lead only for a team they actually lead — resolved
  // by the caller (TeamChatView) since it already knows team.leadEmail.
  canManage: boolean;
}

// Generous cap matching the collection's maxSize (see
// create_team_documents_collection.py) — large enough for short
// instructional videos, unlike the 15MB chat-attachment cap.
const MAX_DOCUMENT_BYTES = 200 * 1024 * 1024;

function formatBytes(bytes?: number): string {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return formatDateNY(d);
  } catch {
    return iso;
  }
}

type DocKind = 'image' | 'video' | 'document' | 'other';

function docKind(name: string): DocKind {
  if (/\.(png|jpe?g|gif|webp)$/i.test(name)) return 'image';
  if (/\.(mp4|webm|mov)$/i.test(name)) return 'video';
  if (/\.(pdf|docx?|xlsx?|pptx?|txt)$/i.test(name)) return 'document';
  return 'other';
}

function DocIcon({ kind }: { kind: DocKind }) {
  if (kind === 'image') return <FileImage className="h-5 w-5 text-emerald-600" />;
  if (kind === 'video') return <FileVideo className="h-5 w-5 text-purple-600" />;
  if (kind === 'document') return <FileText className="h-5 w-5 text-orange-600" />;
  return <FileIcon className="h-5 w-5 text-slate-500" />;
}

export function TeamDocumentsPanel({ team, currentUserEmail, currentUserRole, currentUserName, canManage }: TeamDocumentsPanelProps) {
  const { data: documents = [], isLoading } = useTeamDocuments(team?.id);
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setTitle(''); setDescription(''); setPendingFile(null); setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFilePick = (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError('File is too large — 200MB max.');
      return;
    }
    setPendingFile(file);
    // Default the title from the filename (minus extension) so uploaders
    // don't have to retype it, but they can still edit it before saving.
    if (!title.trim()) setTitle(file.name.replace(/\.[^/.]+$/, ''));
  };

  const handleUpload = async () => {
    if (!team || uploading) return;
    if (!title.trim() || !pendingFile) {
      setError('A title and a file are both required.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      await hrActions.uploadTeamDocument(team.id, title, description, pendingFile, currentUserEmail, currentUserName, currentUserRole);
      resetForm();
      setShowUpload(false);
    } catch (err) {
      console.error('Team document upload failed:', err);
      setError('Could not upload that file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: TeamDocument) => {
    if (!window.confirm(`Remove "${doc.title}" for everyone on this team?`)) return;
    setDeletingId(doc.id);
    try {
      await hrActions.deleteTeamDocument(doc.id);
    } catch (err) {
      console.error('Team document delete failed:', err);
    } finally {
      setDeletingId(null);
    }
  };

  if (!team) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
        <FolderOpen className="h-10 w-10 opacity-30" />
        <p className="font-semibold text-sm">Pick a team to see its documents.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="px-4 pt-3 pb-2 shrink-0 flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500 font-medium">
          Onboarding guides, instructions, and reference files for <span className="font-bold text-slate-700">{team.name}</span>.
          Tag one in Team Chat by typing <span className="font-mono font-bold text-sky-700">#</span> followed by its title.
        </p>
        {canManage && (
          <button
            onClick={() => setShowUpload(v => !v)}
            className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition-colors transition-transform transition-shadow shrink-0"
          >
            <Upload className="h-3 w-3" /> Upload
          </button>
        )}
      </div>

      {showUpload && canManage && (
        <div className="mx-4 mb-3 border border-slate-200 rounded-xl bg-slate-50/80 p-3 space-y-2 shrink-0">
          {error && <p className="text-[10px] text-rose-600 font-bold">{error}</p>}
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Document title (this is what people will type # + this to tag it)"
            className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs outline-none focus:border-orange-500 font-medium"
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description…"
            rows={2}
            className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs outline-none focus:border-orange-500 font-medium resize-none"
          />
          <div className="flex items-center gap-2">
            <label className="flex-1 flex items-center gap-2 bg-white border border-dashed border-slate-300 rounded-lg py-2 px-3 text-[10px] font-bold text-slate-500 cursor-pointer hover:border-orange-400">
              <Upload className="h-3.5 w-3.5 shrink-0" />
              {pendingFile ? pendingFile.name : 'Choose a file (image, video, PDF, doc…)'}
              <input ref={fileInputRef} type="file" className="hidden" onChange={e => handleFilePick(e.target.files?.[0])} />
            </label>
            {pendingFile && (
              <button onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-slate-400 hover:text-rose-600 shrink-0">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => { setShowUpload(false); resetForm(); }}
              className="text-[10px] font-bold text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || !title.trim() || !pendingFile}
              className="flex items-center gap-1 text-[10px] font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 px-3 py-1.5 rounded-lg"
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              Save to team
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
        {isLoading && <p className="text-xs text-slate-400 text-center font-semibold py-6">Loading documents…</p>}
        {!isLoading && documents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
            <FolderOpen className="h-8 w-8 opacity-30" />
            <p className="text-xs font-semibold italic">
              {canManage ? 'No documents yet — upload the first onboarding guide.' : 'No documents have been shared with this team yet.'}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {documents.map(doc => {
            const kind = docKind(doc.fileName);
            return (
              <div key={doc.id} className="border border-slate-200 rounded-xl p-3 bg-white hover:border-orange-300 transition-colors transition-transform transition-shadow group">
                <div className="flex items-start gap-2.5">
                  <div className="shrink-0 h-9 w-9 rounded-lg bg-slate-50 flex items-center justify-center">
                    <DocIcon kind={kind} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 truncate">{doc.title}</p>
                    {doc.description && <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{doc.description}</p>}
                    <p className="text-[9px] text-slate-400 font-semibold mt-1">
                      {doc.uploadedByName} · {formatTimestamp(doc.timestamp)}{doc.fileSize !== undefined ? ` · ${formatBytes(doc.fileSize)}` : ''}
                    </p>
                  </div>
                </div>
                {kind === 'image' && (
                  <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="block mt-2">
                    <img src={doc.fileUrl} alt={doc.title} className="rounded-lg max-h-32 w-full object-cover" />
                  </a>
                )}
                {kind === 'video' && (
                  <video src={doc.fileUrl} controls className="mt-2 rounded-lg max-h-40 w-full bg-black" />
                )}
                <div className="flex items-center gap-2 mt-2">
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[10px] font-bold text-orange-700 hover:text-orange-800"
                  >
                    <Download className="h-3 w-3" /> Open / Download
                  </a>
                  {canManage && (
                    <button
                      onClick={() => handleDelete(doc)}
                      disabled={deletingId === doc.id}
                      className="flex items-center gap-1 text-[10px] font-bold text-rose-500 hover:text-rose-700 ml-auto disabled:opacity-50"
                    >
                      {deletingId === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
