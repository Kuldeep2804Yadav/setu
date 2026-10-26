'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDateDisplay } from '@/lib/date';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  ShieldAlert,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  ChevronRight,
  UserCheck,
  FileText,
} from 'lucide-react';

export default function AttendanceCorrectionsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [selectedCorrection, setSelectedCorrection] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);

  const { data: correctionsData, isLoading, error } = useQuery({
    queryKey: ['attendance-corrections', statusFilter],
    queryFn: () => {
      const params: Record<string, any> = {};
      if (statusFilter && statusFilter !== 'ALL') params.status = statusFilter;
      return api.get<any[]>('/attendance/corrections', params);
    },
  });

  const corrections = correctionsData?.data || [];

  const reviewMutation = useMutation({
    mutationFn: ({
      correctionId,
      action,
      notes,
    }: {
      correctionId: string;
      action: 'APPROVE' | 'REJECT';
      notes?: string;
    }) =>
      api.post(`/attendance/corrections/${correctionId}/review`, {
        action,
        reviewNotes: notes,
      }),
    onSuccess: () => {
      setSelectedCorrection(null);
      setReviewNotes('');
      setReviewError(null);
      queryClient.invalidateQueries({ queryKey: ['attendance-corrections'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['wage-register'] });
    },
    onError: (err: any) => {
      setReviewError(err.message || 'Failed to process correction review');
    },
  });

  const canReview = user?.role === 'OWNER' || user?.role === 'ACCOUNTANT';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/attendance')}
            className="gap-1 border-slate-300 text-slate-700"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Attendance
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <ShieldAlert className="w-6 h-6 text-amber-500" />
              Attendance Corrections Queue
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Review post-approval correction requests. Approved corrections supersede prior wage records without double counting.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <Card className="p-3 bg-white border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
          {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st === 'ALL' ? 'All Requests' : st.charAt(0) + st.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-500">
          Enforcement: <span className="font-semibold text-slate-700">Different-User Approval</span> required
        </div>
      </Card>

      {/* Corrections Table */}
      <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">
            <Clock className="w-8 h-8 animate-spin mx-auto text-amber-500 mb-3" />
            <p className="text-sm font-medium">Loading correction requests...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-rose-500">
            <AlertCircle className="w-8 h-8 mx-auto mb-3" />
            <p className="text-sm font-medium">Failed to load corrections</p>
          </div>
        ) : corrections.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800">No correction requests found</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
              Any post-approval attendance modifications submitted by site supervisors will appear here for audit review.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">Worker & Site</th>
                  <th className="px-6 py-3.5 font-semibold">Attendance Date</th>
                  <th className="px-6 py-3.5 font-semibold">Status Change</th>
                  <th className="px-6 py-3.5 font-semibold">Wage Impact</th>
                  <th className="px-6 py-3.5 font-semibold">Reason & Requested By</th>
                  <th className="px-6 py-3.5 font-semibold">Review Status</th>
                  <th className="px-6 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {corrections.map((corr: any) => {
                  const isRequester = corr.requestedBy?.id === user?.id;
                  const wageDiff = corr.newWageAmount - corr.previousWageAmount;

                  return (
                    <tr key={corr.id} className="hover:bg-amber-50/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{corr.worker?.name}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {corr.worker?.code} • {corr.site?.name} ({corr.site?.code})
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-slate-900">
                          {formatDateDisplay(corr.attendanceDate)}
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">{corr.attendanceDate}</span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="line-through text-slate-400">{corr.previousStatus}</span>
                          <span className="text-slate-400">→</span>
                          <span className="font-bold text-slate-900">{corr.newStatus}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-xs font-semibold text-slate-900">
                          ₹{corr.newWageAmount.toFixed(2)}
                        </div>
                        <div
                          className={`text-[11px] font-mono ${
                            wageDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {wageDiff >= 0 ? `+₹${wageDiff.toFixed(2)}` : `-₹${Math.abs(wageDiff).toFixed(2)}`}
                        </div>
                      </td>

                      <td className="px-6 py-4 max-w-xs">
                        <p className="text-xs text-slate-700 italic">&quot;{corr.reason}&quot;</p>
                        <div className="text-[11px] text-slate-400 mt-1">
                          By <span className="font-medium text-slate-600">{corr.requestedBy?.name}</span> on{' '}
                          {formatDateDisplay(corr.requestedAt)}
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        {corr.status === 'PENDING' && (
                          <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50">
                            Pending Review
                          </Badge>
                        )}
                        {corr.status === 'APPROVED' && (
                          <div>
                            <Badge variant="outline" className="border-emerald-400 text-emerald-700 bg-emerald-50">
                              Approved
                            </Badge>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              by {corr.reviewedBy?.name}
                            </div>
                          </div>
                        )}
                        {corr.status === 'REJECTED' && (
                          <div>
                            <Badge variant="outline" className="border-rose-400 text-rose-700 bg-rose-50">
                              Rejected
                            </Badge>
                            {corr.reviewNotes && (
                              <div className="text-[10px] text-rose-600 italic mt-0.5">
                                &quot;{corr.reviewNotes}&quot;
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {corr.status === 'PENDING' && canReview && (
                          isRequester ? (
                            <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200 font-semibold">
                              Requested by you
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => {
                                setReviewError(null);
                                setReviewNotes('');
                                setSelectedCorrection(corr);
                              }}
                              className="text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 gap-1"
                            >
                              <UserCheck className="w-3.5 h-3.5" /> Review
                            </Button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Review Modal */}
      <Modal
        isOpen={!!selectedCorrection}
        onClose={() => setSelectedCorrection(null)}
        title="Review Attendance Correction"
      >
        {selectedCorrection && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Worker:</span>
                <span className="font-semibold text-slate-900">
                  {selectedCorrection.worker?.name} ({selectedCorrection.worker?.code})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Site:</span>
                <span className="font-semibold text-slate-900">{selectedCorrection.site?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date:</span>
                <span className="font-semibold text-slate-900">
                  {formatDateDisplay(selectedCorrection.attendanceDate)}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5">
                <span className="text-slate-500">Correction:</span>
                <span className="font-bold text-slate-900">
                  {selectedCorrection.previousStatus} (₹{selectedCorrection.previousWageAmount.toFixed(2)}) →{' '}
                  {selectedCorrection.newStatus} (₹{selectedCorrection.newWageAmount.toFixed(2)})
                </span>
              </div>
              <div className="pt-1 text-slate-600 italic">
                Reason: &quot;{selectedCorrection.reason}&quot;
              </div>
            </div>

            {reviewError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{reviewError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Audit Review Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="e.g. Cross-checked with gate register. Correction approved."
                className="w-full text-xs rounded-md border border-slate-300 p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <p className="text-[11px] text-slate-500">
              Approving will supersede the previous active wage entry and create a new active wage entry for ₹{selectedCorrection.newWageAmount.toFixed(2)}.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedCorrection(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={reviewMutation.isPending}
                onClick={() =>
                  reviewMutation.mutate({
                    correctionId: selectedCorrection.id,
                    action: 'REJECT',
                    notes: reviewNotes,
                  })
                }
                className="border border-rose-300 text-rose-700 hover:bg-rose-50 bg-white"
              >
                Reject Request
              </Button>
              <Button
                type="button"
                disabled={reviewMutation.isPending}
                onClick={() =>
                  reviewMutation.mutate({
                    correctionId: selectedCorrection.id,
                    action: 'APPROVE',
                    notes: reviewNotes,
                  })
                }
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                {reviewMutation.isPending ? 'Processing...' : 'Approve & Supersede Wage'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
