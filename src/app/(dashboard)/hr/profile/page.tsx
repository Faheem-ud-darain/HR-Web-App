'use client';

import { StaffProfileView } from '@/components/ui/StaffProfileView';

export default function HRProfilePage() {
  return (
    <StaffProfileView
      logTag="HR Profile"
      title="HR Profile"
      subtitle="Manage your HR credentials and account details."
      defaultJobTitle="HR Manager"
      defaultGender="Female"
      securityRoleLabel="HR Director"
    />
  );
}
