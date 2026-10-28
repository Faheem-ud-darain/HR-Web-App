import React from 'react';
import { Briefcase, ClipboardList, Clock, HelpCircle, Megaphone, MapPin, User, Users, Wallet } from 'lucide-react';
import { displayName as resolveDisplayName } from '@/lib/hrData';
import { hasAnyResult, searchLinks, type SearchResults as Results } from '@/lib/core/globalSearch';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';

// One block of results: an icon heading with the count, then a row per match (the first `limit` when given).
function Group<T>({ icon: Icon, title, items, limit, keyOf, onPick, rowClass = '', stack, children }: {
  icon: React.ComponentType<{ className?: string }>; title: string; items: T[]; limit?: number; keyOf: (item: T) => string;
  onPick: () => void; rowClass?: string; stack?: boolean; children: (item: T) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <div className="p-3">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
        <Icon className="h-3 w-3" /> {title} ({items.length})
      </div>
      <div className="space-y-1">
        {(limit ? items.slice(0, limit) : items).map(item => (
          <button key={keyOf(item)} onClick={onPick}
            className={`w-full text-left p-2.5 hover:bg-slate-50 rounded-xl text-xs transition-colors min-h-[44px] flex ${stack ? 'flex-col gap-0.5' : 'justify-between items-center'} ${rowClass}`}>
            {children(item)}
          </button>
        ))}
      </div>
    </div>
  );
}

// Two lines (title over a muted detail) with an optional status badge on the right.
const Lines = ({ title, detail, badge, tone = 'default' }: { title: string; detail?: string; badge?: string; tone?: BadgeVariant }) => (
  <>
    <div className="min-w-0 flex-1">
      <p className="font-bold text-slate-800 truncate">{title}</p>
      {detail !== undefined && <p className="text-[10px] text-slate-400 truncate">{detail}</p>}
    </div>
    {badge && <Badge size="sm" variant={tone} className="uppercase ml-2">{badge}</Badge>}
  </>
);

// Every searchable record type, grouped. The same list fills the desktop dropdown (capped at 4 rows a group) and the
// mobile sheet (uncapped).
export function SearchResults({ results: r, role, limit, onGo }: { results: Results; role: string | null; limit?: number; onGo: (url: string) => void }) {
  const link = searchLinks(role);
  return (
    <>
      <Group icon={User} title="Employees" items={r.employees} limit={limit} keyOf={e => e.email} onPick={() => onGo(link.employees)}>
        {emp => (
          <>
            <div>
              <p className="font-bold text-slate-800">{resolveDisplayName(emp, role as 'hr' | 'admin')}</p>
              <p className="text-[10px] text-slate-400">{emp.email}</p>
            </div>
            <Badge size="sm" className="uppercase">{emp.role}</Badge>
          </>
        )}
      </Group>
      <Group icon={ClipboardList} title="Tasks" items={r.tasks} limit={limit} keyOf={t => t.id} onPick={() => onGo(link.tasks)}>
        {t => <Lines title={t.title} detail={t.assignedTo} badge={t.status} tone={t.status === 'done' ? 'success' : 'warning'} />}
      </Group>
      <Group icon={HelpCircle} title="Tickets" items={r.tickets} limit={limit} keyOf={t => t.id} onPick={() => onGo(link.tickets)}>
        {t => <Lines title={t.title} detail={t.employeeName} badge={t.status} tone={t.status === 'open' ? 'warning' : 'default'} />}
      </Group>
      <Group icon={Users} title="Teams" items={r.teams} limit={limit} keyOf={t => t.id} onPick={() => onGo(link.teams)} rowClass="font-semibold text-slate-700">
        {t => (
          <>
            <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-slate-400" /> {t.name}</span>
            <span className="text-[9px] uppercase font-bold text-orange-600">View</span>
          </>
        )}
      </Group>
      <Group icon={MapPin} title="Warehouses" items={r.warehouses} limit={limit} keyOf={w => w.id} onPick={() => onGo(link.warehouses)} rowClass="font-semibold text-slate-700">
        {w => (
          <>
            <span>{w.name}</span>
            <span className="text-[9px] uppercase font-bold text-orange-600">View</span>
          </>
        )}
      </Group>
      <Group icon={Wallet} title="Payroll" items={r.payroll} limit={limit} keyOf={p => p.id} onPick={() => onGo(link.payroll)}>
        {p => <Lines title={p.name} detail={p.role} badge={p.processed ? 'paid' : 'pending'} tone={p.processed ? 'success' : 'warning'} />}
      </Group>
      <Group icon={Clock} title="Leaves" items={r.leaves} limit={limit} keyOf={l => l.id} onPick={() => onGo(link.leaves)}>
        {l => <Lines title={l.employeeName} detail={`${l.type} · ${l.duration}`} badge={l.status} tone={l.status === 'approved' ? 'success' : l.status === 'rejected' ? 'danger' : 'warning'} />}
      </Group>
      <Group icon={Briefcase} title="Career Board" items={r.careers} limit={limit} keyOf={c => c.id} onPick={() => onGo(link.careers)}>
        {c => <Lines title={c.title} detail={c.department} />}
      </Group>
      <Group icon={Megaphone} title="Announcements" items={r.announcements} limit={limit} keyOf={a => a.id} onPick={() => onGo(link.home)} stack>
        {a => (
          <>
            <p className="font-bold text-slate-800 truncate">{a.title}</p>
            <p className="text-[10px] text-slate-400 truncate">{a.content}</p>
          </>
        )}
      </Group>
      {!hasAnyResult(r) && <div className="p-8 text-center text-slate-400 font-semibold italic text-xs">No matching results found.</div>}
    </>
  );
}
