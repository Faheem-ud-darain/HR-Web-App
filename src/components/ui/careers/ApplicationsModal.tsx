'use client';

import React, { useState } from 'react';
import { updateApplicationStatusAdmin, type CareerApplication, type CareerApplicationStatus } from '@/lib/hrData';
import { Badge } from '@/components/ui/Badge';
import { FormError } from '@/components/ui/FormError';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { APPLICATION_STATUSES } from './careerOptions';

interface ApplicationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  applications: CareerApplication[];
  // Reload the list after a status change (awaited, so the control waits for the fresh data).
  onChanged: () => void | Promise<void>;
}

// HR/Admin review of submitted applications: filter by position and status, expand one to read it and set its
// status.
export function ApplicationsModal({ isOpen, onClose, applications, onChanged }: ApplicationsModalProps) {
  const [positionFilter, setPositionFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<CareerApplicationStatus | 'All'>('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const positionTitles = Array.from(new Set(applications.map(a => a.positionTitle))).sort();
  const shown = applications.filter(app =>
    (positionFilter === 'All' || app.positionTitle === positionFilter) &&
    (statusFilter === 'All' || app.status === statusFilter),
  );

  const changeStatus = async (id: string, status: CareerApplicationStatus) => {
    setUpdatingId(id);
    setError('');
    try {
      await updateApplicationStatusAdmin(id, status);
      await onChanged();
    } catch (err) {
      console.error('Application status update failed:', err);
      setError('Could not change that status. Please try again.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Job Applications (${applications.length})`}>
      <div className="space-y-3">
        <FormError>{error}</FormError>
        <div className="flex flex-wrap gap-2 pb-3 border-b border-slate-200">
          <Select value={positionFilter} onChange={e => setPositionFilter(e.target.value)} fieldSize="md">
            <option value="All">All Positions</option>
            {positionTitles.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value as CareerApplicationStatus | 'All')} fieldSize="md">
            <option value="All">All Statuses</option>
            {APPLICATION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <span className="ml-auto self-center text-[10px] font-semibold text-slate-400">{shown.length} of {applications.length} shown</span>
        </div>

        <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
          {shown.length === 0 && (
            <EmptyState py={8} size="xs">
              {applications.length === 0 ? 'No applications submitted yet.' : 'No applications match the selected filters.'}
            </EmptyState>
          )}
          {shown.map(app => {
            const expanded = expandedId === app.id;
            const status = APPLICATION_STATUSES.find(s => s.value === app.status);
            return (
              <div key={app.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <button onClick={() => setExpandedId(expanded ? null : app.id)} className="w-full flex items-center justify-between text-left">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{app.applicantName}</p>
                    <p className="text-[10px] text-orange-600 font-bold uppercase tracking-wider">{app.positionTitle}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={status?.variant} size="sm" className="uppercase tracking-wider">{status?.label || app.status}</Badge>
                    <span className="text-[9px] text-slate-400 font-semibold shrink-0">{app.submittedAt}</span>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-slate-200 pt-3 mt-1 space-y-3">
                    <p className="text-xs text-slate-500 font-semibold">{app.applicantEmail}</p>
                    {app.coverLetter && <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{app.coverLetter}</p>}
                    <div className="flex items-center gap-2 pt-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest shrink-0">Status</label>
                      <Select
                        value={app.status}
                        disabled={updatingId === app.id}
                        onChange={e => changeStatus(app.id, e.target.value as CareerApplicationStatus)}
                        fieldSize="md"
                        className="disabled:opacity-50"
                      >
                        {APPLICATION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
