'use client';

import { StaffProfileView } from '@/components/ui/StaffProfileView';
import { AdminProfileEditor } from '@/components/ui/AdminProfileEditor';

export default function AdminProfilePage() {
  return (
    <StaffProfileView
      logTag="Admin Profile"
      title="Admin Profile"
      subtitle="Manage your system credentials and preferences."
      defaultJobTitle="System Administrator"
      defaultGender="Male"
      securityRoleLabel="System Administrator"
      headerAction={<AdminProfileEditor />}
    />
  );
}
