'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useProfiles, useTeams, hrActions, Profile } from '@/lib/hrData';
import { Video, Calendar, Clock, Users, ExternalLink } from 'lucide-react';
import { getSessionEmail } from '@/lib/session';
import { useActionToast } from '@/components/ui/ActionToastHost';
import { FormField } from '@/components/ui/FormField';
import { Input, Select, Textarea } from '@/components/ui/Input';

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
  const { showToast } = useActionToast();

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);

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

      setIsSubmitting(false);
      setTitle('');
      setDescription('');
      onClose();
      showToast({ type: 'success', message: 'Google Meet room generated and invitation sent!' });
    } catch (err: any) {
      setIsSubmitting(false);
      showToast({ type: 'error', message: err.message || 'Failed to schedule meeting' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Schedule Google Meet" className="md:max-w-lg">
      <form onSubmit={handleSchedule} className="space-y-4 pt-1">
        <FormField label="Meeting Title *">
          <Input
            type="text"
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Weekly Operations Sync"
            fieldSize="lg"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Date *">
            <Input
              type="date"
              required
              value={meetingDate}
              onChange={e => setMeetingDate(e.target.value)}
              fieldSize="lg" className="cursor-pointer"
            />
          </FormField>
          <FormField label="Start Time *">
            <Input
              type="time"
              required
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              fieldSize="lg" className="cursor-pointer"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Duration">
            <Select
              value={durationMinutes}
              onChange={e => setDurationMinutes(e.target.value)}
              fieldSize="lg" className="cursor-pointer"
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
            </Select>
          </FormField>

          <FormField label="Invite Audience">
            <Select
              value={targetType}
              onChange={e => setTargetType(e.target.value as any)}
              fieldSize="lg" className="cursor-pointer"
            >
              <option value="team">Whole Team</option>
              <option value="individual">Specific Employee</option>
            </Select>
          </FormField>
        </div>

        {targetType === 'team' ? (
          <FormField label="Select Team">
            <Select
              value={selectedTeam}
              onChange={e => setSelectedTeam(e.target.value)}
              fieldSize="lg" className="cursor-pointer"
            >
              {teamsData.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </Select>
          </FormField>
        ) : (
          <FormField label="Select Employee">
            <Select
              value={selectedEmployeeEmail}
              onChange={e => setSelectedEmployeeEmail(e.target.value)}
              fieldSize="lg" className="cursor-pointer"
            >
              <option value="">Select Employee…</option>
              {employees.map((emp: Profile) => (
                <option key={emp.id} value={emp.email}>{emp.fullName} ({emp.email})</option>
              ))}
            </Select>
          </FormField>
        )}

        <FormField label="Agenda / Notes">
          <Textarea
            rows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Brief meeting description or topics to discuss…"
            fieldSize="lg"
          />
        </FormField>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs font-semibold text-slate-700">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Google Meet Room</span>
          </div>
          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded">Instant Auto-Link</span>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
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
