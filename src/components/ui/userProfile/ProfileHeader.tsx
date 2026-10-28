'use client';

import React, { useState } from 'react';
import { displayName, type Profile } from '@/lib/hrData';
import type { ViewerRole } from '@/lib/core/userProfile';
import { Avatar } from '../Avatar';
import { Badge } from '../Badge';
import { ImageLightbox } from '../ImageLightbox';

// The photo, name and title at the top of the card. HR and Admin can open the photo full size.
export function ProfileHeader({ profile, viewerRole }: { profile: Profile; viewerRole: ViewerRole }) {
  const [lightbox, setLightbox] = useState(false);
  const canZoom = (viewerRole === 'hr' || viewerRole === 'admin') && !!profile.profilePicture;
  return (
    <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
      <button type="button" onClick={() => canZoom && setLightbox(true)} title={canZoom ? 'View full size' : undefined} className={canZoom ? 'cursor-zoom-in' : 'cursor-default'}>
        <Avatar src={profile.profilePicture} name={displayName(profile, viewerRole)} size={48} />
      </button>
      <div>
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
          {displayName(profile, viewerRole)}
          {profile.offboarded && <Badge variant="danger">Offboarded</Badge>}
        </h3>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{profile.jobTitle || profile.role}</p>
      </div>
      <ImageLightbox src={lightbox ? profile.profilePicture ?? null : null} alt={`${profile.fullName}.jpg`} downloadName={`${profile.fullName}.jpg`} onClose={() => setLightbox(false)} />
    </div>
  );
}
