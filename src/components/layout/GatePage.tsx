import React from 'react';
import { Card } from '@/components/ui/Card';

// The page behind the gates a signed-in employee meets before the dashboard (the onboarding steps, "awaiting approval"):
// the app's page colour, one card in the middle, clear of the status bar and home indicator on phones.
export function GatePage({ children, width = 'max-w-xl' }: { children: React.ReactNode; width?: string }) {
  return (
    <div className="min-h-screen bg-app flex flex-col items-center px-4 sm:px-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:justify-center">
      <Card className={`w-full ${width} p-5 sm:p-8 hover:shadow-none`}>{children}</Card>
    </div>
  );
}
