'use client';

import React, { useState, useEffect } from 'react';
import { Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { Input, Select } from '@/components/ui/Input';
import { useProfiles, updateProfileAdmin } from '@/lib/hrData';
import { useActionToast } from '@/components/ui/ActionToastHost';
import { getSessionEmail } from '@/lib/session';

// "Edit System Profiles" — lets the admin edit their own profile or the shared
// hr@ system account's name, gender and title. Renders its own trigger button
// (place it in the profile page header) and the modal.
export function AdminProfileEditor() {
  const { data: employees = [], refetch: refetchProfiles } = useProfiles();
  const { showToast } = useActionToast();
  // Profile Edit states
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [targetEmail, setTargetEmail] = useState('admin@delcargo.us');
  const [editName, setEditName] = useState('');
  const [editGender, setEditGender] = useState<'male' | 'female'>('male');
  const [editTitle, setEditTitle] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    setEmail(getSessionEmail());
  }, []);

  const profile = employees.find(e => e.email && email && e.email.toLowerCase() === email.toLowerCase()) || null;
  const hrProfile = employees.find(e => e.email && e.email.toLowerCase() === 'hr@delcargo.us') || null;

  // Update Edit inputs when target changes
  useEffect(() => {
    const target = targetEmail === 'admin@delcargo.us' ? profile : hrProfile;
    if (target) {
      setEditName(target.fullName);
      setEditGender(target.gender === 'female' ? 'female' : 'male');
      setEditTitle(target.jobTitle || '');
    }
  }, [targetEmail, profile, hrProfile]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName || isSavingEdit) return;

    setIsSavingEdit(true);
    try {
      const target = targetEmail === 'admin@delcargo.us' ? profile : hrProfile;
      if (target) {
        // targetEmail can point at either the admin's own account or the
        // separate hr@ system account, so this can't always be "self" —
        // routed through the HR/Admin-gated route rather than
        // updateProfileSelf, same as any other admin-edits-a-profile call.
        await updateProfileAdmin(target.id, {
          fullName: editName,
          gender: editGender,
          jobTitle: editTitle
        });
      }

      refetchProfiles();
      setIsEditOpen(false);
      showToast({ type: 'success', message: 'Profile updated successfully!' });
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
          setTargetEmail(profile.email);
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
              value={targetEmail}
              onChange={e => setTargetEmail(e.target.value)}
              fieldSize="md"
            >
              <option value="admin@delcargo.us">Admin Profile (admin@delcargo.us)</option>
              <option value="hr@delcargo.us">HR Profile (hr@delcargo.us)</option>
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
              onChange={e => setEditGender(e.target.value as any)}
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
