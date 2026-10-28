'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { displayName, Profile, TrackingSettings, TrackerDiagnostics } from '@/lib/hrData';
import { TRACKER_DOWNLOAD_WINDOWS_URL, TRACKER_DOWNLOAD_MAC_URL, TRACKER_DOWNLOAD_CHROMEOS_URL, encodeSetupCode, getPocketBaseConfig, POCKETBASE_URL } from '@/lib/trackerSetup';
import { DownloadSimpleIcon as Download, CopyIcon as Copy, ArrowsClockwiseIcon as RefreshCw, WifiSlashIcon as WifiOff, WarningIcon as AlertTriangle } from '@/components/ui/icons';
import { formatDateTimeNY } from '@/lib/timezone';
import { AGENT_SCRIPT_PATH } from '@/lib/core/trackingWindow';

interface TrackerSetupModalProps {
  setupEmp: Profile | null;
  diagnosticsRequestIdRef: React.RefObject<number>;
  setSetupEmp: React.Dispatch<React.SetStateAction<Profile | null>>;
  role: "admin" | "hr" | "team_lead";
  settingsFor: (email: string) => TrackingSettings;
  copySetupCode: (settings: TrackingSettings) => void;
  copied: boolean;
  handleRegenerateToken: (email: string) => void;
  handleForceDisconnect: (email: string) => void;
  copyConfig: (settings: TrackingSettings) => void;
  handleRunDiagnostics: (email: string) => Promise<void>;
  diagnosticsStatus: "idle" | "waiting" | "ok" | "timeout" | "error";
  handleReloadSettingsNow: (email: string) => Promise<void>;
  handleTrackerAction: (email: string, type: 'reconnect' | 'restart') => Promise<void>;
  diagnosticsResult: TrackerDiagnostics | null;
  copyDiagnosticsReport: (emp: Profile, diag: TrackerDiagnostics) => void;
  copiedDiagnostics: boolean;
}

export function TrackerSetupModal({ setupEmp, diagnosticsRequestIdRef, setSetupEmp, role, settingsFor, copySetupCode, copied, handleRegenerateToken, handleForceDisconnect, copyConfig, handleRunDiagnostics, diagnosticsStatus, handleReloadSettingsNow, handleTrackerAction, diagnosticsResult, copyDiagnosticsReport, copiedDiagnostics }: TrackerSetupModalProps) {
  return (
    <Modal
            isOpen={!!setupEmp}
            onClose={() => {
              diagnosticsRequestIdRef.current += 1; // invalidate any in-flight poll
              setSetupEmp(null);
            }}
            title={setupEmp ? `Setup Agent — ${displayName(setupEmp, role)}` : 'Setup Agent'}
          >
            {setupEmp && (() => {
              const settings = settingsFor(setupEmp.email);
              return (
                <div className="space-y-5">
                  <div className="space-y-3">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      <span className="font-bold text-slate-800">Step 1.</span> Have the employee download the <span className="font-semibold">DelCargo Tracker</span> app for their computer (no Python or setup required) and install it like any other program.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={TRACKER_DOWNLOAD_WINDOWS_URL}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 px-3 py-2 rounded-lg active:scale-97 transition-colors transition-transform"
                      >
                        <Download className="h-3.5 w-3.5" /> Download for Windows
                      </a>
                      <a
                        href={TRACKER_DOWNLOAD_MAC_URL}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 px-3 py-2 rounded-lg active:scale-97 transition-colors transition-transform"
                      >
                        <Download className="h-3.5 w-3.5" /> Download for Mac
                      </a>
                      <a
                        href={TRACKER_DOWNLOAD_CHROMEOS_URL}
                        download="Delcargo_Chromebook_Tracker.zip"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-3 py-2 rounded-lg active:scale-97 transition-colors transition-transform"
                      >
                        <Download className="h-3.5 w-3.5" /> Chrome OS Extension (.zip)
                      </a>
                    </div>
                  </div>
    
                  <div className="space-y-2 border-t border-slate-200 pt-4">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      <span className="font-bold text-slate-800">Step 2.</span> Copy this one-time setup code and have them paste it into the app when it first opens.
                    </p>
                    <div className="bg-slate-900 text-slate-100 rounded-lg p-3 font-mono text-caption leading-relaxed overflow-x-auto break-all">
                      {encodeSetupCode(getPocketBaseConfig().url, settings.agentToken)}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => copySetupCode(settings)}
                        className="text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 px-3 py-2 rounded-lg flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
                      >
                        <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied!' : 'Copy Setup Code'}
                      </button>
                      <button
                        onClick={() => handleRegenerateToken(setupEmp.email)}
                        className="text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-lg flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Regenerate Token
                      </button>
                      <button
                        onClick={() => handleForceDisconnect(setupEmp.email)}
                        className="text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-lg flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
                        title="Unblock a stuck &quot;device already connected&quot; report without changing their setup code"
                      >
                        <WifiOff className="h-3.5 w-3.5" /> Force Disconnect All Trackers
                      </button>
                    </div>
                  </div>
    
                  <details className="border-t border-slate-200 pt-3">
                    <summary className="text-caption font-bold text-slate-500 uppercase tracking-wider cursor-pointer">Advanced: raw script (requires Python)</summary>
                    <div className="mt-2 space-y-2">
                      <div className="bg-slate-900 text-slate-100 rounded-lg p-3 font-mono text-caption leading-relaxed overflow-x-auto whitespace-pre">
    {`POCKETBASE_URL=${POCKETBASE_URL}
    AGENT_TOKEN=${settings.agentToken}`}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => copyConfig(settings)}
                          className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
                        >
                          <Copy className="h-3.5 w-3.5" /> Copy Config
                        </button>
                        <a
                          href={AGENT_SCRIPT_PATH}
                          download
                          className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
                        >
                          <Download className="h-3.5 w-3.5" /> Download .py Script
                        </a>
                      </div>
                      <p className="text-caption text-slate-400 leading-relaxed">
                        Requires Python 3 installed on the employee&apos;s machine. Run <code className="bg-slate-100 px-1 rounded">pip install pyautogui pillow requests --break-system-packages</code> then <code className="bg-slate-100 px-1 rounded">python delcargo_tracker_agent.py</code>.
                      </p>
                    </div>
                  </details>
    
                  <div className="space-y-2 border-t border-slate-200 pt-4">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      <span className="font-bold text-slate-800">Live diagnostics.</span> Ask this employee&apos;s tracker directly what&apos;s happening right now, instead of guessing from the last heartbeat. Only works on tracker app v19 or newer — an older build simply won&apos;t answer.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleRunDiagnostics(setupEmp.email)}
                        disabled={diagnosticsStatus === 'waiting'}
                        className="text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-50 px-3 py-2 rounded-lg flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${diagnosticsStatus === 'waiting' ? 'animate-spin' : ''}`} />
                        {diagnosticsStatus === 'waiting' ? 'Asking tracker…' : 'Run Diagnostics'}
                      </button>
                      <button
                        onClick={() => handleReloadSettingsNow(setupEmp.email)}
                        className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
                        title="Tell the tracker to re-check its settings and shift status right now instead of waiting for its next poll"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Reload Settings Now
                      </button>
                      <button
                        onClick={() => handleTrackerAction(setupEmp.email, 'reconnect')}
                        className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
                        title="Make the tracker re-claim this device and refresh its connection now (tracker v25+)"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Reconnect Device
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('Restart this employee\u2019s tracker app? It closes and reopens within a few seconds. A running shift is not ended.')) {
                            handleTrackerAction(setupEmp.email, 'restart');
                          }
                        }}
                        className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
                        title="Close and reopen the tracker app on the employee's machine without ending their shift (tracker v25+)"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Restart Tracker
                      </button>
                    </div>
    
                    {diagnosticsStatus === 'timeout' && (
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-3 rounded-lg">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-caption text-slate-700 leading-relaxed">
                          No response after 10 seconds. This means either the tracker isn&apos;t running right now, or it&apos;s still on an older build (pre-v19) that doesn&apos;t know how to answer yet — not necessarily that anything is broken.
                        </p>
                      </div>
                    )}
    
                    {diagnosticsStatus === 'error' && (
                      <div role="alert" className="flex items-start gap-2 bg-rose-50 border border-rose-200 p-3 rounded-lg">
                        <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                        <p className="text-caption text-slate-700 leading-relaxed">Could not send the diagnostics request. Check the connection and try again.</p>
                      </div>
                    )}

                    {diagnosticsStatus === 'ok' && diagnosticsResult && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-caption font-bold text-slate-500 uppercase tracking-wider">
                            Responded {formatDateTimeNY(diagnosticsResult.respondedAt)}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-caption font-mono text-slate-400">
                              v{diagnosticsResult.appVersion} · {diagnosticsResult.platform}
                            </span>
                            <button
                              onClick={() => copyDiagnosticsReport(setupEmp, diagnosticsResult)}
                              title="Copy this report as plain text — paste it into a ticket, Slack, or an AI chat for help troubleshooting"
                              className="text-caption font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 px-2 py-1 rounded-md flex items-center gap-1 active:scale-97 transition-colors transition-transform"
                            >
                              <Copy className="h-3.5 w-3.5" /> {copiedDiagnostics ? 'Copied!' : 'Copy Report'}
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-caption text-slate-700">
                          <span>Connection: <span className="font-semibold">{diagnosticsResult.connectionStatus || (diagnosticsResult.connected ? 'connected' : 'disconnected')}</span></span>
                          <span>Tracking (HR): <span className="font-semibold">{diagnosticsResult.enabledByHr ? 'enabled' : 'disabled'}</span></span>
                          <span>Shift active: <span className="font-semibold">{diagnosticsResult.shiftActive ? 'yes' : 'no'}</span></span>
                          <span>Currently capturing: <span className="font-semibold">{diagnosticsResult.enabled ? 'yes' : 'no'}</span></span>
                          <span>Screen locked: <span className="font-semibold">{diagnosticsResult.isLocked ? 'yes' : 'no'}</span></span>
                          <span>Capture interval: <span className="font-semibold">{diagnosticsResult.intervalMinutes ?? '—'} min</span></span>
                          <span>Consecutive failures: <span className="font-semibold">{diagnosticsResult.consecutiveCaptureFailures ?? 0}</span></span>
                          <span>Last capture: <span className="font-semibold">{diagnosticsResult.lastCaptureAt ? formatDateTimeNY(diagnosticsResult.lastCaptureAt) : 'never'}</span></span>
                        </div>
                        {diagnosticsResult.lastError && (
                          <p className="text-caption text-rose-600 font-semibold pt-1">Last error: {diagnosticsResult.lastError}</p>
                        )}
                        {diagnosticsResult.logTail && (
                          <details className="pt-1">
                            <summary className="text-caption font-semibold text-slate-600 cursor-pointer">Recent tracker log</summary>
                            <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-900 p-2 text-caption leading-snug text-slate-100 whitespace-pre-wrap break-words">{diagnosticsResult.logTail}</pre>
                          </details>
                        )}
                        {diagnosticsResult.updateAvailableVersion && (
                          <p className="text-caption text-amber-700 font-semibold pt-1">
                            Update available: v{diagnosticsResult.updateAvailableVersion} — ask the employee to restart the tracker app to pick it up.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
    
                  <p className="text-caption text-slate-400 leading-relaxed border-t border-slate-200 pt-3">
                    Tracking must be toggled &quot;Active&quot; above for captures to be accepted. The app only captures while that toggle is on and (for remote employees) their shift is active.
                  </p>
                </div>
              );
            })()}
          </Modal>
  );
}
