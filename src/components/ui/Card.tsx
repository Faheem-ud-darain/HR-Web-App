import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ children, className = '', onKeyDown, ...props }: CardProps) {
  // A card with a click handler is a button for keyboard and screen-reader users too (Enter or Space opens it).
  const clickable = Boolean(props.onClick);
  const hasPadding = className.split(' ').some(c => c.startsWith('p-') || c.startsWith('px-') || c.startsWith('py-'));
  const paddingClass = hasPadding ? '' : 'p-6';

  return (
    <div
      {...(clickable && { role: 'button', tabIndex: 0 })}
      onKeyDown={e => {
        onKeyDown?.(e);
        if (clickable && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click(); }
      }}
      className={`bg-card border border-slate-200 rounded-xl transition-colors transition-transform transition-shadow duration-200 ease-out hover:shadow-md hover:border-slate-300 ${clickable ? 'cursor-pointer' : ''} ${paddingClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', ...props }: CardProps) {
  return (
    <div className={`flex flex-col space-y-1.5 mb-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '', ...props }: CardProps) {
  return (
    <h3 className={`font-semibold text-lg tracking-tight text-slate-900 ${className}`} {...props}>
      {children}
    </h3>
  );
}

export function CardContent({ children, className = '', ...props }: CardProps) {
  return (
    <div className={`text-slate-700 ${className}`} {...props}>
      {children}
    </div>
  );
}
