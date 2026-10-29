'use client';

import React from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { FilePickButton } from '@/components/ui/UploadSlot';
import { AvatarCropperModal } from '@/components/ui/lazy';
import type { Profile } from '@/lib/hrData';
import type { useProfilePhoto } from '@/components/ui/profile/useProfilePhoto';

// The top of a profile page: the brand banner, the photo with a "Change photo" button (pick, crop, save), the name,
// the email and the role badges. Shared by the employee page and the HR/Admin page.
export function ProfileHero({ profile, photo, badges }: { profile: Pick<Profile, 'fullName' | 'email' | 'profilePicture'>; photo: ReturnType<typeof useProfilePhoto>; badges?: React.ReactNode }) {
  return (
    <Card className="p-0 overflow-hidden border border-slate-200">
      <div className="h-20 md:h-28 bg-gradient-to-r from-orange-600 to-orange-500" />
      <div className="px-4 md:px-6 pb-5 md:pb-6">
        <div className="-mt-11 md:-mt-12 flex items-end justify-between gap-3">
          <div className="rounded-full bg-white ring-4 ring-white shadow-md"><Avatar src={profile.profilePicture} name={profile.fullName} size={88} /></div>
          <FilePickButton variant="secondary" accept="image/*" onPick={photo.pick}>Change photo</FilePickButton>
        </div>
        <h2 className="mt-3 text-xl font-bold text-slate-900">{profile.fullName}</h2>
        <p className="text-xs md:text-sm text-slate-500 break-all">{profile.email}</p>
        {badges && <div className="flex flex-wrap items-center gap-2 mt-2.5">{badges}</div>}
      </div>
      <AvatarCropperModal file={photo.pendingFile} onClose={photo.clearPending} onSave={photo.handleSave} />
    </Card>
  );
}
