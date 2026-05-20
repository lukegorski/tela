'use client';

import type { ReactNode } from 'react';
import { AdminGate } from './AdminGate';

// Thin wrapper around AdminGate; gives the root layout a stable composition
// point that matches the legacy AdminShell naming and lets us drop in the
// 14c AdminAiPanel slide-out without restructuring layout.tsx.
export function AdminShell({ children }: { children: ReactNode }) {
  return <AdminGate>{children}</AdminGate>;
}
