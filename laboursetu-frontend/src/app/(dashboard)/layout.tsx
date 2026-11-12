'use client';

import React from 'react';
import { Sidebar } from '@/components/Sidebar';
import { useAuth } from '@/lib/auth-context';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-400">Loading LabourSetu...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <nav aria-label="Mobile navigation" className="flex gap-4 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3 text-sm md:hidden">
          {['dashboard','sites','workers','attendance','wages',...(['OWNER','ACCOUNTANT'].includes(user.role)?['finance']:[]),'settings'].map(path=><a key={path} href={`/${path}`} className="whitespace-nowrap capitalize text-slate-700">{path==='finance'?'Payroll & payments':path}</a>)}
        </nav>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
