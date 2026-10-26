'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { Shield, MapPin } from 'lucide-react';

interface HeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function Header({ title, description, action }: HeaderProps) {
  const { user } = useAuth();

  return (
    <header className="bg-white border-b border-slate-200/80 px-8 py-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="text-xs text-slate-500 mt-1">{description}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {action}
          <div className="hidden lg:flex items-center gap-2 pl-4 border-l border-slate-200">
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-900">{user?.name}</p>
              <div className="flex items-center gap-1 justify-end text-[11px] text-slate-500">
                <Shield className="w-3 h-3 text-amber-500" />
                <span>{user?.role}</span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
