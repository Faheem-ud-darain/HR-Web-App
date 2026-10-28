'use client';

import React, { useState } from 'react';
import { PlusIcon as Plus } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormError } from '@/components/ui/FormError';
import { Input } from '@/components/ui/Input';
import { useFlash } from '@/lib/useFlash';

// The "new team" form above the builder. `onCreate` does the write and throws if it fails.
export function TeamBuilderForm({ teamNames, onCreate }: { teamNames: string[]; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, flashError] = useFlash(3000);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (teamNames.some(t => t.toLowerCase() === trimmed.toLowerCase())) return flashError(`A team named "${trimmed}" already exists.`);
    setCreating(true);
    try {
      await onCreate(trimmed);
      setName('');
    } catch (err) {
      console.error('[Teams] Create team failed:', err);
      flashError('Failed to create team. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card className="p-4 bg-slate-50/50 border border-slate-200 space-y-3">
      <FormError>{error}</FormError>
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3 items-center">
        <div className="flex-1 w-full">
          <Input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Enter team/department name (e.g. Quality Assurance)" fieldSize="md" />
        </div>
        <Button type="submit" variant="outline" disabled={creating || !name.trim()} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" /> {creating ? 'Creating…' : 'Create Team'}
        </Button>
      </form>
    </Card>
  );
}
