'use client';

import React, { useState } from 'react';
import { PencilSimpleIcon as Edit2 } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { Input, Select } from '@/components/ui/Input';
import { useProfiles, updateProfileAdmin } from '@/lib/hrData';
import { useActionToast } from '@/components/ui/ActionToastHost';
import { useSessionEmail } from '@/lib/useSession';

// "Edit System Profiles" — lets the admin edit their own profile or the shared
// hr@ system account's name, gender and title. Renders its own trigger button
// (place it in the profile page header) and the modal.
export function AdminProfileEditor() {
  const { data: employees = [], refetch: refetchProfiles } = useProfiles();
  const { showToast } = useActionToast();
  // Profile Edit states
  const [isEditOpen, setIsEditOpen] = useState(false);
  // Which account is being edited: the signed-in admin's own ('self') or the shared hr@ account ('hr').
  // A stable key, not an email: the admin's stored email can differ in case (or there can be a second
  // admin), and comparing against a literal address made the editor silently fall through to the HR account.
  const [targetWho, setTargetWho] = useState<'self' | 'hr'>('self');
  const [editError, setEditError] = useState('');
  const [editName, setEditName] = useState('');
  const [editGender, setEditGender] = useState<'male' | 'female'>('male');
  const [editTitle, setEditTitle] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const email = useSessionEmail();

  const profile = employees.find(e => e.email && email && e.email.toLowerCase() === email.toLowerCase()) || null;
  const hrProfile = employees.find(e => e.email && e.email.toLowerCase() === 'hr@delcargo.us') || null;

  // Fill the edit form from the profile being edited — whenever that profile's own
  // details change (not merely when the roster list is re-fetched, which would wipe
  // what's being typed). Adjusting state while rendering is React's way of resetting
  // state from props.
  const target = targetWho === 'self' ? profile : hrProfile;
  const seedKey = target ? [target.id, target.fullName, target.gender, target.jobTitle].join('|') : '';
  const [seededFrom, setSeededFrom] = useState('');
  if (seedKey !== seededFrom) {
    setSeededFrom(seedKey);
    if (target) {
      setEditName(target.fullName);
      setEditGender(target.gender === 'female' ? 'female' : 'male');
      setEditTitle(target.jobTitle || '');
    }
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName || isSavingEdit) return;

    setEditError('');
    // Nothing to save to: say so, instead of closing the window with a success message.
    if (!target) {
      setEditError(targetWho === 'hr' ? 'The HR profile could not be found, so nothing was saved.' : 'Your profile could not be found, so nothing was saved.');
      return;
    }
    setIsSavingEdit(true);
    try {
      // Either the admin's own account or the separate hr@ system account, so this can't always be
      // "self" — routed through the HR/Admin-gated route rather than updateProfileSelf.
      await updateProfileAdmin(target.id, {
        fullName: editName,
        gender: editGender,
        jobTitle: editTitle
      });
      refetchProfiles();
      setIsEditOpen(false);
      showToast({ type: 'success', message: 'Profile updated successfully!' });
    } catch (err) {
      console.error('Profile update failed:', err);
      setEditError('Could not save the changes. Please try again.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  if (!profile) return null;

  return (
    <>
      <Button
        variant="primary"
        onClick={() => {
          setTargetWho('self');
          setEditError('');
          setIsEditOpen(true);
        }}
        className="shadow-md active:scale-97 transition-transform self-stretch sm:self-auto"
      >
        <Edit2 className="h-3.5 w-3.5" /> Edit System Profiles
      </Button>

      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Edit System Profile">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <FormField label="Select Profile to Edit" size="md">
            <Select
              value={targetWho}
              onChange={e => { setTargetWho(e.target.value as 'self' | 'hr'); setEditError(''); }}
              fieldSize="md"
            >
              <option value="self">Admin Profile ({profile.email})</option>
              <option value="hr">HR Profile (hr@delcargo.us)</option>
            </Select>
          </FormField>

          <FormField label="Full Name" size="md">
            <Input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              fieldSize="md"
              placeholder="Full Name"
              required
            />
          </FormField>

          <FormField label="Gender" size="md">
            <Select
              value={editGender}
              onChange={e => setEditGender(e.target.value as Parameters<typeof setEditGender>[0])}
              fieldSize="md"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
          </FormField>

          <FormField label="Job Title" size="md">
            <Input
              type="text"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              fieldSize="md"
              placeholder="e.g. HR Director / System Administrator"
            />
          </FormField>

          {editError && <p role="alert" className="text-xs font-semibold text-rose-600">{editError}</p>}

          <button
            type="submit"
            disabled={isSavingEdit}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 rounded-lg text-sm active:scale-97 transition-colors transition-transform mt-4 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSavingEdit ? 'Saving…' : 'Save Profile Changes'}
          </button>
        </form>
      </Modal>
    </>
  );
}
