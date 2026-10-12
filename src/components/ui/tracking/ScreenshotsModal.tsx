'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { displayName, Profile, Screenshot, InactivityLog } from '@/lib/hrData';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Download, MousePointerClick, ZoomIn } from 'lucide-react';
import { formatShortDateNY, formatTimeNY, formatDateTimeNY } from '@/lib/timezone';
import { EmptyState } from '@/components/ui/EmptyState';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { localDateString } from '@/components/ui/TrackingView';

interface ScreenshotsModalProps {
  viewerEmp: Profile | null;
  setViewerEmp: React.Dispatch<React.SetStateAction<Profile | null>>;
  role: "admin" | "hr" | "team_lead";
  handleRangeChange: (range: "2days" | "day" | "week" | "month") => void;
  viewerRange: "2days" | "day" | "week" | "month";
  viewerDay: string;
  handleDayChange: (day: string) => void;
  handleExportZip: () => Promise<void>;
  viewerShots: Screenshot[];
  exporting: boolean;
  viewerLoading: boolean;
  viewerInactivity: InactivityLog[];
  formatDuration: (seconds: number) => string;
  totalInactiveSeconds: number;
  openLightbox: (index: number) => void;
}

export function ScreenshotsModal({ viewerEmp, setViewerEmp, role, handleRangeChange, viewerRange, viewerDay, handleDayChange, handleExportZip, viewerShots, exporting, viewerLoading, viewerInactivity, formatDuration, totalInactiveSeconds, openLightbox }: ScreenshotsModalProps) {
  return (
    <Modal isOpen={!!viewerEmp} onClose={() => setViewerEmp(null)} title={viewerEmp ? `Screenshots — ${displayName(viewerEmp, role)}` : 'Screenshots'}>
      {viewerEmp && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => handleRangeChange('2days')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors transition-shadow ${viewerRange === '2days' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                >
                  Last 2 Days
                </button>
                <button
                  onClick={() => handleRangeChange('day')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors transition-shadow ${viewerRange === 'day' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                >
                  Daily
                </button>
                <button
                  onClick={() => handleRangeChange('week')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors transition-shadow ${viewerRange === 'week' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                >
                  7 Days
                </button>
                <button
                  onClick={() => handleRangeChange('month')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors transition-shadow ${viewerRange === 'month' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                >
                  30 Days
                </button>
              </div>
              {viewerRange === 'day' && (
                <Input
                  type="date"
                  value={viewerDay}
                  max={localDateString()}
                  onChange={e => handleDayChange(e.target.value)}
                  fieldSize="md"
                />
              )}
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={handleExportZip}
              disabled={viewerShots.length === 0 || exporting}
            >
              <Download className="h-3.5 w-3.5" /> {exporting ? 'Exporting…' : `Export ${viewerShots.length} as ZIP`}
            </Button>
          </div>
    
          {/* Mouse Inactivity Summary — total idle time + when it happened,
              reported by the desktop agent (see agent_gui.py's
              _inactivity_loop). Most meaningful on the Daily view (one
              shift), but shown for Weekly/Monthly too. */}
          {!viewerLoading && (
            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                  <MousePointerClick className="h-3.5 w-3.5" /> Mouse Inactivity (3+ min stretches)
                </span>
                <span className="text-xs font-bold text-amber-800">
                  {viewerInactivity.length === 0 ? 'None recorded' : `${formatDuration(totalInactiveSeconds)} total`}
                </span>
              </div>
              {viewerInactivity.length > 0 && (
                <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                  {viewerInactivity.map(log => (
                    <div key={log.id} className="flex items-center justify-between text-[10px] text-amber-700 font-semibold">
                      <span>
                        {formatShortDateNY(log.startAt)}, {formatTimeNY(log.startAt)}
                        {' – '}
                        {formatTimeNY(log.endAt)}
                      </span>
                      <span>{formatDuration(log.durationSeconds)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
    
          {viewerLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 bg-slate-200/70 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : viewerShots.length === 0 ? (
            <EmptyState py={10} size="xs">No screenshots captured in this period.</EmptyState>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto pr-1">
              {viewerShots.map((shot, idx) => (
                <button
                  key={shot.id}
                  onClick={() => openLightbox(idx)}
                  className="space-y-1 text-left group"
                >
                  <div className="relative overflow-hidden rounded-lg border border-slate-200 group-hover:border-orange-300 transition-colors">
                    <OptimizedImage
                      src={shot.imageUrl}
                      alt="Screenshot"
                      width={300}
                      height={180}
                      className="w-full h-24 object-cover"
                    />
                    <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/30 transition-colors flex items-center justify-center">
                      <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 font-semibold text-center">{formatDateTimeNY(shot.timestamp)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
