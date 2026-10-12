'use client';

import React, { createContext, useContext } from 'react';

// Composable table kit. Every table in the app repeated the same header
// style, row hover, dividers and cell padding; those now live here so a
// design change is one edit. Compose it like a plain <table>:
//
//   <TableScroll hideOnMobile>
//     <Table density="comfortable" minWidth={750}>
//       <THead><tr><Th>Name</Th><Th align="right">Amount</Th></tr></THead>
//       <TBody>
//         <Tr><Td>Ada</Td><Td align="right" className="font-mono">$10</Td></Tr>
//       </TBody>
//     </Table>
//   </TableScroll>
//
// `density` is set once on <Table> and inherited by every Th/Td, so header
// and body padding can never drift apart (a Th/Td may still override it).

export type TableDensity = 'comfortable' | 'cozy' | 'compact' | 'tight';

const CELL_PADDING: Record<TableDensity, string> = {
  comfortable: 'px-6 py-4',
  cozy: 'px-5 py-3',
  compact: 'px-4 py-2.5',
  // Nested log lists inside a panel that already has its own horizontal padding.
  tight: 'py-1.5',
};

const ALIGN = { left: '', center: 'text-center', right: 'text-right' } as const;
type Align = keyof typeof ALIGN;

const DensityContext = createContext<TableDensity>('comfortable');

const cx = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(' ');

// Horizontal scroller around a table. `hideOnMobile` is for screens that
// render a separate card list below the md breakpoint.
export function TableScroll({ hideOnMobile = false, className, children }: { hideOnMobile?: boolean; className?: string; children: React.ReactNode }) {
  return <div className={cx(hideOnMobile && 'hidden md:block', 'overflow-x-auto', className)}>{children}</div>;
}

type TableProps = Omit<React.TableHTMLAttributes<HTMLTableElement>, 'children'> & {
  density?: TableDensity;
  size?: 'xs' | 'sm';
  // Below this width the surrounding TableScroll scrolls instead of squashing columns.
  minWidth?: number;
  children: React.ReactNode;
};

export function Table({ density = 'comfortable', size = 'sm', minWidth, className, style, children, ...props }: TableProps) {
  return (
    <DensityContext.Provider value={density}>
      <table
        className={cx('w-full text-left border-collapse', size === 'xs' ? 'text-xs' : 'text-sm', className)}
        style={minWidth ? { minWidth, ...style } : style}
        {...props}
      >
        {children}
      </table>
    </DensityContext.Provider>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cx('text-xs font-bold text-slate-600 bg-slate-50 uppercase tracking-wider border-b border-slate-200', className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cx('divide-y divide-slate-100', className)} {...props} />;
}

// Body row. Set `interactive={false}` for rows that aren't clickable/hoverable.
export function Tr({ interactive = true, className, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return <tr className={cx(interactive && 'hover:bg-slate-50/50 transition-colors', className)} {...props} />;
}

type CellProps<T> = T & { align?: Align; density?: TableDensity };

export function Th({ align = 'left', density, className, ...props }: CellProps<React.ThHTMLAttributes<HTMLTableCellElement>>) {
  const inherited = useContext(DensityContext);
  return <th scope="col" className={cx(CELL_PADDING[density ?? inherited], ALIGN[align], className)} {...props} />;
}

export function Td({ align = 'left', density, className, ...props }: CellProps<React.TdHTMLAttributes<HTMLTableCellElement>>) {
  const inherited = useContext(DensityContext);
  return <td className={cx(CELL_PADDING[density ?? inherited], ALIGN[align], className)} {...props} />;
}
