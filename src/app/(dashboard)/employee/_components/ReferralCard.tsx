import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { GiftIcon as Gift } from '@/components/ui/icons';

// A short invitation to refer candidates, with the reward and a link to the open positions.
export function ReferralCard() {
  return (
    <Card className="border-emerald-200 bg-emerald-50/40 p-4 md:p-5 space-y-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Gift weight="duotone" className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <h3 className="text-sm font-bold text-slate-900">Refer a candidate</h3>
          <p className="text-caption font-semibold text-emerald-700">PKR 10,000 bonus after 6 months of their service</p>
        </div>
      </div>
      <ButtonLink href="/employee/careers" variant="outline" size="md" fullWidth>View open positions</ButtonLink>
    </Card>
  );
}
