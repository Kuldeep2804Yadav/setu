'use client';

import React from 'react';
import Link from 'next/navigation';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  LayoutDashboard,
  Building2,
  Users2,
  CalendarCheck,
  Receipt,
  ShieldCheck,
  Settings,
  LogOut,
  HardHat,
} from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Sites', href: '/sites', icon: Building2 },
    { label: 'Workers', href: '/workers', icon: Users2 },
    { label: 'Attendance', href: '/attendance', icon: CalendarCheck },
    { label: 'Wage Register', href: '/wages', icon: Receipt },
    ...(['OWNER', 'ACCOUNTANT'].includes(user?.role ?? '') ? [{ label: 'Payroll & Payments', href: '/finance', icon: Receipt }] : []),
    { label: 'Team', href: '/team', icon: ShieldCheck },
    { label: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <aside className="hidden w-56 bg-slate-900 text-slate-200 md:flex lg:w-64 flex-col min-h-screen border-r border-slate-800">
      {/* Brand Header */}
      <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-800 bg-slate-950/40">
        <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 shadow-md">
          <HardHat className="w-5 h-5" />
        </div>
        <div>
          <span className="font-bold text-base tracking-tight text-white block">
            Labour<span className="text-amber-500">Setu</span>
          </span>
          <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block -mt-0.5">
            Phase 2 • Attendance & Wages
          </span>
        </div>
      </div>

      {/* Contractor Badge */}
      {user?.organization && (
        <div className="px-5 py-3.5 mx-3 mt-4 rounded-xl bg-slate-800/60 border border-slate-700/50">
          <p className="text-[11px] uppercase font-bold text-amber-400 tracking-wider">
            Active Tenant
          </p>
          <p className="text-xs font-semibold text-white truncate mt-0.5">
            {user.organization.name}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">
              {user.organization.code}
            </span>
            <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-bold">
              {user.role}
            </span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      {/* User Footer & Logout */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/20">
        <div className="flex items-center justify-between mb-3">
          <div className="min-w-0 flex-1 mr-2">
            <p className="text-xs font-semibold text-white truncate">
              {user?.name}
            </p>
            <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            title="Log out"
            className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
