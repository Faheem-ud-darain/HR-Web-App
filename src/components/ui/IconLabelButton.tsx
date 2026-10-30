import React from 'react';
import { Button, type ButtonProps } from '@/components/ui/Button';

// A compact button that is just its icon on a phone and icon + label from `from` up (md or lg). Toolbars use it so the
// same action reads as a square icon on a phone and a labelled button on a desktop.
const SHAPE = {
  md: { box: 'h-8 w-8 p-0 md:h-auto md:w-auto md:px-3 md:py-1.5', label: 'hidden md:inline' },
  lg: { box: 'h-8 w-8 p-0 lg:h-auto lg:w-auto lg:px-3 lg:py-1.5', label: 'hidden lg:inline' },
};

export function IconLabelButton({ icon, label, from = 'lg', loading, className = '', ...props }: Omit<ButtonProps, 'children' | 'size'> & { icon: React.ReactNode; label: React.ReactNode; from?: 'md' | 'lg' }) {
  return (
    <Button size="xs" loading={loading} className={`shrink-0 ${SHAPE[from].box} ${className}`} {...props}>
      {!loading && icon}
      <span className={SHAPE[from].label}>{label}</span>
    </Button>
  );
}
