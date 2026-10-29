import React from 'react';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { ClipboardTextIcon as ClipboardList, PlusCircleIcon as PlusCircle, VideoCameraIcon as Video } from '@/components/ui/icons';

// The title of the HR and Admin dashboards with the three things they do most from here: schedule a Google Meet, post an
// announcement, assign a task. `extra` adds a page-specific button in front (Admin's "View All Tasks").
export function StaffDashboardHeader({ title, subtitle, extra, onMeet, onAnnounce, onTask }: { title: string; subtitle: string; extra?: React.ReactNode; onMeet: () => void; onAnnounce: () => void; onTask: () => void }) {
  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      action={
        <div className="flex flex-wrap gap-2">
          {extra}
          <Button variant="success" onClick={onMeet}><Video className="h-4 w-4" aria-hidden="true" /> Schedule Google Meet</Button>
          <Button variant="outline" onClick={onAnnounce}><PlusCircle className="h-4 w-4" aria-hidden="true" /> Post Announcement</Button>
          <Button variant="primary" onClick={onTask}><ClipboardList className="h-4 w-4" aria-hidden="true" /> Assign Task</Button>
        </div>
      }
    />
  );
}
