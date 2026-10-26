'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { getTodayIST, formatDateDisplay, isFutureDateIST } from '@/lib/date';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  CalendarCheck,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  FileText,
  Building2,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';

export default function AttendancePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [siteFilter, setSiteFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isInitModalOpen, setIsInitModalOpen] = useState(false);

  // New attendance modal state
  const todayIST = getTodayIST();
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(todayIST);
  const [initError, setInitError] = useState<string | null>(null);

  // Fetch Sites for filters and modal
  const { data: sitesData, isLoading: isSitesLoading } = useQuery({
    queryKey: ['sites-list'],
    queryFn: () => api.get<any[]>('/sites?limit=100'),
  });

  const rawSites: any[] = Array.isArray(sitesData?.data)
    ? sitesData.data
    : (sitesData?.data as any)?.sites || [];

  // Filter for supervisor if role is supervisor and supervisor assignments exist
  const sites =
    user?.role === 'SUPERVISOR' && rawSites.some((s: any) => s.supervisors?.some((sup: any) => sup.id === user.id))
      ? rawSites.filter((s: any) => s.supervisors?.some((sup: any) => sup.id === user.id))
      : rawSites;

  // Fetch Submissions
  const { data: submissionsData, isLoading, error } = useQuery({
    queryKey: ['attendance-submissions', statusFilter, siteFilter, startDate, endDate],
    queryFn: () => {
      const params: Record<string, any> = {};
      if (statusFilter && statusFilter !== 'ALL') params.status = statusFilter;
      if (siteFilter) params.siteId = siteFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      return api.get<any[]>('/attendance/submissions', params);
    },
  });

  const submissions: any[] = Array.isArray(submissionsData?.data)
    ? submissionsData.data
    : (submissionsData?.data as any)?.submissions || [];

  // Mutation to Initialize/Open Submission
  const initMutation = useMutation({
    mutationFn: async ({ siteId, attendanceDate }: { siteId: string; attendanceDate: string }) => {
      return api.post<any>('/attendance/submissions', { siteId, attendanceDate });
    },
    onSuccess: (res) => {
      setIsInitModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['attendance-submissions'] });
      router.push(`/attendance/${res.data.id}`);
    },
    onError: (err: any) => {
      setInitError(err.message || 'Failed to initialize attendance submission');
    },
  });

  const handleCreateOrOpen = (e: React.FormEvent) => {
    e.preventDefault();
    setInitError(null);

    if (!selectedSiteId) {
      setInitError('Please select a construction site.');
      return;
    }

    if (!selectedDate) {
      setInitError('Please select an attendance date.');
      return;
    }

    if (isFutureDateIST(selectedDate)) {
      setInitError('Attendance cannot be recorded for future dates.');
      return;
    }

    initMutation.mutate({ siteId: selectedSiteId, attendanceDate: selectedDate });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return (
          <Badge variant="outline" className="border-amber-400/40 text-amber-500 bg-amber-500/10 gap-1.5 font-medium">
            <Clock className="w-3.5 h-3.5" /> Draft
          </Badge>
        );
      case 'SUBMITTED':
        return (
          <Badge variant="outline" className="border-blue-400/40 text-blue-500 bg-blue-500/10 gap-1.5 font-medium">
            <AlertCircle className="w-3.5 h-3.5" /> Submitted
          </Badge>
        );
      case 'APPROVED':
        return (
          <Badge variant="outline" className="border-emerald-400/40 text-emerald-500 bg-emerald-500/10 gap-1.5 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
          </Badge>
        );
      case 'REJECTED':
        return (
          <Badge variant="outline" className="border-rose-400/40 text-rose-500 bg-rose-500/10 gap-1.5 font-medium">
            <XCircle className="w-3.5 h-3.5" /> Rejected
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <CalendarCheck className="w-7 h-7 text-amber-500" />
            Attendance Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Record daily and hourly worker attendance, submit site rosters, and review wage-calculation approvals.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push('/attendance/corrections')}
            className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            Corrections Queue
          </Button>

          <Button
            onClick={() => {
              setInitError(null);
              setIsInitModalOpen(true);
            }}
            className="gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Mark / Enter Attendance
          </Button>
        </div>
      </div>

      {/* Filter Tabs & Selectors */}
      <Card className="p-4 bg-white border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-lg">
            {['ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'ALL' ? 'All Submissions' : st.charAt(0) + st.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Timezone: <span className="font-semibold text-slate-700">Asia/Kolkata (IST)</span> • Today: <span className="font-semibold text-amber-600">{todayIST}</span>
          </div>
        </div>

        {/* Query Filter Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Filter by Site</label>
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="w-full text-xs h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">All Assigned Sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name} ({site.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">From Date</label>
            <input
              type="date"
              value={startDate}
              max={todayIST}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-xs h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">To Date</label>
            <input
              type="date"
              value={endDate}
              max={todayIST}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-xs h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>
      </Card>

      {/* Submissions List */}
      <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">
            <Clock className="w-8 h-8 animate-spin mx-auto text-amber-500 mb-3" />
            <p className="text-sm font-medium">Loading attendance records...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-rose-500">
            <AlertCircle className="w-8 h-8 mx-auto mb-3" />
            <p className="text-sm font-medium">Failed to load attendance records</p>
          </div>
        ) : submissions.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800">No attendance records found</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
              Select a site and date to start recording worker attendance for your construction projects.
            </p>
            <Button
              onClick={() => setIsInitModalOpen(true)}
              className="mt-4 gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold"
            >
              <Plus className="w-4 h-4" /> Start Attendance Entry
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">Attendance Date</th>
                  <th className="px-6 py-3.5 font-semibold">Site</th>
                  <th className="px-6 py-3.5 font-semibold">Status</th>
                  <th className="px-6 py-3.5 font-semibold text-center">Entries</th>
                  <th className="px-6 py-3.5 font-semibold">Workflow Details</th>
                  <th className="px-6 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submissions.map((sub: any) => (
                  <tr
                    key={sub.id}
                    onClick={() => router.push(`/attendance/${sub.id}`)}
                    className="hover:bg-amber-50/40 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">
                      <div className="font-semibold">{formatDateDisplay(sub.attendanceDate)}</div>
                      <span className="text-[11px] font-mono text-slate-400">{sub.attendanceDate}</span>
                    </td>

                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{sub.site?.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{sub.site?.code}</div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(sub.status)}
                    </td>

                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">
                        {sub.attendanceCount || 0} workers
                      </span>
                    </td>

                    <td className="px-6 py-4 text-xs text-slate-600">
                      {sub.status === 'APPROVED' && sub.approvedByUser && (
                        <div>
                          Approved by <span className="font-medium text-slate-900">{sub.approvedByUser.name}</span>
                          <div className="text-[11px] text-slate-400">{formatDateDisplay(sub.approvedAt)}</div>
                        </div>
                      )}
                      {sub.status === 'SUBMITTED' && sub.submittedByUser && (
                        <div>
                          Submitted by <span className="font-medium text-slate-900">{sub.submittedByUser.name}</span>
                          <div className="text-[11px] text-slate-400">{formatDateDisplay(sub.submittedAt)}</div>
                        </div>
                      )}
                      {sub.status === 'REJECTED' && (
                        <div className="text-rose-600 font-medium">
                          Rejected: <span className="font-normal italic">&quot;{sub.rejectionReason}&quot;</span>
                        </div>
                      )}
                      {sub.status === 'DRAFT' && (
                        <span className="text-slate-400 italic">Editable draft in progress</span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/attendance/${sub.id}`);
                        }}
                        className="gap-1 text-slate-600 hover:text-amber-600 hover:bg-amber-50"
                      >
                        {sub.status === 'SUBMITTED' && (user?.role === 'OWNER' || user?.role === 'ACCOUNTANT')
                          ? 'Review & Approve'
                          : 'Open Roster'}
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal: Initialize/Open Attendance Entry */}
      <Modal
        isOpen={isInitModalOpen}
        onClose={() => setIsInitModalOpen(false)}
        title="Mark Site Attendance"
      >
        <form onSubmit={handleCreateOrOpen} className="space-y-4">
          <p className="text-xs text-slate-500">
            Select the construction site and attendance date to view eligible workers and enter daily/hourly attendance.
          </p>

          {initError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{initError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Construction Site <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              required
              disabled={isSitesLoading}
              className="w-full text-sm h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100"
            >
              <option value="">
                {isSitesLoading ? '-- Loading sites... --' : '-- Choose Assigned Site --'}
              </option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name} ({site.code})
                </option>
              ))}
            </select>
            {sites.length === 0 && !isSitesLoading && (
              <p className="text-[11px] text-amber-700 mt-1 font-medium">
                No sites found. Please create an active construction site first.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Attendance Date (Asia/Kolkata) <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              value={selectedDate}
              max={todayIST}
              onChange={(e) => setSelectedDate(e.target.value)}
              required
              className="w-full text-sm h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Future attendance dates are strictly disallowed. Today: {todayIST}.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsInitModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={initMutation.isPending}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold"
            >
              {initMutation.isPending ? 'Opening...' : 'Open Roster'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
