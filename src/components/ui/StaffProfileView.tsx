'use client';

import React, { useMemo, useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Profile, useProfiles, updateProfileSelf, changeOwnPassword } from '@/lib/hrData';
import { useActionToast } from '@/components/ui/ActionToastHost';
import { getSessionEmail } from '@/lib/session';
import { formatDateNY } from '@/lib/timezone';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { AvatarCropperModal } from '@/components/ui/lazy';
import { NotificationPreferencesCard } from '@/components/ui/NotificationPreferencesCard';
import { AppVersionCard } from '@/components/ui/AppVersionCard';
import { AppearanceCard } from '@/components/ui/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { User, Mail, Briefcase, Calendar, ShieldCheck, KeyRound, AlertCircle, Camera } from 'lucide-react';
import { FormField } from '@/components/ui/FormField';
import { useSessionEmail } from '@/lib/useSession';
import { errMsg } from '@/lib/errors';

type StaffProfileViewProps = {
  /** Prefix for console error messages, e.g. "HR Profile". */
  logTag: string;
  title: string;
  subtitle: string;
  /** Shown when the profile has no job title set. */
  defaultJobTitle: string;
  defaultGender: 'Male' | 'Female';
  /** Label for the "Security Role" row. */
  securityRoleLabel: string;
  /** Extra controls rendered next to the title (e.g. the admin's "Edit System Profiles"). */
  headerAction?: React.ReactNode;
};

// The signed-in HR / Admin user's own profile page: avatar + photo change,
// account details, password change, notification preferences. The two role
// pages only differ in copy and an optional header action.
export function StaffProfileView({ logTag, title, subtitle, defaultJobTitle, defaultGender, securityRoleLabel, headerAction }: StaffProfileViewProps) {
  const { data: employees = [], refetch: refetchProfiles } = useProfiles();
  const sessionEmail = useSessionEmail();
  const profile: Profile | null = useMemo(
    () => employees.find((e: Profile) => e.email && sessionEmail && e.email.toLowerCase() === sessionEmail.toLowerCase()) || null,
    [employees, sessionEmail],
  );

  // Profile picture upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const { showToast } = useActionToast();

  // Password reset states
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [resetError, setResetError] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handlePhotoInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast({ type: 'error', message: 'Please choose an image file.' });
      return;
    }
    setPendingPhotoFile(file);
  };

  const handlePhotoSave = async (webpDataUrl: string) => {
    if (!profile?.id) return;
    try {
      await updateProfileSelf({ profilePicture: webpDataUrl });
      await refetchProfiles();
      setPendingPhotoFile(null);
      showToast({ type: 'success', message: 'Profile picture updated!' });
    } catch (err) {
      console.error(`[${logTag}] Photo update error:`, err);
      showToast({ type: 'error', message: 'Failed to save profile picture.' });
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');

    if (isResetting) return;
    if (!currentPass || !newPass || !confirmPass) {
      setResetError('Please fill in all fields.');
      return;
    }
    // Current-password check now happens server-side inside
    // changeOwnPassword — it never trusts a plaintext profile.password
    // field from the client (that field isn't even returned by the
    // fully-public list anymore for accounts migrated to a bcrypt hash).
    if (newPass.length < 6) {
      setResetError('New password must be at least 6 characters.');
      return;
    }
    if (newPass !== confirmPass) {
      setResetError('New passwords do not match.');
      return;
    }

    const email = getSessionEmail();
    if (email && profile?.id) {
      setIsResetting(true);
      try {
        await changeOwnPassword(currentPass, newPass);
        refetchProfiles();
        setCurrentPass(''); setNewPass(''); setConfirmPass('');
        setIsResetOpen(false);
        showToast({ type: 'success', message: 'Password updated successfully!' });
      } catch (err) {
        console.error(`[${logTag}] Password update error:`, err);
        setResetError(errMsg(err, 'Failed to update password. Please try again.'));
      } finally {
        setIsResetting(false);
      }
    }
  };

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 text-sm font-semibold">
        Loading profile…
      </div>
    );
  }

  const joined = formatDateNY(profile.joinedDate);

  const infoRows = [
    { icon: Mail,      label: 'Email Address',       value: profile.email },
    { icon: Briefcase, label: 'Designation / Title', value: profile.jobTitle || defaultJobTitle },
    { icon: User,      label: 'Gender / Pronouns',   value: profile.gender ? (profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1)) : defaultGender },
    { icon: Calendar,  label: 'Joined Date',         value: joined },
    { icon: ShieldCheck, label: 'Security Role',      value: securityRoleLabel },
  ];

  return (
    // Wider than the old max-w-2xl — the sections below now lay out as 2
    // columns on desktop web (lg+ breakpoint). Native app builds run on
    // phone-sized viewports and never hit that breakpoint, so they stay
    // single-column exactly like before.
    <div className="space-y-6 md:space-y-8 max-w-5xl font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        {headerAction}
      </div>

      {/* Avatar + Name card */}
      <Card className="p-0 overflow-hidden border border-slate-200">
        <div className="h-20 md:h-24 bg-orange-600" />
        <div className="px-4 md:px-6 pb-5 md:pb-6">
          <div className="-mt-10 mb-4 flex items-end justify-between">
            <div className="relative group">
              {profile.profilePicture ? (
                <img
                  src={profile.profilePicture}
                  alt="Profile"
                  className="h-16 w-16 md:h-20 md:w-20 rounded-full bg-white border-4 border-white shadow-md object-cover"
                />
              ) : (
                <div className="h-16 w-16 md:h-20 md:w-20 rounded-full bg-white border-4 border-white shadow-md flex items-center justify-center text-xl md:text-2xl font-bold text-orange-600 bg-orange-50">
                  {profile.fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Change profile picture"
                className="absolute bottom-0 right-0 h-5 w-5 md:h-7 md:w-7 rounded-full bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center shadow-md border-2 border-white transition-colors transition-transform active:scale-90"
              >
                <Camera className="h-2.5 w-2.5 md:h-3.5 md:w-3.5" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoInputChange} className="hidden" />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsResetOpen(true)}
              className="!py-2 md:!py-1.5 border border-slate-200 active:scale-97 transition-transform min-h-[44px] md:min-h-0"
            >
              <KeyRound className="h-3.5 w-3.5" /> Reset Password
            </Button>
          </div>

          <h2 className="text-lg md:text-xl font-bold text-slate-900">{profile.fullName}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-bold text-orange-700 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full capitalize">
              {profile.jobTitle || securityRoleLabel}
            </span>
          </div>
        </div>
      </Card>

      {/* 2 columns on desktop web (lg+); single column below that,
          including native app builds (phone-sized viewports never reach
          lg). items-start so the shorter column doesn't stretch. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-start">
        {/* Info grid */}
        <Card className="border border-slate-200 p-0 overflow-hidden">
          <div className="px-4 md:px-6 pt-4 md:pt-5 pb-2 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm">Account Details</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {infoRows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3.5 md:py-4">
                <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-4 w-4 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                  <p className="text-xs md:text-sm font-semibold text-slate-900 mt-0.5 truncate">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6 md:space-y-8">
          {/* Security Section */}
          <Card className="border border-slate-200 p-0 overflow-hidden">
            <div className="px-4 md:px-6 pt-4 md:pt-5 pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Security</h3>
            </div>
            <div className="px-4 md:px-6 py-4 md:py-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <KeyRound className="h-4 w-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-xs md:text-sm font-semibold text-slate-900">Password</p>
                  <p className="text-xs text-slate-500 mt-0.5">Change your account password at any time.</p>
                </div>
              </div>
              <Button
                variant="primary"
                onClick={() => setIsResetOpen(true)}
                className="flex-shrink-0 !py-2.5 md:!py-2 shadow-sm active:scale-97 transition-transform min-h-[44px] md:min-h-0"
              >
                Change Password
              </Button>
            </div>
          </Card>

          {/* Push Notification Preferences */}
          {profile?.email && <NotificationPreferencesCard email={profile.email} />}
          <AppearanceCard />
          <AppVersionCard />
        </div>
      </div>

      {/* Password Reset Modal */}
      <Modal isOpen={isResetOpen} onClose={() => { setIsResetOpen(false); setResetError(''); }} title="Change Password">
        <form onSubmit={handleResetSubmit} className="space-y-4">
          {resetError && (
            <div className="p-3 text-xs bg-rose-50 text-rose-600 border border-rose-100 rounded-lg font-semibold flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" />{resetError}
            </div>
          )}
          <FormField label="Current Password" size="md">
            <PasswordInput
              value={currentPass}
              onChange={setCurrentPass}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 md:py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900"
              placeholder="Enter current password"
            />
          </FormField>
          <FormField label="New Password" size="md">
            <PasswordInput
              value={newPass}
              onChange={setNewPass}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 md:py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900"
              placeholder="Enter new password"
            />
          </FormField>
          <FormField label="Confirm New Password" size="md">
            <PasswordInput
              value={confirmPass}
              onChange={setConfirmPass}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 md:py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900"
              placeholder="Confirm new password"
            />
          </FormField>

          <button
            type="submit"
            disabled={isResetting}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 md:py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform mt-4 min-h-[44px] md:min-h-0 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isResetting ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </Modal>

      <AvatarCropperModal file={pendingPhotoFile} onClose={() => setPendingPhotoFile(null)} onSave={handlePhotoSave} />
    </div>
  );
}
