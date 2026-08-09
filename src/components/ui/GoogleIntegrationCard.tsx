'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { hrActions, Profile } from '@/lib/hrData';
import { CheckCircle2, AlertCircle, Calendar, Video, ShieldCheck, Mail, Link as LinkIcon, RefreshCw, Trash2 } from 'lucide-react';

interface GoogleIntegrationCardProps {
  profile: Profile;
  onUpdate?: () => void;
}

export function GoogleIntegrationCard({ profile, onUpdate }: GoogleIntegrationCardProps) {
  const [googleData, setGoogleData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await hrActions.getKV(`google_integration_${profile.email.toLowerCase()}`);
        if (active) setGoogleData(data);
      } catch (err) {
        // null if never connected
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [profile.email]);

  const handleConnect = () => {
    setConnecting(true);
    setMsg(null);
    
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
    const redirectUri = `${window.location.origin}/api/auth/google/callback`;
    const scope = encodeURIComponent('openid email profile https://www.googleapis.com/auth/calendar.events');
    const state = encodeURIComponent(JSON.stringify({ email: profile.email }));

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=${scope}&state=${state}&access_type=offline&prompt=consent`;

    const popup = window.open(authUrl, 'GoogleAuthPopup', 'width=550,height=650');

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        window.removeEventListener('message', handleMessage);
        popup?.close();
        setConnecting(false);
        setMsg({ type: 'success', text: `Successfully linked ${event.data.email}!` });
        const updated = await hrActions.getKV(`google_integration_${profile.email.toLowerCase()}`);
        setGoogleData(updated);
        if (onUpdate) onUpdate();
      } else if (event.data?.type === 'GOOGLE_AUTH_ERROR') {
        window.removeEventListener('message', handleMessage);
        popup?.close();
        setConnecting(false);
        setMsg({ type: 'error', text: event.data.error || 'Failed to connect Google account.' });
      }
    };

    window.addEventListener('message', handleMessage);
  };

  const handleToggle = async (key: 'syncCalendar' | 'useFor2FA' | 'useForPasswordReset', val: boolean) => {
    if (!googleData) return;
    const nextData = { ...googleData, [key]: val };
    setGoogleData(nextData);
    await hrActions.setKV(`google_integration_${profile.email.toLowerCase()}`, nextData);
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your Google account? Calendar sync and Gmail 2FA will be disabled.')) return;
    setLoading(true);
    await hrActions.deleteKV(`google_integration_${profile.email.toLowerCase()}`);
    setGoogleData(null);
    setLoading(false);
    setMsg({ type: 'success', text: 'Google account disconnected.' });
  };

  if (loading) {
    return (
      <Card className="border border-slate-200 p-5 animate-pulse space-y-3">
        <div className="h-4 bg-slate-200 rounded w-1/3" />
        <div className="h-10 bg-slate-100 rounded" />
      </Card>
    );
  }

  return (
    <Card className="border border-slate-200 p-0 overflow-hidden">
      <div className="px-6 pt-5 pb-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <h3 className="font-bold text-slate-900 text-sm">Google Account & Calendar</h3>
        </div>
        {googleData?.connectedEmail && (
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Connected
          </span>
        )}
      </div>

      <div className="p-6 space-y-4">
        {msg && (
          <div
            className={`p-3 text-xs font-semibold rounded-xl flex items-center gap-2 ${
              msg.type === 'error'
                ? 'bg-rose-50 text-rose-700 border border-rose-100'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
            }`}
          >
            {msg.type === 'error' ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {msg.text}
          </div>
        )}

        {!googleData ? (
          <div className="text-center py-4 space-y-3">
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Connect your Google Account to sync meetings & shifts to Google Calendar, create Google Meet rooms, and enable Gmail 2FA & Password Reset.
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-800 font-bold border border-slate-300 px-4 py-2.5 rounded-xl text-xs shadow-sm transition-all active:scale-97 disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              {connecting ? 'Connecting to Google…' : 'Connect Google Account'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-sm shrink-0">
                  {googleData.connectedEmail[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{googleData.connectedEmail}</p>
                  <p className="text-[10px] text-slate-400 font-semibold">Linked Google Account</p>
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                title="Disconnect Google Account"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5 pt-1">
              <label className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <Calendar className="h-4 w-4 text-orange-600 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Sync Google Calendar</p>
                    <p className="text-[10px] text-slate-400">Sync shifts & meetings directly to your Google Calendar</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={googleData.syncCalendar !== false}
                  onChange={e => handleToggle('syncCalendar', e.target.checked)}
                  className="h-4 w-4 accent-orange-600 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Gmail 2FA Verification</p>
                    <p className="text-[10px] text-slate-400">Send 2FA security codes to {googleData.connectedEmail}</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={googleData.useFor2FA !== false}
                  onChange={e => handleToggle('useFor2FA', e.target.checked)}
                  className="h-4 w-4 accent-orange-600 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 text-indigo-600 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Password Reset via Connected Gmail</p>
                    <p className="text-[10px] text-slate-400">Allow resetting password using this connected Gmail</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={googleData.useForPasswordReset !== false}
                  onChange={e => handleToggle('useForPasswordReset', e.target.checked)}
                  className="h-4 w-4 accent-orange-600 cursor-pointer"
                />
              </label>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
