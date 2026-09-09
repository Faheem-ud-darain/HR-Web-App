'use client';

import { useEffect, useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { isPushEnabled, requestPushPermissionAgain, isPushConfigured } from '@/lib/push';

// Shows a blocking-but-dismissible prompt whenever this device's push
// notifications are off, checked fresh on every login (not remembered
// across sessions) — permission can be silently revoked later from the
// phone's own Settings without the app ever finding out otherwise, and the
// user explicitly asked for this to nag every time rather than just once.
//
// Dismissing ("Not now") only hides it for the rest of this session; it
// comes back next time this component mounts (i.e. next login/app open),
// same as the request asked for. There's no "don't ask again" — that's
// deliberate.
export function PushPermissionPrompt() {
  const [show, setShow] = useState(false);
  const [checked, setChecked] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!isPushConfigured()) return;
    let cancelled = false;
    // Small delay so this doesn't compete with the native permission
    // prompt initPush() itself may already be triggering on a fresh
    // install — check happens after that settles instead of both firing
    // at once.
    const timer = setTimeout(() => {
      isPushEnabled().then((enabled) => {
        if (!cancelled) {
          setShow(!enabled);
          setChecked(true);
        }
      });
    }, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  const handleEnable = async () => {
    setRequesting(true);
    try {
      const granted = await requestPushPermissionAgain();
      if (granted) setShow(false);
    } finally {
      setRequesting(false);
    }
  };

  if (!checked || !show) return null;

  return (
    <Modal isOpen={show} onClose={() => setShow(false)} title="Turn on Notifications">
      <div className="space-y-4 text-center py-2">
        <div className="h-14 w-14 rounded-full bg-orange-50 flex items-center justify-center mx-auto">
          <BellOff className="h-7 w-7 text-orange-600" />
        </div>
        <div>
          <p className="text-sm text-slate-700 font-medium leading-relaxed">
            Notifications are currently off for DelCargo Internal on this device. You won&apos;t be alerted about new tasks, tickets, or Team Chat mentions until you turn them back on.
          </p>
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <Button
            variant="primary"
            fullWidth
            onClick={handleEnable}
            disabled={requesting}
            className="active:scale-97 transition-transform"
          >
            <BellRing className="h-4 w-4" />
            {requesting ? 'Requesting…' : 'Enable Notifications'}
          </Button>
          <Button
            variant="outline"
            fullWidth
            onClick={() => setShow(false)}
            className="active:scale-97 transition-transform"
          >
            Not Now
          </Button>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          If nothing happens when you tap Enable, notifications were likely blocked before — open your phone&apos;s Settings → Apps → DelCargo Internal → Notifications and turn them on there.
        </p>
      </div>
    </Modal>
  );
}
