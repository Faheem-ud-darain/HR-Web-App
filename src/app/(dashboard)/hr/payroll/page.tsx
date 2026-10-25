'use client';

import { PayrollScreen } from '@/components/payroll/PayrollScreen';

// Payroll is one shared screen for HR and Admin (see components/payroll/PayrollScreen.tsx and
// plans/028-simplify-payroll-tab.md). Admin additionally marks salaries as paid.
export default function HRPayrollPage() {
  return <PayrollScreen role="hr" />;
}
