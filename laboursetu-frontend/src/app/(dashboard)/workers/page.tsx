'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Header } from '@/components/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TRADES } from '@/contracts';
import {
  Users2,
  Plus,
  Search,
  Filter,
  AlertCircle,
  Building2,
  IndianRupee,
  ChevronRight,
} from 'lucide-react';

interface WorkerItem {
  id: string;
  code: string;
  name: string;
  trade: string;
  mobileNumber: string | null;
  verificationStatus: string;
  status: string;
  activeSite: { id: string; name: string; code: string; assignedSince: string } | null;
  currentWage: { id: string; wageType: string; rate: number } | null;
  createdAt: string;
}

interface SiteOption {
  id: string;
  name: string;
  code: string;
}

export default function WorkersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [tradeFilter, setTradeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    mobileNumber: '',
    trade: 'Helper',
    verificationStatus: 'UNVERIFIED',
    aadhaarLastFour: '',
    initialSiteId: '',
    wageType: 'DAILY' as 'DAILY' | 'HOURLY',
    wageRate: '600',
    notes: '',
  });

  // Query workers
  const { data, isLoading } = useQuery({
    queryKey: ['workers', search, tradeFilter, statusFilter],
    queryFn: async () => {
      const res = await api.get<WorkerItem[]>('/workers', {
        search: search || undefined,
        trade: tradeFilter || undefined,
        status: statusFilter || undefined,
      });
      return res.data;
    },
  });

  // Query sites for initial assignment dropdown
  const { data: sites } = useQuery({
    queryKey: ['sites-options'],
    queryFn: async () => {
      const res = await api.get<SiteOption[]>('/sites', { status: 'ACTIVE' });
      return res.data;
    },
  });

  // Register worker mutation
  const registerMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: formData.name,
        code: formData.code ? formData.code.toUpperCase() : undefined,
        mobileNumber: formData.mobileNumber || undefined,
        trade: formData.trade,
        verificationStatus: formData.verificationStatus,
        aadhaarLastFour: formData.aadhaarLastFour || undefined,
        notes: formData.notes || undefined,
        initialSiteId: formData.initialSiteId || undefined,
        initialWage: formData.wageRate
          ? {
              wageType: formData.wageType,
              rate: parseFloat(formData.wageRate),
              notes: 'Initial joining rate',
            }
          : undefined,
      };

      const res = await api.post('/workers', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      setIsRegisterOpen(false);
      setFormData({
        name: '',
        code: '',
        mobileNumber: '',
        trade: 'Helper',
        verificationStatus: 'UNVERIFIED',
        aadhaarLastFour: '',
        initialSiteId: '',
        wageType: 'DAILY',
        wageRate: '600',
        notes: '',
      });
      setFormError(null);
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to register worker.');
    },
  });

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    registerMutation.mutate();
  };

  return (
    <div className="pb-12">
      <Header
        title="Worker Profiles Directory"
        description="Comprehensive labor register, wage rates, trades, and site deployment tracking"
        action={
          <Button variant="primary" onClick={() => setIsRegisterOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Register New Worker
          </Button>
        }
      />

      <div className="p-8 max-w-7xl mx-auto space-y-6">
        {/* Search & Filters */}
        <div className="flex flex-col lg:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative w-full lg:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by worker name, code, phone..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <select
              value={tradeFilter}
              onChange={(e) => setTradeFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">All Trades ({TRADES.length})</option>
              {TRADES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        </div>

        {/* Workers Table */}
        <Card>
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              Loading worker directory...
            </div>
          ) : !data || data.length === 0 ? (
            <div className="py-16 text-center">
              <Users2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h4 className="text-base font-semibold text-slate-900">
                No workers found
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                Register workers with their trade category, initial wage rate, and site allocation.
              </p>
              <Button variant="primary" onClick={() => setIsRegisterOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" />
                Register First Worker
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="pb-3.5">Code</th>
                    <th className="pb-3.5">Worker Name</th>
                    <th className="pb-3.5">Trade</th>
                    <th className="pb-3.5">Phone Number</th>
                    <th className="pb-3.5">Current Site</th>
                    <th className="pb-3.5">Current Wage</th>
                    <th className="pb-3.5">Verification</th>
                    <th className="pb-3.5">Status</th>
                    <th className="pb-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map((worker) => (
                    <tr
                      key={worker.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="py-3.5 font-mono text-xs font-bold text-slate-700">
                        {worker.code}
                      </td>
                      <td className="py-3.5 font-medium text-slate-900">
                        <Link
                          href={`/workers/${worker.id}`}
                          className="hover:text-amber-600 font-semibold"
                        >
                          {worker.name}
                        </Link>
                      </td>
                      <td className="py-3.5">
                        <span className="inline-block px-2.5 py-0.5 rounded text-xs bg-slate-100 text-slate-800 font-medium">
                          {worker.trade}
                        </span>
                      </td>
                      <td className="py-3.5 text-xs text-slate-600 font-mono">
                        {worker.mobileNumber || (
                          <span className="text-slate-400 italic font-sans">None</span>
                        )}
                      </td>
                      <td className="py-3.5 text-xs text-slate-700">
                        {worker.activeSite ? (
                          <span className="flex items-center gap-1 font-medium">
                            <Building2 className="w-3.5 h-3.5 text-amber-500" />
                            {worker.activeSite.name}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3.5 text-xs text-slate-900 font-semibold">
                        {worker.currentWage ? (
                          <span>
                            ₹{worker.currentWage.rate} /{' '}
                            <span className="text-[11px] text-slate-500 font-normal">
                              {worker.currentWage.wageType === 'DAILY' ? 'day' : 'hr'}
                            </span>
                          </span>
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
                      <td className="py-3.5">
                        <Badge
                          variant={
                            worker.status === 'ACTIVE'
                              ? 'success'
                              : worker.status === 'ARCHIVED'
                              ? 'danger'
                              : 'neutral'
                          }
                        >
                          {worker.status}
                        </Badge>
                      </td>
                      <td className="py-3.5 text-right">
                        <Link href={`/workers/${worker.id}`}>
                          <Button variant="ghost" size="sm">
                            Details
                            <ChevronRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Register Worker Modal */}
      <Modal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        title="Register Construction Worker"
        description="Add a worker profile, initial wage rate, and site deployment"
        maxWidth="lg"
      >
        {formError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleRegisterSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Worker Full Name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Ramesh Kumar"
            />

            <Input
              label="Custom Worker Code (Optional)"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              placeholder="Leave blank for auto (WRK-XXX)"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Mobile Number (Optional)"
              type="tel"
              value={formData.mobileNumber}
              onChange={(e) =>
                setFormData({ ...formData, mobileNumber: e.target.value })
              }
              placeholder="10-digit mobile number"
              helperText="Shared family phones supported across different names"
            />

            <Select
              label="Trade / Skill Category"
              value={formData.trade}
              onChange={(e) => setFormData({ ...formData, trade: e.target.value })}
              options={TRADES.map((t) => ({ value: t, label: t }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Verification Status"
              value={formData.verificationStatus}
              onChange={(e) =>
                setFormData({ ...formData, verificationStatus: e.target.value })
              }
              options={[
                { value: 'UNVERIFIED', label: 'Unverified' },
                { value: 'AADHAAR_SUBMITTED', label: 'Aadhaar Submitted' },
                { value: 'VERIFIED', label: 'Verified' },
              ]}
            />

            <Input
              label="Aadhaar Last 4 Digits (Optional)"
              maxLength={4}
              value={formData.aadhaarLastFour}
              onChange={(e) =>
                setFormData({ ...formData, aadhaarLastFour: e.target.value })
              }
              placeholder="e.g. 5432"
            />
          </div>

          {/* Wage Rate Initial Configuration */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
            <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Initial Wage-Rate Record
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Wage Calculation Type"
                value={formData.wageType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    wageType: e.target.value as 'DAILY' | 'HOURLY',
                  })
                }
                options={[
                  { value: 'DAILY', label: 'Daily Wage (दिहाड़ी)' },
                  { value: 'HOURLY', label: 'Hourly Wage (घंटे की दर)' },
                ]}
              />

              <Input
                label="Wage Rate (INR ₹)"
                type="number"
                step="0.01"
                min="1"
                required
                value={formData.wageRate}
                onChange={(e) =>
                  setFormData({ ...formData, wageRate: e.target.value })
                }
                placeholder="600"
              />
            </div>
          </div>

          {/* Initial Site Assignment */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80">
            <Select
              label="Assign to Active Site (Optional)"
              value={formData.initialSiteId}
              onChange={(e) =>
                setFormData({ ...formData, initialSiteId: e.target.value })
              }
              options={[
                { value: '', label: '-- Not Assigned (Bench / Reserve) --' },
                ...(sites || []).map((s) => ({
                  value: s.id,
                  label: `${s.name} (${s.code})`,
                })),
              ]}
            />
          </div>

          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsRegisterOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={registerMutation.isPending}
            >
              Register Worker
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
