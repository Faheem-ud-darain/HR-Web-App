'use client';

import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import React from 'react';
import { Card } from '@/components/ui/Card';
import { TableScroll, Table, THead, Th, TBody, Tr, Td } from '@/components/ui/Table';
import { TableSkeletonRows, ListSkeleton } from '@/components/ui/Skeleton';
import { displayName, Profile, TrackingSettings, TrackerHeartbeat, TimesheetEntry } from '@/lib/hrData';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { GearIcon as Settings, ImageIcon as ImageIcon, CursorClickIcon as MousePointerClick, WifiSlashIcon as WifiOff, ShieldWarningIcon as ShieldAlert } from '@/components/ui/icons';
import { EmptyState } from '@/components/ui/EmptyState';
import { TrackerStatusBadge } from './TrackerBadges';

interface TrackerEmployeeListProps {
  canManage: boolean;
  profilesLoading: boolean;
  filteredEmployees: Profile[];
  settingsFor: (email: string) => TrackingSettings;
  heartbeatFor: (email: string) => TrackerHeartbeat | null;
  role: "admin" | "hr" | "team_lead";
  handleToggle: (email: string, enabled: boolean) => Promise<void>;
  handleIntervalChange: (email: string, minutes: number) => Promise<void>;
  handleExcludeToggle: (email: string, excludeFromAutoDelete: boolean) => Promise<void>;
  handleOpenSetup: (emp: Profile) => Promise<void>;
  handleOpenViewer: (emp: Profile) => Promise<void>;
  handleOpenMouseView: (emp: Profile) => Promise<void>;
  openShiftFor: (email: string) => TimesheetEntry | null;
  setForceEndShiftEmp: React.Dispatch<React.SetStateAction<Profile | null>>;
  setForceDisconnectEmp: React.Dispatch<React.SetStateAction<Profile | null>>;
}

export function TrackerEmployeeList({ canManage, profilesLoading, filteredEmployees, settingsFor, heartbeatFor, role, handleToggle, handleIntervalChange, handleExcludeToggle, handleOpenSetup, handleOpenViewer, handleOpenMouseView, openShiftFor, setForceEndShiftEmp, setForceDisconnectEmp }: TrackerEmployeeListProps) {
  return (
    <Card className="overflow-hidden p-0 border border-slate-200">
            <TableScroll hideOnMobile>
              <Table minWidth={1000}>
                <THead>
                  <tr>
                    <Th>Employee</Th>
                    <Th>Region</Th>
                    <Th align="center">Device</Th>
                    <Th align="center">Tracking</Th>
                    {canManage && <Th align="center">Interval (min)</Th>}
                    {canManage && <Th align="center">Exclude from Auto-Delete</Th>}
                    <Th align="center">Actions</Th>
                  </tr>
                </THead>
                <TBody>
    {profilesLoading ? (
      <TableSkeletonRows rows={6} cols={canManage ? 7 : 5} />
    ) : (
    <>
                  {filteredEmployees.map(emp => {
                    const settings = settingsFor(emp.email);
                    const hb = heartbeatFor(emp.email);
                    return (
                      <Tr key={emp.id}>
                        <Td>
                          <div className="font-semibold text-slate-900">{displayName(emp, role)}</div>
                          <div className="text-xs text-slate-400">{emp.email}</div>
                        </Td>
                        <Td className="text-slate-600 font-semibold">{emp.region || 'Pakistan'}</Td>
                        <Td align="center">
                          <TrackerStatusBadge hb={hb} settings={settings} openShift={openShiftFor(emp.email)} align="center" />
                        </Td>
                        <Td align="center">
                          {canManage ? (
                            <>
                              <Switch checked={settings.enabled} onChange={on => handleToggle(emp.email, on)} label={`Tracking for ${displayName(emp, role)}`} />
                              <div className="mt-1">
                                <Badge variant={settings.enabled ? 'success' : 'default'}>{settings.enabled ? 'Active' : 'Off'}</Badge>
                              </div>
                            </>
                          ) : (
                            <Badge variant={settings.enabled ? 'success' : 'default'}>{settings.enabled ? 'Active' : 'Off'}</Badge>
                          )}
                        </Td>
                        {canManage && (
                          <Td align="center">
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              max="60"
                              value={settings.intervalMinutes}
                              onChange={(e) => handleIntervalChange(emp.email, Number(e.target.value))}
                              onBlur={(e) => { if (Number(e.target.value) < 1) handleIntervalChange(emp.email, 1); }}
                              fieldSize="md" className="w-20 text-center"
                              title="Minimum 1 minute"
                            />
                          </Td>
                        )}
                        {canManage && (
                          <Td align="center">
                            <Checkbox checked={settings.excludeFromAutoDelete} onChange={checked => handleExcludeToggle(emp.email, checked)} className="min-h-0 justify-center"><span className="sr-only">Exclude from auto-delete</span></Checkbox>
                          </Td>
                        )}
                        <Td align="center">
                          {/* flex-wrap + whitespace-nowrap/shrink-0 on every
                              button — fixed 2026-08-21. Without these, a row
                              with 5 buttons (Setup Agent/Screenshots/Mouse
                              Activity/Force End Shift/Force Disconnect, shown
                              only when that employee has an open shift) had its
                              buttons squeezed narrower than their text by the
                              flex container, wrapping each label onto two
                              lines and making that row visibly taller/
                              misaligned next to every 4-button row beside it.
                              Now a row that doesn't fit on one line wraps whole
                              buttons onto a second line instead of shrinking
                              and wrapping text inside them, so every button
                              stays a consistent single-line pill regardless of
                              how many are present in that row. */}
                          <div className="flex flex-wrap sm:flex-row justify-center gap-2">
                            {canManage && (
                            <Button variant="softOrange" size="xs" className="shrink-0 whitespace-nowrap gap-1.5" onClick={() => handleOpenSetup(emp)}><Settings className="h-3.5 w-3.5" /> Setup Agent</Button>
                            )}
                            {canManage && (
                            <Button variant="secondary" size="xs" className="shrink-0 whitespace-nowrap gap-1.5" onClick={() => handleOpenViewer(emp)}><ImageIcon className="h-3.5 w-3.5" /> Screenshots</Button>
                            )}
                            <Button variant="secondary" size="xs" className="shrink-0 whitespace-nowrap gap-1.5" onClick={() => handleOpenMouseView(emp)}><MousePointerClick className="h-3.5 w-3.5" /> Mouse Activity</Button>
                            {canManage && openShiftFor(emp.email) && (
                              <Button variant="softRose" size="xs" className="shrink-0 whitespace-nowrap gap-1.5" onClick={() => setForceEndShiftEmp(emp)} title="End their current shift now — they'll need to Start Shift again, going through the tracker connection check"><WifiOff className="h-3.5 w-3.5" /> Force End Shift</Button>
                            )}
                            {canManage && (
                              <Button variant="softOrange" size="xs" className="shrink-0 whitespace-nowrap gap-1.5" onClick={() => setForceDisconnectEmp(emp)} title="Invalidate their current setup code — their tracker will be forced to show 'Reconnect Required' and Start Shift will be blocked until they paste in the new code"><ShieldAlert className="h-3.5 w-3.5" /> Force Disconnect</Button>
                            )}
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                  {filteredEmployees.length === 0 && (
                    <Tr>
                      <EmptyState as="td" colSpan={canManage ? 7 : 5} py={12}>
                        {canManage ? 'No employees found.' : 'No teammates found on your team(s) yet.'}
                      </EmptyState>
                    </Tr>
                  )}
                </>
    )}
    </TBody>
              </Table>
            </TableScroll>
            
            {/* Mobile card stack */}
            <div className="md:hidden space-y-3 p-4">
              {filteredEmployees.map(emp => {
                const settings = settingsFor(emp.email);
                const hb = heartbeatFor(emp.email);
                return (
                  <div key={emp.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{displayName(emp, role)}</p>
                        <p className="text-caption text-slate-500">{emp.email}</p>
                      </div>
                      <TrackerStatusBadge hb={hb} settings={settings} openShift={openShiftFor(emp.email)} align="end" />
                    </div>
                    <div className="grid grid-cols-2 gap-y-3 gap-x-2 mt-2">
                      <div>
                        <p className="text-caption text-slate-400 font-semibold uppercase">Region</p>
                        <p className="text-xs font-semibold text-slate-700">{emp.region || 'Pakistan'}</p>
                      </div>
                      <div>
                        <p className="text-caption text-slate-400 font-semibold uppercase">Tracking</p>
                        {canManage ? (
                          <div className="flex items-center gap-2 mt-0.5">
                            <Switch size="sm" checked={settings.enabled} onChange={on => handleToggle(emp.email, on)} label={`Tracking for ${displayName(emp, role)}`} />
                            <Badge variant={settings.enabled ? 'success' : 'default'} className="text-caption px-1.5 py-0">
                              {settings.enabled ? 'Active' : 'Off'}
                            </Badge>
                          </div>
                        ) : (
                          <Badge variant={settings.enabled ? 'success' : 'default'} className="text-caption px-1.5 py-0 mt-0.5">
                            {settings.enabled ? 'Active' : 'Off'}
                          </Badge>
                        )}
                      </div>
                      {canManage && (
                        <div>
                          <p className="text-caption text-slate-400 font-semibold uppercase mb-1">Interval (min)</p>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            max="60"
                            value={settings.intervalMinutes}
                            onChange={(e) => handleIntervalChange(emp.email, Number(e.target.value))}
                            onBlur={(e) => { if (Number(e.target.value) < 1) handleIntervalChange(emp.email, 1); }}
                            fieldSize="md"
                          />
                        </div>
                      )}
                      {canManage && (
                        <div>
                          <p className="text-caption text-slate-400 font-semibold uppercase mb-1">Exclude Auto-Delete</p>
                          <Checkbox checked={settings.excludeFromAutoDelete} onChange={checked => handleExcludeToggle(emp.email, checked)} className="min-h-0 mt-1.5">{settings.excludeFromAutoDelete ? 'Yes' : 'No'}</Checkbox>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-2 pt-2 border-t border-slate-100">
                      {canManage && (
                      <Button variant="secondary" size="sm" className="w-full" onClick={() => handleOpenViewer(emp)}><ImageIcon className="h-3.5 w-3.5" /> View Screenshots</Button>
                      )}
                      <div className="flex gap-2">
                        {canManage && (
                          <Button variant="softOrange" size="sm" className="flex-1" onClick={() => handleOpenSetup(emp)}><Settings className="h-3.5 w-3.5" /> Setup Agent</Button>
                        )}
                        <Button variant="secondary" size="sm" className="flex-1" onClick={() => handleOpenMouseView(emp)}><MousePointerClick className="h-3.5 w-3.5" /> Mouse Activity</Button>
                      </div>
                      {canManage && openShiftFor(emp.email) && (
                        <Button variant="softRose" size="sm" className="w-full" onClick={() => setForceEndShiftEmp(emp)}><WifiOff className="h-3.5 w-3.5" /> Force End Shift</Button>
                      )}
                      {canManage && (
                        <Button variant="softOrange" size="sm" className="w-full" onClick={() => setForceDisconnectEmp(emp)}><ShieldAlert className="h-3.5 w-3.5" /> Force Disconnect</Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {profilesLoading && <ListSkeleton rows={3} />}
              {!profilesLoading && filteredEmployees.length === 0 && (
                <EmptyState py={8} size="sm">No employees found.</EmptyState>
              )}
            </div>
          </Card>
  );
}
