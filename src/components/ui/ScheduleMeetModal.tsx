'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useProfiles, useTeams, hrActions, Profile } from '@/lib/hrData';
import { Video, Calendar, Clock, Users, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { getSessionEmail } from '@/lib/session';

interface ScheduleMeetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ScheduleMeetModal({ isOpen, onClose }: ScheduleMeetModalProps) {
  const { data: employees = [] } = useProfiles();
  const { data: teamsData = [] } = useTeams();

  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [startTime, setStartTime] = useState('14:00');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [targetType, setTargetType] = useState<'team' | 'individual'>('team');
  const [selectedTeam, setSelectedTeam] = useState(teamsData[0]?.name || '');
  const [selectedEmployeeEmail, setSelectedEmployeeEmail] = useState('');
  const [description, setDescription] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const currentUserEmail = getSessionEmail() || '';
      const meetLink = 'https://meet.google.com/new';

      // 1. Format dates for Google Calendar 1-click link
      let startISO = '';
      let endISO = '';
      if (meetingDate && startTime) {
        const start = new Date(`${meetingDate}T${startTime}:00`);
        const end = new Date(start.getTime() + parseInt(durationMinutes) * 60000);
        startISO = start.toISOString().replace(/-|:|\.\d\d\d/g, '');
        endISO = end.toISOString().replace(/-|:|\.\d\d\d/g, '');
      }

      const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
        title
      )}&details=${encodeURIComponent(
        `${description}\n\nJoin Google Meet: ${meetLink}`
      )}&location=${encodeURIComponent(meetLink)}${
        startISO && endISO ? `&dates=${startISO}/${endISO}` : ''
      }`;

      // 2. Post meeting invite to Team Chat or direct message
      const announcementText = `🎥 **Google Meet Scheduled: ${title}**\n📅 Date/Time: ${meetingDate || 'Today'} at ${startTime}\n📝 Details: ${description || 'Team sync'}\n\n👉 Join Meeting: ${meetLink}\n📅 Sync to Google Calendar: ${googleCalUrl}`;

      let targetTeamId = 'general';
      if (targetType === 'team') {
        const teamObj = teamsData.find(t => t.name === selectedTeam);
        if (teamObj) targetTeamId = teamObj.id;
      }

      await hrActions.sendMessage(
        targetTeamId,
        currentUserEmail,
        'HR / Admin',
        announcementText,
        undefined,
        true // Highlighted announcement format
      );

      // 3. Add system notification
      await hrActions.addNotification(
        targetType === 'individual' ? selectedEmployeeEmail : 'all',
        'employee',
        `🎥 New Google Meet scheduled: "${title}"`
      );

      setSuccessMsg('Google Meet room generated and invitation sent!');
      setTimeout(() => {
        setIsSubmitting(false);
        setSuccessMsg('');
        setTitle('');
        setDescription('');
        onClose();
      }, 1500);
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMsg(err.message || 'Failed to schedule meeting');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Schedule Google Meet" className="md:max-w-lg">
      <form onSubmit={handleSchedule} className="space-y-4 pt-1">
        {successMsg && (
          <div className="p-3 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="p-3 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-100 rounded-xl flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            {errorMsg}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Meeting Title *</label>
          <input
            type="text"
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Weekly Operations Sync"
            className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3 text-xs outline-none font-semibold text-slate-900"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date *</label>
            <input
              type="date"
              required
              value={meetingDate}
              onChange={e => setMeetingDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3 text-xs outline-none font-semibold text-slate-900 cursor-pointer"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start Time *</label>
            <input
              type="time"
              required
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3 text-xs outline-none font-semibold text-slate-900 cursor-pointer"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Duration</label>
            <select
              value={durationMinutes}
              onChange={e => setDurationMinutes(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3 text-xs outline-none font-semibold text-slate-900 cursor-pointer"
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Invite Audience</label>
            <select
              value={targetType}
              onChange={e => setTargetType(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3 text-xs outline-none font-semibold text-slate-900 cursor-pointer"
            >
              <option value="team">Whole Team</option>
              <option value="individual">Specific Employee</option>
            </select>
          </div>
        </div>

        {targetType === 'team' ? (
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Select Team</label>
            <select
              value={selectedTeam}
              onChange={e => setSelectedTeam(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3 text-xs outline-none font-semibold text-slate-900 cursor-pointer"
            >
              {teamsData.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Select Employee</label>
            <select
              value={selectedEmployeeEmail}
              onChange={e => setSelectedEmployeeEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3 text-xs outline-none font-semibold text-slate-900 cursor-pointer"
            >
              <option value="">Select Employee…</option>
              {employees.map((emp: Profile) => (
                <option key={emp.id} value={emp.email}>{emp.fullName} ({emp.email})</option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Agenda / Notes</label>
          <textarea
            rows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Brief meeting description or topics to discuss…"
            className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3 text-xs outline-none font-semibold text-slate-900"
          />
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs font-semibold text-slate-700">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Google Meet Room</span>
          </div>
          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded">Instant Auto-Link</span>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Video className="h-3.5 w-3.5" />
            {isSubmitting ? 'Scheduling…' : 'Schedule Google Meet'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
