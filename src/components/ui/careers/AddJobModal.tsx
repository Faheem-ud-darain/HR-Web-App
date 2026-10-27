'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { hrActions } from '@/lib/hrData';
import { useActionToast } from '@/components/ui/ActionToastHost';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { DEPARTMENTS } from './careerOptions';

// HR/Admin: post a new job listing. Requirements are typed one per line.
export function AddJobModal({ isOpen, onClose, onPosted }: { isOpen: boolean; onClose: () => void; onPosted: () => void }) {
  const { showToast } = useActionToast();
  const [title, setTitle] = useState('');
  const [dept, setDept] = useState(DEPARTMENTS[0]);
  const [loc, setLoc] = useState('');
  const [desc, setDesc] = useState('');
  const [reqsText, setReqsText] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !loc || !desc || busy) return;
    setBusy(true);
    try {
      await hrActions.addCareer({
        title,
        department: dept,
        location: loc,
        description: desc,
        requirements: reqsText.split('\n').map(r => r.trim()).filter(Boolean),
      });
      onPosted();
      onClose();
      setTitle('');
      setLoc('');
      setDesc('');
      setReqsText('');
      showToast({ type: 'success', message: 'Position listed successfully!' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Job Listing">
      <form onSubmit={submit} className="space-y-4 pt-1">
        <FormField label="Job Title *">
          <Input type="text" required value={title} onChange={e => setTitle(e.target.value)} fieldSize="soft" placeholder="e.g. Lead QA Engineer" />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Department">
            <Select value={dept} onChange={e => setDept(e.target.value)} fieldSize="soft" chevron>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
          </FormField>
          <FormField label="Location *">
            <Input type="text" required value={loc} onChange={e => setLoc(e.target.value)} fieldSize="soft" placeholder="e.g. Remote (Pakistan)" />
          </FormField>
        </div>

        <FormField label="Description *">
          <Textarea required rows={3} value={desc} onChange={e => setDesc(e.target.value)} fieldSize="lg" className="resize-none" placeholder="Provide details about the role..." />
        </FormField>

        <FormField label="Requirements (One per line)">
          <Textarea rows={3} value={reqsText} onChange={e => setReqsText(e.target.value)} fieldSize="lg" placeholder={'Requirement 1\nRequirement 2\nRequirement 3'} />
        </FormField>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="outline" size="md" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {busy ? 'Posting…' : 'Post Opening'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
