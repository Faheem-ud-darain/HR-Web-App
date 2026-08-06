'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, Upload, Save, CheckCircle2, Download, Smartphone, Loader2, Trash2, History } from 'lucide-react';
import { appReleaseActions, AppRelease } from '@/lib/appReleases';

export default function AppReleasesPage() {
  const [allReleases, setAllReleases] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [version, setVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [isMandatory, setIsMandatory] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchReleases();
  }, []);

  const fetchReleases = async () => {
    setLoading(true);
    const releases = await appReleaseActions.getAllReleases();
    setAllReleases(releases);
    setLoading(false);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!version.trim()) {
      setError('Please enter a version number.');
      return;
    }
    if (!file) {
      setError('Please select an APK file to upload.');
      return;
    }
    if (!file.name.endsWith('.apk')) {
      setError('The uploaded file must be an .apk file.');
      return;
    }

    setUploading(true);
    try {
      await appReleaseActions.createRelease(version, file, isMandatory, releaseNotes);
      setSuccess(`Successfully released version ${version}!`);
      setVersion('');
      setReleaseNotes('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchReleases();
    } catch (err: any) {
      console.error(err);
      setError('Failed to upload the APK. Please check your network and try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, ver: string) => {
    if (!confirm(`Are you sure you want to delete release v${ver}? This action cannot be undone.`)) {
      return;
    }
    setDeletingId(id);
    setError('');
    setSuccess('');
    try {
      const ok = await appReleaseActions.deleteRelease(id);
      if (ok) {
        setSuccess(`Release v${ver} deleted successfully.`);
        await fetchReleases();
      } else {
        setError(`Failed to delete release v${ver}.`);
      }
    } catch (err) {
      console.error(err);
      setError(`Failed to delete release v${ver}.`);
    } finally {
      setDeletingId(null);
    }
  };

  const latestRelease = allReleases.length > 0 ? allReleases[0] : null;

  return (
    <div className="space-y-6 font-sans">
      <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">App Releases (APK)</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload, manage, view history, or delete Android APK releases for mobile employees.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Publish Release Form */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <Upload className="h-5 w-5 text-orange-500" />
              Publish New Release
            </h2>
          </div>
          <div className="p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 text-sm rounded-lg border border-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> {success}
              </div>
            )}
            
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Version Number</label>
                <input
                  type="text"
                  placeholder="e.g. 1.0.5"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-orange-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">APK File</label>
                {uploading ? (
                  <div className="flex items-center gap-3 w-full border border-orange-200 bg-orange-50 rounded-lg px-4 py-3 text-sm text-orange-700 font-bold shadow-inner">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Uploading {file?.name || 'APK'} to secure storage...
                  </div>
                ) : (
                  <input
                    type="file"
                    accept=".apk"
                    ref={fileInputRef}
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="w-full border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer"
                    required
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Release Notes (Optional)</label>
                <textarea
                  placeholder="What's new in this version?"
                  value={releaseNotes}
                  onChange={(e) => setReleaseNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-orange-500 outline-none min-h-[100px]"
                  disabled={uploading}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="mandatoryCheck"
                  checked={isMandatory}
                  onChange={(e) => setIsMandatory(e.target.checked)}
                  disabled={uploading}
                  className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-600 disabled:opacity-50"
                />
                <label htmlFor="mandatoryCheck" className={`text-sm font-semibold text-slate-700 ${uploading ? 'opacity-50' : ''}`}>
                  Mandatory Update (Forces employees to update immediately)
                </label>
              </div>

              <button
                type="submit"
                disabled={uploading}
                className={`w-full py-3 rounded-lg font-bold text-white shadow-sm flex items-center justify-center gap-2 transition-all ${
                  uploading ? 'bg-slate-400 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                Publish Release
                <Save className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Current Live Version */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              Current Live Version
            </h2>
            {latestRelease && (
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Latest
              </span>
            )}
          </div>
          <div className="p-6 flex-1 flex flex-col">
            {loading ? (
              <div className="text-sm text-slate-500 animate-pulse flex items-center justify-center h-full">Checking current version...</div>
            ) : latestRelease ? (
              <div className="flex flex-col h-full justify-center space-y-6">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center h-20 w-20 bg-emerald-100 text-emerald-700 rounded-full mb-4">
                    <Smartphone className="h-10 w-10" />
                  </div>
                  <h3 className="text-4xl font-black text-slate-900 tracking-tight">v{latestRelease.version}</h3>
                  <div className="mt-2 text-xs font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full inline-block border border-emerald-200">
                    {latestRelease.is_mandatory ? 'Mandatory Update' : 'Optional Update'}
                  </div>
                </div>
                
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 space-y-2">
                  <p><span className="font-bold text-slate-800">Released:</span> {new Date(latestRelease.created).toLocaleString()}</p>
                  {latestRelease.release_notes && (
                    <div>
                      <span className="font-bold text-slate-800 block mb-1">Release Notes:</span>
                      <p className="whitespace-pre-wrap text-slate-600 bg-white p-3 rounded-lg border border-slate-200 text-xs leading-relaxed">{latestRelease.release_notes}</p>
                    </div>
                  )}
                </div>

                <div className="mt-auto flex items-center gap-3">
                  <a 
                    href={appReleaseActions.getApkUrl(latestRelease)}
                    target="_blank"
                    className="flex-1 text-center py-3 rounded-lg font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Download className="h-4 w-4" /> Download APK
                  </a>
                  <button
                    onClick={() => handleDelete(latestRelease.id, latestRelease.version)}
                    disabled={deletingId === latestRelease.id}
                    title="Delete this release"
                    className="p-3 text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {deletingId === latestRelease.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500 text-center flex flex-col items-center justify-center h-full py-12">
                <Smartphone className="h-12 w-12 text-slate-300 mb-3" />
                No APKs have been published yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Previous Releases History Section */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <History className="h-5 w-5 text-slate-500" />
            Release History ({allReleases.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500 animate-pulse">Loading releases history...</div>
        ) : allReleases.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No releases found in history.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3.5">Version</th>
                  <th className="px-6 py-3.5">Type</th>
                  <th className="px-6 py-3.5">Date Published</th>
                  <th className="px-6 py-3.5">Release Notes</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allReleases.map((rel, idx) => (
                  <tr key={rel.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>v{rel.version}</span>
                        {idx === 0 && (
                          <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                            Latest
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                        rel.is_mandatory ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {rel.is_mandatory ? 'Mandatory' : 'Optional'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(rel.created).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-600 max-w-xs truncate">
                      {rel.release_notes || <span className="italic text-slate-400">No notes</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={appReleaseActions.getApkUrl(rel)}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors"
                        >
                          <Download className="h-3.5 w-3.5 text-slate-500" />
                          Download
                        </a>
                        <button
                          onClick={() => handleDelete(rel.id, rel.version)}
                          disabled={deletingId === rel.id}
                          className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-200 transition-colors disabled:opacity-50"
                        >
                          {deletingId === rel.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
