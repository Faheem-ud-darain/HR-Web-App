import { Spinner } from '@/components/ui/Spinner';

// Shown while a dashboard page is loading; the sidebar and top bar stay in place.
export default function DashboardLoading() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <Spinner />
    </div>
  );
}
