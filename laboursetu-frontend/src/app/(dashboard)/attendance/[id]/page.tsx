'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDateDisplay } from '@/lib/date';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  CalendarCheck,
  ArrowLeft,
  Save,
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Info,
  DollarSign,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface LocalEntry {
  workerId: string;
  status: 'PRESENT' | 'HALF_DAY' | 'ABSENT';
  hoursWorked?: number | null;
  notes?: string;
}

export default function AttendanceDetailPage() {
  const params = useParams();
  const submissionId = params.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [localEntries, setLocalEntries] = useState<Record<string, LocalEntry>>({});
  const [showIneligible, setShowIneligible] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [selectedCorrectionAttendance, setSelectedCorrectionAttendance] = useState<any>(null);
  const [correctionStatus, setCorrectionStatus] = useState<'PRESENT' | 'HALF_DAY' | 'ABSENT'>('PRESENT');
  const [correctionHours, setCorrectionHours] = useState<string>('8');
  const [correctionReason, setCorrectionReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // 1. Fetch submission details
  const {
    data: subData,
    isLoading: isSubLoading,
    error: subError,
  } = useQuery({
    queryKey: ['attendance-submission', submissionId],
    queryFn: () => api.get<any>(`/attendance/submissions/${submissionId}`),
  });

  const submission = subData?.data;

  // 2. Fetch site roster for eligibility & completeness
  const { data: rosterData, isLoading: isRosterLoading } = useQuery({
    queryKey: ['attendance-roster', submission?.siteId, submission?.attendanceDate],
    queryFn: () =>
      api.get<any>(`/attendance/roster/${submission.siteId}?date=${submission.attendanceDate}`),
    enabled: !!submission?.siteId && !!submission?.attendanceDate,
  });

  const rosterWorkers = rosterData?.data?.workers || [];
  const eligibleWorkers = rosterWorkers.filter((w: any) => w.isEligible);
  const ineligibleWorkers = rosterWorkers.filter((w: any) => !w.isEligible);

  // Sync existing entries into local state
  useEffect(() => {
    if (submission?.attendances) {
      const stateMap: Record<string, LocalEntry> = {};
      submission.attendances.forEach((att: any) => {
        stateMap[att.workerId] = {
          workerId: att.workerId,
          status: att.status,
          hoursWorked: att.hoursWorked,
          notes: att.notes || '',
        };
      });
      setLocalEntries(stateMap);
    }
  }, [submission]);

  // Mutations
  const saveDraftMutation = useMutation({
    mutationFn: (entries: LocalEntry[]) =>
      api.put(`/attendance/submissions/${submissionId}/draft`, { entries }),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['attendance-submission', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['attendance-submissions'] });
    },
    onError: (err: any) => setActionError(err.message || 'Failed to save draft'),
  });

  const submitMutation = useMutation({
    mutationFn: () => api.post(`/attendance/submissions/${submissionId}/submit`),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['attendance-submission', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['attendance-submissions'] });
    },
    onError: (err: any) => setActionError(err.message || 'Failed to submit for approval'),
  });

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/attendance/submissions/${submissionId}/approve`),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['attendance-submission', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['attendance-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['wage-register'] });
    },
    onError: (err: any) => setActionError(err.message || 'Failed to approve attendance'),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) =>
      api.post(`/attendance/submissions/${submissionId}/reject`, { reason }),
    onSuccess: () => {
      setActionError(null);
      setRejectModalOpen(false);
      setRejectionReason('');
      queryClient.invalidateQueries({ queryKey: ['attendance-submission', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['attendance-submissions'] });
    },
    onError: (err: any) => setActionError(err.message || 'Failed to reject attendance'),
  });

  const correctionMutation = useMutation({
    mutationFn: (payload: any) =>
      api.post(`/attendance/records/${selectedCorrectionAttendance?.id}/corrections`, payload),
    onSuccess: () => {
      setCorrectionModalOpen(false);
      setCorrectionReason('');
      setSelectedCorrectionAttendance(null);
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['attendance-submission', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['attendance-corrections'] });
    },
    onError: (err: any) => setActionError(err.message || 'Failed to request correction'),
  });

  const isEditable = submission?.status === 'DRAFT' || submission?.status === 'REJECTED';
  const isSubmitted = submission?.status === 'SUBMITTED';
  const isApproved = submission?.status === 'APPROVED';

  const isSelfSubmission = submission?.submittedByUser?.id === user?.id;
  const canApprove =
    isSubmitted && (user?.role === 'OWNER' || user?.role === 'ACCOUNTANT') && !isSelfSubmission;

  // Handlers
  const handleStatusChange = (
    workerId: string,
    status: 'PRESENT' | 'HALF_DAY' | 'ABSENT',
    wageType: string
  ) => {
    if (!isEditable) return;
    setLocalEntries((prev) => {
      const existing = prev[workerId];
      let hoursWorked = null;
      if (wageType === 'HOURLY') {
        hoursWorked = status === 'PRESENT' ? (existing?.hoursWorked || 8.0) : null;
      }
      return {
        ...prev,
        [workerId]: {
          workerId,
          status,
          hoursWorked,
          notes: existing?.notes || '',
        },
      };
    });
  };

  const handleHoursChange = (workerId: string, hours: number) => {
    if (!isEditable) return;
    setLocalEntries((prev) => ({
      ...prev,
      [workerId]: {
        ...(prev[workerId] || { workerId, status: 'PRESENT' }),
        hoursWorked: hours,
      },
    }));
  };

  const handleNotesChange = (workerId: string, notes: string) => {
    if (!isEditable) return;
    setLocalEntries((prev) => ({
      ...prev,
      [workerId]: {
        ...(prev[workerId] || { workerId, status: 'PRESENT' }),
        notes,
      },
    }));
  };

  const handleMarkAllAbsent = () => {
    if (!isEditable) return;
    setLocalEntries((prev) => {
      const updated = { ...prev };
      eligibleWorkers.forEach((w: any) => {
        if (!updated[w.id]) {
          updated[w.id] = { workerId: w.id, status: 'ABSENT', notes: 'Marked absent via bulk helper' };
        }
      });
      return updated;
    });
  };

  const handleSaveDraft = () => {
    const entriesArray = Object.values(localEntries);
    if (entriesArray.length === 0) {
      setActionError('Please record attendance for at least one worker before saving.');
      return;
    }
    saveDraftMutation.mutate(entriesArray);
  };

  const handleSubmit = () => {
    const entriesArray = Object.values(localEntries);
    // Check completeness
    const enteredCount = eligibleWorkers.filter((w: any) => !!localEntries[w.id]).length;
    if (enteredCount < eligibleWorkers.length) {
      setActionError(
        `All eligible workers on the site roster (${eligibleWorkers.length}) must have explicit attendance marked before submission. (Currently marked: ${enteredCount})`
      );
      return;
    }

    // First save draft entries to ensure backend has latest edits, then submit
    saveDraftMutation.mutate(entriesArray, {
      onSuccess: () => submitMutation.mutate(),
    });
  };

  // Helper to resolve applicable wage rate for a worker
  const getWorkerWageRate = (worker: any) => {
    if (worker.applicableWageRate) return worker.applicableWageRate;
    if (worker.currentWage) return worker.currentWage;
    const att = submission?.attendances?.find((a: any) => a.workerId === worker.id);
    if (att?.wageRate) return att.wageRate;
    return null;
  };

  // Preview wage calculation for an eligible worker
  const calculateWorkerWagePreview = (worker: any, entry?: LocalEntry) => {
    const wageRate = getWorkerWageRate(worker);
    if (!entry || entry.status === 'ABSENT' || !wageRate) {
      return { units: 0, amount: 0 };
    }

    const rate = wageRate.rate;
    if (wageRate.wageType === 'DAILY') {
      if (entry.status === 'PRESENT') return { units: 1.0, amount: rate };
      if (entry.status === 'HALF_DAY') return { units: 0.5, amount: Math.round(rate * 0.5 * 100) / 100 };
    } else if (wageRate.wageType === 'HOURLY') {
      const hours = entry.hoursWorked || 0;
      return { units: hours, amount: Math.round(rate * hours * 100) / 100 };
    }

    return { units: 0, amount: 0 };
  };

  // Total summary of current entered roster
  const enteredWorkersCount = eligibleWorkers.filter((w: any) => !!localEntries[w.id]).length;
  const isRosterComplete = eligibleWorkers.length > 0 && enteredWorkersCount === eligibleWorkers.length;

  let totalRosterEarnedPreview = 0;
  eligibleWorkers.forEach((w: any) => {
    const preview = calculateWorkerWagePreview(w, localEntries[w.id]);
    totalRosterEarnedPreview += preview.amount;
  });

  if (isSubLoading || isRosterLoading) {
    return (
      <div className="p-16 text-center text-slate-500">
        <Clock className="w-8 h-8 animate-spin mx-auto text-amber-500 mb-3" />
        <p className="text-sm font-medium">Loading site roster & attendance...</p>
      </div>
    );
  }

  if (subError || !submission) {
    return (
      <div className="p-16 text-center text-rose-500">
        <AlertCircle className="w-8 h-8 mx-auto mb-3" />
        <p className="text-sm font-medium">Failed to load attendance submission</p>
        <Button onClick={() => router.push('/attendance')} className="mt-4" variant="outline">
          Back to Attendance List
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Navigation & Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/attendance')}
            className="gap-1 border-slate-300 text-slate-700"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {submission.site?.name}
              </h1>
              <Badge variant="outline" className="font-mono text-xs font-semibold">
                {submission.site?.code}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Attendance Date: <span className="font-semibold text-slate-800">{formatDateDisplay(submission.attendanceDate)}</span> ({submission.attendanceDate})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {submission.status === 'DRAFT' && (
            <Badge variant="outline" className="border-amber-400 text-amber-600 bg-amber-50 gap-1.5 py-1 px-3 text-xs font-semibold">
              <Clock className="w-4 h-4" /> Editable Draft
            </Badge>
          )}
          {submission.status === 'SUBMITTED' && (
            <Badge variant="outline" className="border-blue-400 text-blue-600 bg-blue-50 gap-1.5 py-1 px-3 text-xs font-semibold">
              <AlertCircle className="w-4 h-4" /> Submitted (Awaiting Approval)
            </Badge>
          )}
          {submission.status === 'APPROVED' && (
            <Badge variant="outline" className="border-emerald-400 text-emerald-600 bg-emerald-50 gap-1.5 py-1 px-3 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4" /> Approved & Wages Frozen
            </Badge>
          )}
          {submission.status === 'REJECTED' && (
            <Badge variant="outline" className="border-rose-400 text-rose-600 bg-rose-50 gap-1.5 py-1 px-3 text-xs font-semibold">
              <XCircle className="w-4 h-4" /> Rejected
            </Badge>
          )}
        </div>
      </div>

      {/* Workflow Action Notices */}
      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />
          <span>{actionError}</span>
        </div>
      )}

      {submission.status === 'REJECTED' && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3">
          <XCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Submission was rejected by {submission.rejectedByUser?.name || 'Authorized Approver'}:</span>
            <p className="mt-0.5 text-rose-700 italic">&quot;{submission.rejectionReason}&quot;</p>
            <p className="mt-1 text-xs text-rose-600">You may update attendance entries below and click Save Draft to return this to active draft workflow.</p>
          </div>
        </div>
      )}

      {submission.status === 'SUBMITTED' && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-sm flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Attendance frozen awaiting approval.</span>
            <p className="text-xs text-blue-700 mt-0.5">
              Submitted by <span className="font-semibold">{submission.submittedByUser?.name}</span> ({submission.submittedByUser?.role}) on {formatDateDisplay(submission.submittedAt)}.
            </p>
            {isSelfSubmission && (
              <p className="mt-2 text-xs font-semibold text-amber-800 bg-amber-100/70 p-2 rounded border border-amber-200">
                Self-Approval Policy: You submitted this roster. A different Organization Owner or Accountant must approve it.
              </p>
            )}
          </div>

          {canApprove && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRejectModalOpen(true)}
                className="border-rose-300 text-rose-700 hover:bg-rose-50 gap-1.5"
              >
                <XCircle className="w-4 h-4" /> Reject
              </Button>
              <Button
                size="sm"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-semibold"
              >
                <CheckCircle2 className="w-4 h-4" />
                {approveMutation.isPending ? 'Approving...' : 'Approve & Create Wage Entries'}
              </Button>
            </div>
          )}
        </div>
      )}

      {submission.status === 'APPROVED' && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div>
              <span className="font-semibold">Approved by {submission.approvedByUser?.name} on {formatDateDisplay(submission.approvedAt)}</span>
              <p className="text-xs text-emerald-700 mt-0.5">
                Exact gross earned wages snapshot created in the Wage Register. Direct edits are disabled.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push('/wages')}
            className="border-emerald-300 text-emerald-800 hover:bg-emerald-100"
          >
            View Wage Register
          </Button>
        </div>
      )}

      {/* Roster Completeness & KPI Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-white border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">Eligible Workers</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{eligibleWorkers.length}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">Active site assignments on this date</p>
        </Card>

        <Card className="p-4 bg-white border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">Roster Completeness</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-slate-900">
              {enteredWorkersCount} <span className="text-sm font-normal text-slate-400">/ {eligibleWorkers.length}</span>
            </span>
            {isRosterComplete ? (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">100% Complete</Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">Incomplete</Badge>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">All eligible workers must be marked</p>
        </Card>

        <Card className="p-4 bg-white border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">Estimated Earned Wages</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            ₹{totalRosterEarnedPreview.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Calculated using effective wage rates</p>
        </Card>

        <Card className="p-4 bg-white border-slate-200 flex flex-col justify-center">
          {isEditable ? (
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                onClick={handleSaveDraft}
                disabled={saveDraftMutation.isPending}
                variant="outline"
                className="w-full gap-1.5 text-xs font-semibold border-slate-300"
              >
                <Save className="w-3.5 h-3.5" />
                {saveDraftMutation.isPending ? 'Saving...' : 'Save Draft'}
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!isRosterComplete || submitMutation.isPending}
                className="w-full gap-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950"
              >
                <Send className="w-3.5 h-3.5" />
                {submitMutation.isPending ? 'Submitting...' : 'Submit for Approval'}
              </Button>
            </div>
          ) : (
            <div className="text-center text-xs text-slate-500">
              Workflow Status: <span className="font-semibold text-slate-800">{submission.status}</span>
            </div>
          )}
        </Card>
      </div>

      {/* Eligible Workers Attendance Roster Table */}
      <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Site Attendance Roster</h2>
            <p className="text-xs text-slate-500">
              Enter attendance for all active workers. DAILY workers accept PRESENT, HALF_DAY, or ABSENT. HOURLY workers require hours worked.
            </p>
          </div>

          {isEditable && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllAbsent}
              className="text-xs border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Mark Remaining as Absent
            </Button>
          )}
        </div>

        {eligibleWorkers.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium">No workers have active assignments to this site on {submission.attendanceDate}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">Worker Details</th>
                  <th className="px-6 py-3.5 font-semibold">Wage Rate</th>
                  <th className="px-6 py-3.5 font-semibold">Attendance Status</th>
                  <th className="px-6 py-3.5 font-semibold">Hours / Units</th>
                  <th className="px-6 py-3.5 font-semibold">Earned Wage</th>
                  <th className="px-6 py-3.5 font-semibold">Notes</th>
                  {isApproved && <th className="px-6 py-3.5 font-semibold text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {eligibleWorkers.map((worker: any) => {
                  const entry = localEntries[worker.id];
                  const wageRate = getWorkerWageRate(worker);
                  const wageType = wageRate?.wageType || 'DAILY';
                  const rate = wageRate?.rate || 0;
                  const preview = calculateWorkerWagePreview(worker, entry);

                  // Find persisted attendance record if approved
                  const persistedAttendance = submission.attendances?.find(
                    (a: any) => a.workerId === worker.id
                  );

                  return (
                    <tr
                      key={worker.id}
                      className={`hover:bg-slate-50/60 transition-colors ${
                        !entry ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      {/* Worker info */}
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{worker.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-mono text-slate-500">{worker.code}</span>
                          <span className="text-xs text-slate-400">•</span>
                          <span className="text-xs text-slate-600">{worker.trade}</span>
                        </div>
                      </td>

                      {/* Wage Rate Info */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {wageRate ? (
                          <div>
                            <div className="text-xs font-bold text-slate-900">
                              ₹{rate.toFixed(2)}{' '}
                              <span className="text-[10px] font-normal text-slate-500">
                                /{wageType.toLowerCase()}
                              </span>
                            </div>
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 mt-0.5">
                              {wageType}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-200">
                            Missing Rate
                          </span>
                        )}
                      </td>

                      {/* Attendance Toggle Buttons */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditable ? (
                          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100/80">
                            <button
                              type="button"
                              onClick={() => handleStatusChange(worker.id, 'PRESENT', wageType)}
                              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                                entry?.status === 'PRESENT'
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Present
                            </button>

                            {wageType === 'DAILY' && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(worker.id, 'HALF_DAY', wageType)}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                                  entry?.status === 'HALF_DAY'
                                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                Half-Day
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleStatusChange(worker.id, 'ABSENT', wageType)}
                              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                                entry?.status === 'ABSENT'
                                  ? 'bg-rose-600 text-white shadow-sm'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Absent
                            </button>
                          </div>
                        ) : (
                          <div>
                            {entry?.status === 'PRESENT' && (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Present</Badge>
                            )}
                            {entry?.status === 'HALF_DAY' && (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-300">Half-Day</Badge>
                            )}
                            {entry?.status === 'ABSENT' && (
                              <Badge className="bg-rose-100 text-rose-800 border-rose-300">Absent</Badge>
                            )}
                            {persistedAttendance?.isCorrected && (
                              <span className="ml-1 text-[10px] text-amber-700 bg-amber-50 px-1 py-0.5 rounded border border-amber-200 font-semibold">
                                Corrected
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Hours worked / units */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {wageType === 'HOURLY' && entry?.status === 'PRESENT' ? (
                          isEditable ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="0.25"
                                max="24"
                                step="0.25"
                                value={entry.hoursWorked || 8}
                                onChange={(e) =>
                                  handleHoursChange(worker.id, parseFloat(e.target.value) || 0)
                                }
                                className="w-16 h-8 text-xs font-bold text-center border border-slate-300 rounded focus:ring-1 focus:ring-amber-500"
                              />
                              <span className="text-xs text-slate-500">hrs</span>
                            </div>
                          ) : (
                            <span className="text-xs font-semibold text-slate-800">
                              {entry?.hoursWorked} hrs
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-slate-500">
                            {entry ? `${preview.units} unit` : '-'}
                          </span>
                        )}
                      </td>

                      {/* Earned Wage preview */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-bold text-slate-900 text-sm">
                          ₹{preview.amount.toFixed(2)}
                        </span>
                      </td>

                      {/* Notes */}
                      <td className="px-6 py-4">
                        {isEditable ? (
                          <input
                            type="text"
                            placeholder="Optional site note..."
                            value={entry?.notes || ''}
                            onChange={(e) => handleNotesChange(worker.id, e.target.value)}
                            className="w-full text-xs h-8 px-2 border border-slate-200 rounded focus:ring-1 focus:ring-amber-500 text-slate-700 placeholder:text-slate-400"
                          />
                        ) : (
                          <span className="text-xs text-slate-500 italic">
                            {entry?.notes || '-'}
                          </span>
                        )}
                      </td>

                      {/* Correction action on approved records */}
                      {isApproved && (
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          {persistedAttendance && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedCorrectionAttendance(persistedAttendance);
                                setCorrectionStatus(persistedAttendance.status);
                                setCorrectionHours(String(persistedAttendance.hoursWorked || 8));
                                setCorrectionReason('');
                                setCorrectionModalOpen(true);
                              }}
                              className="text-xs border-amber-300 text-amber-800 hover:bg-amber-50 gap-1"
                            >
                              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                              Request Correction
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Ineligible / Excluded Workers Collapsible */}
      {ineligibleWorkers.length > 0 && (
        <Card className="bg-slate-50 border-slate-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowIneligible(!showIneligible)}
            className="w-full px-6 py-3.5 flex items-center justify-between text-left hover:bg-slate-100/80 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Ineligible / Excluded Workers ({ineligibleWorkers.length})
              </span>
              <span className="text-xs text-slate-500 font-normal">
                - Workers with expired or future site assignments on {submission.attendanceDate}
              </span>
            </div>
            {showIneligible ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </button>

          {showIneligible && (
            <div className="p-4 border-t border-slate-200 bg-white">
              <div className="space-y-2">
                {ineligibleWorkers.map((w: any) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between text-xs p-2.5 rounded bg-slate-50 border border-slate-200"
                  >
                    <div>
                      <span className="font-semibold text-slate-800">{w.name}</span>{' '}
                      <span className="font-mono text-slate-500">({w.code})</span> • {w.trade}
                    </div>
                    <span className="text-rose-600 font-medium">{w.ineligibilityReason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Rejection Modal */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Reject Attendance Submission"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!rejectionReason.trim()) return;
            rejectMutation.mutate(rejectionReason);
          }}
          className="space-y-4"
        >
          <p className="text-xs text-slate-600">
            Rejecting this submission will return its attendance records to an editable draft. You must provide a clear reason for the site supervisor.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Rejection Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Discrepancy on worker Manoj Yadav - reported half-day but security gate register confirms full day."
              className="w-full text-xs rounded-md border border-slate-300 p-2.5 focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={rejectMutation.isPending || !rejectionReason.trim()}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
            >
              {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Attendance Correction Modal */}
      <Modal
        isOpen={correctionModalOpen}
        onClose={() => setCorrectionModalOpen(false)}
        title="Request Attendance Correction"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!correctionReason.trim()) return;
            const isHourly =
              selectedCorrectionAttendance?.hoursWorked !== null &&
              selectedCorrectionAttendance?.hoursWorked !== undefined;

            correctionMutation.mutate({
              newStatus: correctionStatus,
              newHoursWorked:
                correctionStatus === 'PRESENT' && isHourly
                  ? parseFloat(correctionHours)
                  : undefined,
              reason: correctionReason,
            });
          }}
          className="space-y-4"
        >
          <p className="text-xs text-slate-600">
            This attendance record is already approved and locked in the wage register. Submitting a correction request requires review and approval by a different Organization Owner or Accountant before wage entries are superseded.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Corrected Status <span className="text-rose-500">*</span>
            </label>
            <select
              value={correctionStatus}
              onChange={(e) => setCorrectionStatus(e.target.value as any)}
              className="w-full text-xs h-9 rounded-md border border-slate-300 bg-white px-3 text-slate-900 focus:ring-2 focus:ring-amber-500"
            >
              <option value="PRESENT">PRESENT</option>
              <option value="HALF_DAY">HALF_DAY</option>
              <option value="ABSENT">ABSENT</option>
            </select>
          </div>

          {selectedCorrectionAttendance?.hoursWorked !== null &&
            selectedCorrectionAttendance?.hoursWorked !== undefined &&
            correctionStatus === 'PRESENT' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Corrected Hours Worked (max 24.0) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.25"
                  max="24"
                  step="0.25"
                  value={correctionHours}
                  onChange={(e) => setCorrectionHours(e.target.value)}
                  className="w-full text-xs h-9 rounded-md border border-slate-300 px-3 text-slate-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>
            )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason for Correction & Audit Note <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="e.g. Worker mistakenly marked half-day due to gate log sync delay. Site engineer confirmed full day work."
              className="w-full text-xs rounded-md border border-slate-300 p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCorrectionModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={correctionMutation.isPending || !correctionReason.trim()}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold"
            >
              {correctionMutation.isPending ? 'Submitting...' : 'Submit Correction Request'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
