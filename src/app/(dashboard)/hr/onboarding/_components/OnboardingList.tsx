'use client';

import React from 'react';
import { displayName, type Profile } from '@/lib/hrData';
import { canReviewDocuments, onboardingStatus } from '@/lib/core/onboarding';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListSkeleton, TableSkeletonRows } from '@/components/ui/Skeleton';
import { Table, TableScroll, TBody, Td, Th, THead, Tr } from '@/components/ui/Table';

// Everyone in the selected tab: a table on wide screens, cards on phones, each with a "Review Docs" button once there
// is something to review.
export function OnboardingList({ employees, loading, onReview }: { employees: Profile[]; loading: boolean; onReview: (emp: Profile) => void }) {
  return (
    <Card className="overflow-hidden border border-slate-200">
      <TableScroll hideOnMobile>
        <Table>
          <THead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Job Title (Role)</Th>
              <Th align="center">Gender</Th>
              <Th>Status</Th>
              <Th align="center">Actions</Th>
            </tr>
          </THead>
          <TBody>
            {loading ? (
              <TableSkeletonRows rows={6} cols={6} />
            ) : (
              <>
                {employees.map(emp => {
                  const status = onboardingStatus(emp);
                  return (
                    <Tr key={emp.id}>
                      <Td className="font-semibold text-slate-900">{displayName(emp, 'hr')}</Td>
                      <Td>{emp.email}</Td>
                      <Td className="capitalize font-medium text-slate-800">
                        {emp.jobTitle || 'Employee'} <span className="text-[10px] text-slate-400 font-bold uppercase">({emp.role})</span>
                      </Td>
                      <Td align="center" className="capitalize font-semibold text-slate-500">{emp.gender || 'male'}</Td>
                      <Td><Badge variant={status.variant}>{status.label}</Badge></Td>
                      <Td align="center">{canReviewDocuments(emp) && <Button variant="ghost" size="sm" className="!text-orange-600 !bg-orange-50 hover:!bg-orange-100" onClick={() => onReview(emp)}>Review Docs</Button>}</Td>
                    </Tr>
                  );
                })}
                {employees.length === 0 && <Tr><EmptyState as="td" colSpan={6} py={8} size="sm">No employees found for this tab.</EmptyState></Tr>}
              </>
            )}
          </TBody>
        </Table>
      </TableScroll>

      <div className="md:hidden space-y-3 p-4">
        {employees.map(emp => {
          const status = onboardingStatus(emp);
          return (
            <div key={emp.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900 truncate pr-2">{displayName(emp, 'hr')}</p>
                <Badge variant={status.variant} className="shrink-0">{status.label}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Email</p>
                  <p className="text-xs font-semibold text-slate-700">{emp.email}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Job Title (Role)</p>
                  <p className="text-xs font-medium text-slate-800 capitalize">{emp.jobTitle || 'Employee'} <span className="text-[10px] text-slate-400 font-bold uppercase">({emp.role})</span></p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Gender</p>
                  <p className="text-xs font-semibold text-slate-700 capitalize">{emp.gender || 'male'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Invited Date</p>
                  <p className="text-xs font-medium text-slate-600">{emp.joinedDate}</p>
                </div>
              </div>
              {canReviewDocuments(emp) && <Button variant="ghost" size="md" fullWidth className="!text-orange-600 !bg-orange-50 hover:!bg-orange-100" onClick={() => onReview(emp)}>Review Docs</Button>}
            </div>
          );
        })}
        {loading && <ListSkeleton rows={3} />}
        {!loading && employees.length === 0 && <EmptyState py={8} size="sm">No employees found for this tab.</EmptyState>}
      </div>
    </Card>
  );
}
