'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Header } from '@/components/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DashboardMetrics } from '@/contracts';
import {
  Users,
  HardHat,
  Building2,
  ShieldCheck,
  Plus,
  ArrowRight,
  TrendingUp,
  Clock,
} from 'lucide-react';

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      const res = await api.get<DashboardMetrics>('/dashboard/metrics');
      return res.data;
    },
  });

  return (
    <div className="pb-12">
      <Header
        title="Contractor Overview Dashboard"
        description="Real-time site deployments, active workforce headcounts, and supervisor assignments"
        action={
          <div className="flex items-center gap-2">
            <Link href="/sites">
              <Button variant="outline" size="sm">
                <Building2 className="w-4 h-4 mr-1.5" />
                View Sites
              </Button>
            </Link>
            <Link href="/workers">
              <Button variant="primary" size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Register Worker
              </Button>
            </Link>
          </div>
        }
      />

      <div className="p-8 max-w-7xl mx-auto space-y-8">
        {/* Metric KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Total Workers */}
          <Card className="hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Total Workers
                </p>
                <h4 className="text-2xl font-bold text-slate-900 mt-1">
                  {isLoading ? '...' : data?.totalWorkers ?? 0}
                </h4>
                <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                  <span>Registered in tenant</span>
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
            </div>
          </Card>

          {/* Active Deployed */}
          <Card className="hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Active Deployed
                </p>
                <h4 className="text-2xl font-bold text-emerald-600 mt-1">
                  {isLoading ? '...' : data?.activeWorkers ?? 0}
                </h4>
                <p className="text-[11px] text-slate-400 mt-1">
                  Currently active status
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <HardHat className="w-6 h-6" />
              </div>
            </div>
          </Card>

          {/* Active Sites */}
          <Card className="hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Active Sites
                </p>
                <h4 className="text-2xl font-bold text-blue-600 mt-1">
                  {isLoading ? '...' : data?.activeSites ?? 0}
                </h4>
                <p className="text-[11px] text-slate-400 mt-1">
                  Ongoing construction sites
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Building2 className="w-6 h-6" />
              </div>
            </div>
          </Card>

          {/* Supervisors */}
          <Card className="hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Supervisors
                </p>
                <h4 className="text-2xl font-bold text-purple-600 mt-1">
                  {isLoading ? '...' : data?.totalSupervisors ?? 0}
                </h4>
                <p className="text-[11px] text-slate-400 mt-1">
                  Assigned site team
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>
          </Card>
        </div>

        {/* 2-column layout: Recent workers & Trades */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Workers Table (2 cols) */}
          <div className="lg:col-span-2">
            <Card
              title="Recently Added Workers"
              subtitle="Latest workforce registrations across sites"
              action={
                <Link
                  href="/workers"
                  className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1"
                >
                  View all workers
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              }
            >
              {isLoading ? (
                <div className="py-8 text-center text-slate-400 text-sm">
                  Loading recent workers...
                </div>
              ) : !data?.recentWorkers || data.recentWorkers.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm">
                  No workers registered yet.{' '}
                  <Link href="/workers" className="text-amber-600 underline">
                    Register your first worker
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        <th className="pb-3">Worker</th>
                        <th className="pb-3">Trade</th>
                        <th className="pb-3">Current Site</th>
                        <th className="pb-3">Wage Rate</th>
                        <th className="pb-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.recentWorkers.map((worker) => (
                        <tr key={worker.id} className="hover:bg-slate-50/60">
                          <td className="py-3.5 font-medium text-slate-900">
                            <Link
                              href={`/workers/${worker.id}`}
                              className="hover:text-amber-600 transition-colors"
                            >
                              {worker.name}
                            </Link>
                            <span className="block text-[11px] text-slate-400 font-mono">
                              {worker.code} • {worker.mobileNumber || 'No Phone'}
                            </span>
                          </td>
                          <td className="py-3.5">
                            <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 font-medium">
                              {worker.trade}
                            </span>
                          </td>
                          <td className="py-3.5 text-slate-600 text-xs">
                            {worker.activeSiteName || (
                              <span className="text-slate-400 italic">Unassigned</span>
                            )}
                          </td>
                          <td className="py-3.5 text-slate-900 font-semibold text-xs">
                            {worker.currentWageRate ? (
                              <span>₹{worker.currentWageRate}</span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-3.5">
                            <Badge
                              variant={
                                worker.verificationStatus === 'VERIFIED'
                                  ? 'success'
                                  : worker.verificationStatus === 'AADHAAR_SUBMITTED'
                                  ? 'info'
                                  : 'neutral'
                              }
                            >
                              {worker.verificationStatus}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {/* Trade Breakdown (1 col) */}
          <div>
            <Card
              title="Trade Skill Distribution"
              subtitle="Active workforce categories"
            >
              {isLoading ? (
                <div className="py-8 text-center text-slate-400 text-sm">
                  Loading trade distribution...
                </div>
              ) : !data?.tradeDistribution || data.tradeDistribution.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm">
                  No trade data available
                </div>
              ) : (
                <div className="space-y-3">
                  {data.tradeDistribution.map((trade) => {
                    const totalActive = data.activeWorkers || 1;
                    const percent = Math.round((trade.count / totalActive) * 100);

                    return (
                      <div key={trade.trade}>
                        <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                          <span>{trade.trade}</span>
                          <span className="text-slate-500 font-normal">
                            {trade.count} ({percent}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-amber-500 h-full rounded-full"
                            style={{ width: `${Math.min(percent, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
