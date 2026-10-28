'use client';

import React, { useState } from 'react';
import { Edit, Loader2, MapPin, Trash } from 'lucide-react';
import { hrActions, useProfiles, useWarehouses, type Warehouse } from '@/lib/hrData';
import { Button } from '@/components/ui/Button';
import { SuccessNote } from '@/components/ui/SuccessNote';
import { useFlash } from '@/lib/useFlash';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

// Warehouse locations and their clock-in geofences: add, edit, delete. Used by the Admin Warehouses page and
// the HR Teams page (Warehouses tab), so both behave the same, including the coordinate checks.
interface WhForm { name: string; lat: string; lon: string; radius: string }
const EMPTY_FORM: WhForm = { name: '', lat: '', lon: '', radius: '500' };

// Without these range checks a mistyped latitude (e.g. 999) silently breaks geofencing for every employee
// assigned to that warehouse, with no error shown anywhere.
function validate({ name, lat, lon, radius }: WhForm): string | null {
  if (!name.trim()) return 'Enter a warehouse name.'; // `required` lets a name of only spaces through
  const [la, lo, r] = [Number(lat), Number(lon), Number(radius)];
  if (Number.isNaN(la) || la < -90 || la > 90) return 'Latitude must be a number between -90 and 90.';
  if (Number.isNaN(lo) || lo < -180 || lo > 180) return 'Longitude must be a number between -180 and 180.';
  if (Number.isNaN(r) || r <= 0) return 'Geofence radius must be a positive number of meters.';
  return null;
}

const toPayload = (f: WhForm) => ({ name: f.name.trim(), latitude: Number(f.lat), longitude: Number(f.lon), radius: Number(f.radius) });
const toForm = (w: Warehouse): WhForm => ({ name: w.name, lat: String(w.latitude), lon: String(w.longitude), radius: String(w.radius) });

function WarehouseFields({ value, onChange }: { value: WhForm; onChange: (next: WhForm) => void }) {
  const set = (key: keyof WhForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value });
  return (
    <>
      <FormField label="Warehouse Name *"><Input type="text" required value={value.name} onChange={set('name')} placeholder="e.g. Dallas Distribution Yard" /></FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Latitude *"><Input type="number" step="0.000001" required value={value.lat} onChange={set('lat')} placeholder="e.g. 32.7767" /></FormField>
        <FormField label="Longitude *"><Input type="number" step="0.000001" required value={value.lon} onChange={set('lon')} placeholder="e.g. -96.7970" /></FormField>
      </div>
      <FormField label="Radius (meters) *"><Input type="number" required value={value.radius} onChange={set('radius')} placeholder="e.g. 500" /></FormField>
    </>
  );
}

const ErrorNote = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-rose-50 border border-rose-200 text-rose-700 font-semibold px-3 py-2 rounded-lg text-[11px]">{children}</div>
);

// layout "split": form on the left, list on the right (wide page). "stacked": form above the list (a column).
export function WarehouseManager({ layout = 'split', className = '' }: { layout?: 'split' | 'stacked'; className?: string }) {
  const { data: warehouses = [], refetch: refetchWarehouses } = useWarehouses();
  // Deleting a warehouse also clears it from every employee's assigned list, so profiles are needed and refreshed.
  const { data: employees = [], refetch: refetchProfiles } = useProfiles();

  const [form, setForm] = useState<WhForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<{ id: string; form: WhForm } | null>(null);
  const [error, setError] = useState('');
  const [success, done] = useFlash(1500);
  const [busy, setBusy] = useState<'create' | 'save' | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);


  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (busy) return;
    const problem = validate(form);
    if (problem) return setError(problem);
    setBusy('create');
    try {
      await hrActions.addWarehouse(toPayload(form));
      refetchWarehouses();
      setForm(EMPTY_FORM);
      done('Warehouse created successfully!');
    } catch (err) {
      console.error('Create warehouse failed:', err);
      setError('Could not create that warehouse. Please try again.');
    } finally { setBusy(null); }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (busy || !editing) return;
    const problem = validate(editing.form);
    if (problem) return setError(problem);
    setBusy('save');
    try {
      await hrActions.updateWarehouse(editing.id, toPayload(editing.form));
      refetchWarehouses();
      setEditing(null);
      done('Warehouse updated successfully.');
    } catch (err) {
      console.error('Update warehouse failed:', err);
      setError('Could not save those changes. Please try again.');
    } finally { setBusy(null); }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    setError('');
    setDeletingId(id);
    try {
      await hrActions.deleteWarehouse(id, employees);
      refetchWarehouses();
      refetchProfiles();
      done('Warehouse deleted successfully.');
    } catch (err) {
      console.error('Delete warehouse failed:', err);
      setError('Could not delete that warehouse. Please try again.');
    } finally { setDeletingId(null); }
  };

  const split = layout === 'split';
  const closeEdit = () => { setEditing(null); setError(''); }; // an edit error must not linger on the create form

  return (
    <div className={`space-y-4 ${className}`}>
      <SuccessNote className="px-4 py-3 rounded-xl animate-fade-in shadow-sm">{success}</SuccessNote>

      {error && !editing && <ErrorNote>{error}</ErrorNote>}

      <div className={split ? 'grid grid-cols-1 lg:grid-cols-12 gap-6' : 'space-y-4'}>
        <Card className={`border border-slate-200 ${split ? 'lg:col-span-4 self-start' : ''}`}>
          <div className="px-6 py-4 border-b border-slate-100"><h3 className="font-bold text-slate-900 text-sm">Add Warehouse Location</h3></div>
          <CardContent className="p-6">
            <form onSubmit={create} className="space-y-4">
              <WarehouseFields value={form} onChange={setForm} />
              <Button type="submit" disabled={busy !== null} loading={busy === 'create'}>{busy === 'create' ? 'Creating…' : 'Create Warehouse'}</Button>
            </form>
          </CardContent>
        </Card>

        <Card className={`border border-slate-200 ${split ? 'lg:col-span-8' : ''}`}>
          <div className="px-6 py-4 border-b border-slate-100"><h3 className="font-bold text-slate-900 text-sm">Active Warehouses ({warehouses.length})</h3></div>
          <CardContent className="p-4 space-y-2.5">
            {warehouses.map(wh => (
              <div key={wh.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex justify-between items-center text-xs">
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5 min-w-0">
                    <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    {/* Some names were saved with spaces inside the parentheses ("W1 ( Wilmington )"), which lets the
                        closing ")" wrap onto its own line on narrow screens. Normalised here for display only. */}
                    <span className="truncate">{wh.name.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                    Coords: <span className="font-mono text-slate-600">{wh.latitude}, {wh.longitude}</span> · Radius: <span className="text-orange-600 font-mono">{wh.radius}m</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setError(''); setEditing({ id: wh.id, form: toForm(wh) }); }}
                    disabled={deletingId === wh.id}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 transition-colors transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Edit Warehouse"
                    aria-label={`Edit ${wh.name}`}
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => !deletingId && setPendingDeleteId(wh.id)}
                    disabled={deletingId === wh.id}
                    className="p-2 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-colors transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete Warehouse"
                    aria-label={`Delete ${wh.name}`}
                  >
                    {deletingId === wh.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
            {warehouses.length === 0 && (
              <EmptyState as="div" py={10} size="xs">No warehouses configured yet. Add one to start tracking geofenced clock-ins.</EmptyState>
            )}
          </CardContent>
        </Card>
      </div>

      {editing && (
        <Modal isOpen onClose={closeEdit} title="Edit Warehouse Details">
          <form onSubmit={save} className="space-y-4 pt-1">
            {error && <ErrorNote>{error}</ErrorNote>}
            <WarehouseFields value={editing.form} onChange={next => setEditing({ id: editing.id, form: next })} />
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <Button type="button" variant="outline" disabled={busy === 'save'} onClick={closeEdit}>Cancel</Button>
              <Button type="submit" disabled={busy === 'save'} loading={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save Changes'}</Button>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete warehouse?"
        message="Are you sure you want to delete this warehouse? Assignments will be updated."
        confirmLabel={deletingId ? 'Deleting…' : 'Delete'}
        variant="danger"
        loading={!!deletingId}
      />
    </div>
  );
}
