'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { hrActions, Profile, useProfiles, useProfileDocuments, useTeams, displayName, approveOnboardingServer, rejectOnboardingServer, addEmployeeServer } from '@/lib/hrData';
import { getSessionEmail } from '@/lib/session';
import { UserPlus, CheckCircle2, AlertCircle, FileText, ShieldCheck, XCircle, ClipboardCheck, Eye, Download } from 'lucide-react';
import { DocumentPreviewModal } from '@/components/ui/lazy';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableScroll, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { TableSkeletonRows, ListSkeleton } from '@/components/ui/Skeleton';

export default function HROnboardingPage() {
  const { data: employees = [], isLoading: profilesLoading, refetch: refetchProfiles } = useProfiles();
  const { data: teamsData = [], refetch: refetchTeams } = useTeams();
  const teams = teamsData.map(t => t.name);
  const [isOnboardOpen, setIsOnboardOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'rejected' | 'approved'>('all');

  const pendingApprovals = employees.filter(e => e.onboardingCompleted && e.approvalStatus === 'pending');
  const rejectedEmployees = employees.filter(e => e.approvalStatus === 'rejected');
  const approvedEmployees = employees.filter(e => e.approvalStatus === 'approved' || (!e.approvalStatus && e.onboardingCompleted));

  const filteredEmployees = employees.filter(e => {
    if (activeTab === 'pending') return e.onboardingCompleted && e.approvalStatus === 'pending';
    if (activeTab === 'rejected') return e.approvalStatus === 'rejected';
    if (activeTab === 'approved') return e.approvalStatus === 'approved' || (!e.approvalStatus && e.onboardingCompleted);
    return true;
  });

  const [reviewingEmp, setReviewingEmp] = useState<Profile | null>(null);
  // Their CV/passport/identity scans are fetched on demand, only while
  // their review modal is open — not part of the eager employees list.
  const { data: reviewingEmpDocs } = useProfileDocuments(reviewingEmp?.id);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [isReviewSubmitting, setIsReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string } | null>(null);

  const handleApprove = async (emp: Profile) => {
    setIsReviewSubmitting(true);
    setReviewError('');
    try {
      const reviewer = getSessionEmail() || '';
      await approveOnboardingServer(emp, reviewer);
      await refetchProfiles();
      setReviewingEmp(null);
    } catch (err) {
      console.error('Approve onboarding failed:', err);
      setReviewError('Could not approve this employee. Please try again.');
    } finally {
      setIsReviewSubmitting(false);
    }
  };

  const handleReject = async (emp: Profile) => {
    if (!rejectReason.trim()) {
      setReviewError('Please leave a short reason so the employee knows what to fix.');
      return;
    }
    setIsReviewSubmitting(true);
    setReviewError('');
    try {
      const reviewer = getSessionEmail() || '';
      await rejectOnboardingServer(emp, reviewer, rejectReason.trim());
      await refetchProfiles();
      setReviewingEmp(null);
      setShowRejectForm(false);
      setRejectReason('');
    } catch (err) {
      console.error('Reject onboarding failed:', err);
      setReviewError('Could not reject this employee. Please try again.');
    } finally {
      setIsReviewSubmitting(false);
    }
  };

  // Form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('employee');
  const [salary, setSalary] = useState('');
  const [team, setTeam] = useState('Engineering');
  const [tempPassword, setTempPassword] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [region, setRegion] = useState<'USA' | 'Pakistan'>('Pakistan');
  const today = new Date().toISOString().split('T')[0];
  const [joinedDate, setJoinedDate] = useState(today);
  const [accountCreationDate, setAccountCreationDate] = useState(today);
  const [onboardError, setOnboardError] = useState('');
  const [onboardSuccess, setOnboardSuccess] = useState('');
  const [isOnboarding, setIsOnboarding] = useState(false);

  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardError('');
    setOnboardSuccess('');

    if (isOnboarding) return;
    if (!fullName || !email || !salary || !jobTitle) {
      setOnboardError('Please fill in all required fields.');
      return;
    }

    if (isNaN(Number(salary)) || Number(salary) <= 0) {
      setOnboardError('Please enter a valid base salary.');
      return;
    }

    setIsOnboarding(true);
    try {
      const typedPassword = tempPassword.trim();
      const result = await addEmployeeServer({
        fullName,
        email,
        role: role as 'employee' | 'hr' | 'admin' | 'team_lead',
        joinedDate,
        accountCreationDate,
        baseSalary: Number(salary),
        teams: [team],
        password: typedPassword || undefined,
        jobTitle,
        gender,
        region,
      });

      // Mirror membership onto the authoritative hr_teams.members list.
      const targetTeam = teamsData.find(t => t.name === team);
      if (targetTeam && !targetTeam.members.includes(email)) {
        await hrActions.updateTeamMembers(targetTeam.id, [...targetTeam.members, email]);
        refetchTeams();
      }

      await hrActions.addNotification('all', 'hr', `New employee ${fullName} onboarded onto team ${team}.`);
      await hrActions.addNotification('all', 'admin', `New employee ${fullName} onboarded onto team ${team}.`);
      refetchProfiles();

      // When the admin left the temp password field blank, the server
      // generated a random one (plan 013 step 1 — no shared literal like
      // 'employee123' anymore) and returned it here. That's the only place
      // it's ever visible in plaintext, so surface it and don't auto-close
      // the modal — give the admin a moment to actually copy it down
      // before it's gone. If the admin typed their own, they already know
      // it, so the modal can close as before.
      if (!typedPassword && result?.tempPassword) {
        setOnboardSuccess(`Employee successfully registered! Temporary password: ${result.tempPassword} — share this with them; it won't be shown again.`);
        setFullName('');
        setEmail('');
        setSalary('');
        setTeam('Engineering');
        setTempPassword('');
        setJobTitle('');
        setGender('male');
        setRegion('Pakistan');
        return;
      }

      setOnboardSuccess('Employee successfully registered!');

      setTimeout(() => {
        setIsOnboardOpen(false);
        setFullName('');
        setEmail('');
        setSalary('');
        setTeam('Engineering');
        setTempPassword('');
        setJobTitle('');
        setGender('male');
        setRegion('Pakistan');
        setJoinedDate(today);
        setAccountCreationDate(today);
        setOnboardSuccess('');
      }, 1500);
    } catch (err) {
      console.error('Onboard employee failed:', err);
      setOnboardError('Could not register that employee. Please try again.');
    } finally {
      setIsOnboarding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Onboarding Pipelines</h1>
          <p className="text-slate-500">Track registration completeness and review document submissions.</p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={() => setIsOnboardOpen(true)}
        >
          <UserPlus className="h-4 w-4" /> Onboard Employee
        </Button>
      </div>

      {/* Status Filter Tabs */}
      <Tabs
        variant="chips"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: 'all', label: 'All', count: employees.length },
          { value: 'pending', label: 'Pending Approval', count: pendingApprovals.length, tone: 'warning' },
          { value: 'rejected', label: 'Rejected', count: rejectedEmployees.length, tone: 'danger' },
          { value: 'approved', label: 'Approved / Active', count: approvedEmployees.length, tone: 'success' },
        ]}
      />

      {/* Pending Onboarding Approvals Banner */}
      {pendingApprovals.length > 0 && activeTab === 'all' && (
        <Card className="border border-amber-200 bg-amber-50/40 overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-200/70 flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-amber-600" />
            <h2 className="font-bold text-slate-900 text-sm">Pending Document Approvals ({pendingApprovals.length})</h2>
          </div>
          <div className="divide-y divide-amber-200/60">
            {pendingApprovals.map(emp => (
              <div key={emp.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">{displayName(emp, 'hr')}</p>
                  <p className="text-xs text-slate-500 font-medium">{emp.email} · {emp.jobTitle || 'Staff'}</p>
                </div>
                <button
                  onClick={() => { setReviewingEmp(emp); setShowRejectForm(false); setRejectReason(''); setReviewError(''); }}
                  className="bg-white border border-amber-300 hover:bg-amber-100 text-amber-800 font-bold px-3.5 py-2 rounded-lg text-xs active:scale-97 transition-colors transition-transform self-start sm:self-auto"
                >
                  Review Documents
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

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
{profilesLoading ? (
  <TableSkeletonRows rows={6} cols={6} />
) : (
<>
              {filteredEmployees.map((emp) => {
                const statusLabel = emp.approvalStatus === 'pending'
                  ? 'Pending Approval'
                  : emp.approvalStatus === 'rejected'
                  ? 'Rejected'
                  : emp.approvalStatus === 'approved' || emp.onboardingCompleted
                  ? 'Approved'
                  : 'Invite Sent';

                const badgeVariant = emp.approvalStatus === 'pending'
                  ? 'warning'
                  : emp.approvalStatus === 'rejected'
                  ? 'danger'
                  : emp.approvalStatus === 'approved' || emp.onboardingCompleted
                  ? 'success'
                  : 'warning';

                return (
                  <Tr key={emp.id}>
                    <Td className="font-semibold text-slate-900">{displayName(emp, 'hr')}</Td>
                    <Td>{emp.email}</Td>
                    <Td className="capitalize font-medium text-slate-800">
                      {emp.jobTitle || 'Employee'} <span className="text-[10px] text-slate-400 font-bold uppercase">({emp.role})</span>
                    </Td>
                    <Td align="center" className="capitalize font-semibold text-slate-500">{emp.gender || 'male'}</Td>
                    <Td>
                      <Badge variant={badgeVariant}>
                        {statusLabel}
                      </Badge>
                    </Td>
                    <Td align="center">
                      {(emp.approvalStatus === 'pending' || emp.approvalStatus === 'rejected' || emp.onboardingCompleted) && (
                        <button
                          onClick={() => { setReviewingEmp(emp); setShowRejectForm(false); setRejectReason(emp.approvalRejectionReason || ''); setReviewError(''); }}
                          className="text-xs font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Review Docs
                        </button>
                      )}
                    </Td>
                  </Tr>
                );
              })}
              {filteredEmployees.length === 0 && (
                <Tr>
                  <EmptyState as="td" colSpan={6} py={8} size="sm">
                    No employees found for this tab.
                  </EmptyState>
                </Tr>
              )}
            </>
)}
</TBody>
          </Table>
        </TableScroll>
        
        <div className="md:hidden space-y-3 p-4">
          {filteredEmployees.map((emp) => {
            const statusLabel = emp.approvalStatus === 'pending'
              ? 'Pending Approval'
              : emp.approvalStatus === 'rejected'
              ? 'Rejected'
              : emp.approvalStatus === 'approved' || emp.onboardingCompleted
              ? 'Approved'
              : 'Invite Sent';

            const badgeVariant = emp.approvalStatus === 'pending'
              ? 'warning'
              : emp.approvalStatus === 'rejected'
              ? 'danger'
              : emp.approvalStatus === 'approved' || emp.onboardingCompleted
              ? 'success'
              : 'warning';

            return (
              <div key={emp.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-900 truncate pr-2">{displayName(emp, 'hr')}</p>
                  <Badge variant={badgeVariant} className="shrink-0">
                    {statusLabel}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Email</p>
                    <p className="text-xs font-semibold text-slate-700">{emp.email}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Job Title (Role)</p>
                    <p className="text-xs font-medium text-slate-800 capitalize">
                      {emp.jobTitle || 'Employee'} <span className="text-[10px] text-slate-400 font-bold uppercase">({emp.role})</span>
                    </p>
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
                {(emp.approvalStatus === 'pending' || emp.approvalStatus === 'rejected' || emp.onboardingCompleted) && (
                  <button
                    onClick={() => { setReviewingEmp(emp); setShowRejectForm(false); setRejectReason(emp.approvalRejectionReason || ''); setReviewError(''); }}
                    className="w-full text-xs font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 py-2 rounded-lg transition-colors text-center"
                  >
                    Review Docs
                  </button>
                )}
              </div>
            );
          })}
          {profilesLoading && <ListSkeleton rows={3} />}
          {!profilesLoading && filteredEmployees.length === 0 && (
            <EmptyState py={8} size="sm">
              No employees found for this tab.
            </EmptyState>
          )}
        </div>
      </Card>

      {/* Onboard Employee Modal */}
      <Modal isOpen={isOnboardOpen} onClose={() => setIsOnboardOpen(false)} title="Onboard New Employee" className="md:max-w-2xl">
        <form onSubmit={handleOnboardSubmit} className="space-y-4 pt-1">
          {onboardError && (
            <div className="p-3.5 text-xs bg-rose-50 text-rose-700 border border-rose-100 rounded-xl font-semibold flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-600 shrink-0" />
              {onboardError}
            </div>
          )}
          {onboardSuccess && (
            <div className="p-3.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl font-semibold flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
              {onboardSuccess}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Full Name *">
              <Input 
                type="text" 
                required 
                value={fullName} 
                onChange={e => setFullName(e.target.value)} 
                fieldSize="soft"
                placeholder="e.g. John Doe" 
              />
            </FormField>
            <FormField label="Job Title / Designation *">
              <Input 
                type="text" 
                required 
                value={jobTitle} 
                onChange={e => setJobTitle(e.target.value)} 
                fieldSize="soft"
                placeholder="e.g. QA Specialist" 
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Email Address *">
              <Input 
                type="email" 
                required 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                fieldSize="soft"
                placeholder="e.g. john@company.com" 
              />
            </FormField>
            <FormField label="Gender">
              <Select 
                value={gender} 
                onChange={e => setGender(e.target.value as 'male' | 'female')} 
                fieldSize="soft" className="cursor-pointer appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.875rem center',
                  backgroundSize: '1rem'
                }}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Role Type">
              <Select 
                value={role} 
                onChange={e => setRole(e.target.value)} 
                fieldSize="soft" className="cursor-pointer appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.875rem center',
                  backgroundSize: '1rem'
                }}
              >
                <option value="employee">Employee</option>
                <option value="hr">HR</option>
              </Select>
            </FormField>
            <FormField label="Region / Base Location Mode">
              <Select 
                value={region} 
                onChange={e => setRegion(e.target.value as 'USA' | 'Pakistan')} 
                fieldSize="soft" className="cursor-pointer appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.875rem center',
                  backgroundSize: '1rem'
                }}
              >
                <option value="Pakistan">Pakistan (Remote Employee)</option>
                <option value="USA">USA Employee (Warehouse Geofencing)</option>
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label={<>Base Salary ({region === 'USA' ? 'USD $' : 'PKR'}) *</>}>
              <Input 
                type="text" 
                required 
                value={salary} 
                onChange={e => setSalary(e.target.value)} 
                fieldSize="soft"
                placeholder={region === 'USA' ? 'e.g. 5000' : 'e.g. 50000'} 
              />
            </FormField>
            <FormField label="Assign Team">
              <Select 
                value={team} 
                onChange={e => setTeam(e.target.value)} 
                fieldSize="soft" className="cursor-pointer appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.875rem center',
                  backgroundSize: '1rem'
                }}
              >
                {teams.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Joining Date *">
              <Input
                type="date"
                required
                value={joinedDate}
                onChange={e => setJoinedDate(e.target.value)}
                fieldSize="soft" className="cursor-pointer"
              />
            </FormField>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider" title="PTO accrual is calculated from this date, not the joining date">
                Account Creation Date *
              </label>
              <Input
                type="date"
                required
                value={accountCreationDate}
                onChange={e => setAccountCreationDate(e.target.value)}
                fieldSize="soft" className="cursor-pointer"
              />
              <p className="text-[9px] text-slate-400 font-semibold">PTO accrual is calculated from this date.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-col sm:flex-row">
            <FormField label="Temporary Password">
              <Input 
                type="text" 
                value={tempPassword} 
                onChange={e => setTempPassword(e.target.value)} 
                fieldSize="soft"
                placeholder="e.g. welcome123" 
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setIsOnboardOpen(false)}
              disabled={isOnboarding}
            >
              Cancel
            </Button>
            <button
              type="submit"
              disabled={isOnboarding}
              className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 rounded-xl text-xs active:scale-97 transition-colors transition-transform shadow-md shadow-orange-600/10 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isOnboarding ? 'Registering…' : 'Register & Invite'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Review Documents Modal */}
      {reviewingEmp && (
        <Modal isOpen onClose={() => { setReviewingEmp(null); setShowRejectForm(false); }} title="Review Onboarding Documents" className="md:max-w-2xl">
          <div className="space-y-5 pt-1">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">{displayName(reviewingEmp, 'hr')}</p>
                <p className="text-xs text-slate-500 font-semibold">{reviewingEmp.email} · {reviewingEmp.jobTitle || 'Staff'} · {reviewingEmp.region || 'Pakistan'}</p>
              </div>
              <Badge variant="warning">Pending Approval</Badge>
            </div>

            {reviewError && (
              <div className="p-3 text-xs bg-rose-50 text-rose-700 border border-rose-100 rounded-lg font-semibold">{reviewError}</div>
            )}

            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Uploaded Documents</h4>

              {reviewingEmpDocs?.cvFileData && reviewingEmpDocs?.cvFileName && (
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-orange-600 shrink-0" />
                    <span className="truncate">{reviewingEmpDocs.cvFileName}</span>
                    <span className="text-[10px] text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded">CV</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewDoc({ url: reviewingEmpDocs.cvFileData!, name: reviewingEmpDocs.cvFileName! })}
                      className="text-xs font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2.5 py-1.5 rounded-md flex items-center gap-1 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" /> Preview
                    </button>
                    <a
                      href={reviewingEmpDocs.cvFileData}
                      download={reviewingEmpDocs.cvFileName}
                      className="text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-md flex items-center gap-1 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              )}

              {(reviewingEmpDocs?.identityDocs || []).map((doc, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-orange-600 shrink-0" />
                    <span className="truncate">{doc.name}</span>
                    <span className="text-[10px] text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded">Identity Doc</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewDoc({ url: doc.data, name: doc.name })}
                      className="text-xs font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2.5 py-1.5 rounded-md flex items-center gap-1 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" /> Preview
                    </button>
                    <a
                      href={doc.data}
                      download={doc.name}
                      className="text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-md flex items-center gap-1 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              ))}

              {reviewingEmpDocs?.passportFileData && reviewingEmpDocs?.passportFileName && (
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-orange-600 shrink-0" />
                    <span className="truncate">{reviewingEmpDocs.passportFileName}</span>
                    <span className="text-[10px] text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded">Passport</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewDoc({ url: reviewingEmpDocs.passportFileData!, name: reviewingEmpDocs.passportFileName! })}
                      className="text-xs font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2.5 py-1.5 rounded-md flex items-center gap-1 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" /> Preview
                    </button>
                    <a
                      href={reviewingEmpDocs.passportFileData}
                      download={reviewingEmpDocs.passportFileName}
                      className="text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-md flex items-center gap-1 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              )}

              {!reviewingEmpDocs?.cvFileData && (reviewingEmpDocs?.identityDocs || []).length === 0 && !reviewingEmpDocs?.passportFileData && (
                <p className="text-xs text-slate-400 italic font-semibold">No documents on file.</p>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Bank</p>
                  <p className="text-xs font-semibold text-slate-800">{reviewingEmp.bankName || '—'}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Account / IBAN</p>
                  <p className="text-xs font-semibold text-slate-800">{reviewingEmp.accountNumber || '—'} · {reviewingEmp.iban || '—'}</p>
                </div>
              </div>
            </div>

            {showRejectForm ? (
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Reason for rejection *</label>
                <Textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. CNIC back-side image is blurry, please re-upload."
                  fieldSize="sm"
                />
                <div className="flex gap-3">
                  <Button type="button" variant="outline" size="md" className="flex-1" onClick={() => setShowRejectForm(false)}>
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="md"
                    className="flex-1"
                    disabled={isReviewSubmitting}
                    onClick={() => handleReject(reviewingEmp)}
                  >
                    {isReviewSubmitting ? 'Submitting…' : 'Confirm Rejection'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowRejectForm(true)}
                  className="flex-1 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 font-bold py-2.5 rounded-xl text-xs active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1.5"
                >
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
                <button
                  type="button"
                  disabled={isReviewSubmitting}
                  onClick={() => handleApprove(reviewingEmp)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl text-xs active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> {isReviewSubmitting ? 'Approving…' : 'Approve & Unlock Dashboard'}
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Document In-App Preview Modal (PDF & Images) */}
      {previewDoc && (
        <DocumentPreviewModal
          url={previewDoc.url}
          name={previewDoc.name}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}
