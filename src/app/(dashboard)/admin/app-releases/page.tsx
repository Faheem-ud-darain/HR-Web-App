'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, Upload, Save, CheckCircle2, Download, Smartphone, Loader2 } from 'lucide-react';
import { appReleaseActions, AppRelease } from '@/lib/appReleases';

export default function AppReleasesPage() {
  const [latestRelease, setLatestRelease] = useState<AppRelease | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [version, setVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [isMandatory, setIsMandatory] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchLatest();
  }, []);

  const fetchLatest = async () => {
    setLoading(true);
    const latest = await appReleaseActions.getLatestRelease();
    setLatestRelease(latest);
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
      await fetchLatest();
    } catch (err: any) {
      console.error(err);
      setError('Failed to upload the APK. Please check your network and ensure the hr_app_releases collection exists.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">App Releases (APK)</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload new Android APKs here. Employees on older versions will be prompted or forced to update.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              Current Live Version
            </h2>
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
                  <h3 className="text-4xl font-black text-slate-900 tracking-tight">{latestRelease.version}</h3>
                  <div className="mt-2 text-xs font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full inline-block">
                    {latestRelease.is_mandatory ? 'Mandatory Update' : 'Optional Update'}
                  </div>
                </div>
                
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 space-y-2">
                  <p><span className="font-bold">Released:</span> {new Date(latestRelease.created).toLocaleString()}</p>
                  {latestRelease.release_notes && (
                    <div>
                      <span className="font-bold block mb-1">Release Notes:</span>
                      <p className="whitespace-pre-wrap text-slate-600 bg-white p-3 rounded border border-slate-200">{latestRelease.release_notes}</p>
                    </div>
                  )}
                </div>

                <a 
                  href={appReleaseActions.getApkUrl(latestRelease)}
                  target="_blank"
                  className="mt-auto block text-center py-3 rounded-lg font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors"
                >
                  <Download className="h-4 w-4 inline mr-2" /> Download Current APK
                </a>
              </div>
            ) : (
              <div className="text-sm text-slate-500 text-center flex flex-col items-center justify-center h-full">
                <Smartphone className="h-12 w-12 text-slate-300 mb-3" />
                No APKs have been published yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
