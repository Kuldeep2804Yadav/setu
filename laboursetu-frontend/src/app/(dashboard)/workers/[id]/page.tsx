'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Header } from '@/components/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { TRADES } from '@/contracts';
import {
  Users,
  Building2,
  IndianRupee,
  Calendar,
  Clock,
  History,
  Plus,
  Edit2,
  Archive,
  ArrowLeft,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

interface WorkerDetails {
  id: string;
  code: string;
  name: string;
  trade: string;
  mobileNumber: string | null;
  verificationStatus: string;
  aadhaarLastFour: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  activeSite: {
    id: string;
    name: string;
    code: string;
    location: string | null;
    assignedSince: string;
  } | null;
  currentWage: {
    id: string;
    wageType: string;
    rate: number;
    effectiveFrom: string;
    notes?: string;
  } | null;
  wageRateHistory: Array<{
    id: string;
    wageType: string;
    rate: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    notes: string | null;
    createdAt: string;
    createdBy: string | null;
  }>;
  siteAssignmentHistory: Array<{
    id: string;
    siteId: string;
    siteName: string;
    siteCode: string;
    startDate: string;
    endDate: string | null;
    status: string;
    notes: string | null;
  }>;
}

interface SiteOption {
  id: string;
  name: string;
  code: string;
}

export default function WorkerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const workerId = params.id as string;

  // Modals state
  const [isWageModalOpen, setIsWageModalOpen] = useState(false);
  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Wage Form
  const [wageForm, setWageForm] = useState({
    wageType: 'DAILY' as 'DAILY' | 'HOURLY',
    rate: '',
    effectiveFrom: new Date().toISOString().substring(0, 10),
    notes: '',
  });

  // Site Assign Form
  const [siteForm, setSiteForm] = useState({
    siteId: '',
    startDate: new Date().toISOString().substring(0, 10),
    notes: '',
  });

  // Edit Profile Form
  const [editForm, setEditForm] = useState({
    name: '',
    trade: '',
    mobileNumber: '',
    verificationStatus: 'UNVERIFIED',
    aadhaarLastFour: '',
    notes: '',
  });

  // Fetch Worker Details
  const { data: worker, isLoading } = useQuery({
    queryKey: ['worker-details', workerId],
    queryFn: async () => {
      const res = await api.get<WorkerDetails>(`/workers/${workerId}`);
      return res.data;
    },
  });

  // Fetch Worker Attendance & Wage History
  const { data: attendanceHistoryData } = useQuery({
    queryKey: ['worker-attendance-history', workerId],
    queryFn: async () => {
      const res = await api.get<any>(`/wages/register?workerId=${workerId}&limit=50`);
      return res.data;
    },
  });

  // Fetch Sites for assignment
  const { data: sites } = useQuery({
    queryKey: ['sites-options'],
    queryFn: async () => {
      const res = await api.get<SiteOption[]>('/sites', { status: 'ACTIVE' });
      return res.data;
    },
  });

  // Add Wage Rate Mutation
  const wageMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/workers/${workerId}/wage-rates`, {
        wageType: wageForm.wageType,
        rate: parseFloat(wageForm.rate),
        effectiveFrom: wageForm.effectiveFrom,
        notes: wageForm.notes || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-details', workerId] });
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      setIsWageModalOpen(false);
      setWageForm({
        wageType: 'DAILY',
        rate: '',
        effectiveFrom: new Date().toISOString().substring(0, 10),
        notes: '',
      });
      setErrorMessage(null);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to add wage rate record.');
    },
  });

  // Assign Site Mutation
  const siteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/workers/${workerId}/assign-site`, {
        siteId: siteForm.siteId,
        startDate: siteForm.startDate,
        notes: siteForm.notes || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-details', workerId] });
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      setIsSiteModalOpen(false);
      setErrorMessage(null);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to assign site.');
    },
  });

  // Edit Profile Mutation
  const editMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put(`/workers/${workerId}`, {
        name: editForm.name,
        trade: editForm.trade,
        mobileNumber: editForm.mobileNumber || undefined,
        verificationStatus: editForm.verificationStatus,
        aadhaarLastFour: editForm.aadhaarLastFour || undefined,
        notes: editForm.notes || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-details', workerId] });
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      setIsEditModalOpen(false);
      setErrorMessage(null);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to update profile.');
    },
  });

  // Archive Mutation
  const archiveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/workers/${workerId}/archive`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-details', workerId] });
      queryClient.invalidateQueries({ queryKey: ['workers'] });
    },
  });

  const handleOpenEdit = () => {
    if (worker) {
      setEditForm({
        name: worker.name,
        trade: worker.trade,
        mobileNumber: worker.mobileNumber || '',
        verificationStatus: worker.verificationStatus,
        aadhaarLastFour: worker.aadhaarLastFour || '',
        notes: worker.notes || '',
      });
      setIsEditModalOpen(true);
      setErrorMessage(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        Loading worker profile...
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="p-8 text-center text-slate-500">
        Worker profile not found.
      </div>
    );
  }

  return (
    <div className="pb-12">
      <Header
        title={worker.name}
        description={`Worker Code: ${worker.code} • ${worker.trade} • Registered ${new Date(worker.createdAt).toLocaleDateString()}`}
        action={
          <div className="flex items-center gap-2">
            <Link href="/workers">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back to Workers
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleOpenEdit}>
              <Edit2 className="w-3.5 h-3.5 mr-1.5" />
              Edit Profile
            </Button>
            {worker.status === 'ACTIVE' && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (
                    confirm(
                      'Are you sure you want to archive this worker? Historical wage records will be preserved.'
                    )
                  ) {
                    archiveMutation.mutate();
                  }
                }}
                isLoading={archiveMutation.isPending}
              >
                <Archive className="w-3.5 h-3.5 mr-1.5" />
                Archive Worker
              </Button>
            )}
          </div>
        }
      />

      <div className="p-8 max-w-7xl mx-auto space-y-8">
        {/* Profile Highlights Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Worker Identity Card */}
          <Card title="Worker Identity & Verification">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Verification</span>
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
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Trade / Skill</span>
                <span className="font-semibold text-slate-900">{worker.trade}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Mobile Phone</span>
                <span className="font-mono text-slate-900">
                  {worker.mobileNumber || (
                    <span className="text-slate-400 italic font-sans">
                      None registered
                    </span>
                  )}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Aadhaar (Last 4)</span>
                <span className="font-mono text-slate-900">
                  {worker.aadhaarLastFour
                    ? `•••• •••• ${worker.aadhaarLastFour}`
                    : 'Not provided'}
                </span>
              </div>
            </div>
          </Card>

          {/* Current Active Wage Rate Card */}
          <Card
            title="Current Wage Rate"
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setIsWageModalOpen(true);
                  setErrorMessage(null);
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Revise Rate
              </Button>
            }
          >
            {worker.currentWage ? (
              <div className="py-1">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-slate-900">
                    ₹{worker.currentWage.rate}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    / {worker.currentWage.wageType === 'DAILY' ? 'day' : 'hour'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Effective from{' '}
                    {new Date(
                      worker.currentWage.effectiveFrom
                    ).toLocaleDateString()}
                  </span>
                </p>
                {worker.currentWage.notes && (
                  <p className="text-xs text-slate-600 mt-2 italic bg-slate-50 p-2 rounded border border-slate-100">
                    &quot;{worker.currentWage.notes}&quot;
                  </p>
                )}
              </div>
            ) : (
              <div className="py-2 text-center text-xs text-slate-400">
                No wage rate recorded. Click &apos;Revise Rate&apos; to set one.
              </div>
            )}
          </Card>

          {/* Current Site Deployment Card */}
          <Card
            title="Current Site Deployment"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsSiteModalOpen(true);
                  setErrorMessage(null);
                }}
              >
                Deploy / Transfer
              </Button>
            }
          >
            {worker.activeSite ? (
              <div className="py-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-slate-900">
                      {worker.activeSite.name}
                    </h5>
                    <span className="text-[10px] font-mono text-slate-500">
                      {worker.activeSite.code}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-3 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Deployed since{' '}
                    {new Date(
                      worker.activeSite.assignedSince
                    ).toLocaleDateString()}
                  </span>
                </p>
              </div>
            ) : (
              <div className="py-3 text-center text-xs text-slate-400">
                Worker is currently unassigned (Bench / Standby).
              </div>
            )}
          </Card>
        </div>

        {/* SECTION 1: Wage-Rate History */}
        <Card
          title="Wage-Rate History & Revision Timeline"
          subtitle="Audit-compliant record of daily and hourly wage changes with effective start and end dates"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsWageModalOpen(true);
                setErrorMessage(null);
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Wage Revision
            </Button>
          }
        >
          {worker.wageRateHistory.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-4">
              No historical wage records found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="pb-3">Wage Type</th>
                    <th className="pb-3">Rate (INR)</th>
                    <th className="pb-3">Effective From</th>
                    <th className="pb-3">Effective To</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Notes / Revision Reason</th>
                    <th className="pb-3 text-right">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {worker.wageRateHistory.map((rate) => {
                    const isCurrent = rate.effectiveTo === null;
                    return (
                      <tr key={rate.id} className="hover:bg-slate-50/60">
                        <td className="py-3 font-semibold text-xs text-slate-800">
                          {rate.wageType === 'DAILY' ? 'Daily Wage' : 'Hourly Wage'}
                        </td>
                        <td className="py-3 font-bold text-slate-900">
                          ₹{rate.rate.toFixed(2)}
                        </td>
                        <td className="py-3 text-xs text-slate-600">
                          {new Date(rate.effectiveFrom).toLocaleDateString()}
                        </td>
                        <td className="py-3 text-xs text-slate-600">
                          {rate.effectiveTo ? (
                            new Date(rate.effectiveTo).toLocaleDateString()
                          ) : (
                            <span className="font-semibold text-emerald-600">
                              Present (Active)
                            </span>
                          )}
                        </td>
                        <td className="py-3">
                          <Badge variant={isCurrent ? 'success' : 'neutral'}>
                            {isCurrent ? 'Current Rate' : 'Superseded'}
                          </Badge>
                        </td>
                        <td className="py-3 text-xs text-slate-600 italic">
                          {rate.notes || '-'}
                        </td>
                        <td className="py-3 text-right text-xs text-slate-500">
                          {rate.createdBy || 'System'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* SECTION 2: Site Assignment History */}
        <Card
          title="Site Assignment History"
          subtitle="Chronological log of site deployments, transfers, and completed site tenures"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsSiteModalOpen(true);
                setErrorMessage(null);
              }}
            >
              <Building2 className="w-3.5 h-3.5 mr-1" />
              Transfer / Deploy Site
            </Button>
          }
        >
          {worker.siteAssignmentHistory.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-4">
              No historical site assignments recorded.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="pb-3">Site Code</th>
                    <th className="pb-3">Construction Site Name</th>
                    <th className="pb-3">Assignment Date</th>
                    <th className="pb-3">Completion Date</th>
                    <th className="pb-3">Assignment Status</th>
                    <th className="pb-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {worker.siteAssignmentHistory.map((assignment) => (
                    <tr key={assignment.id} className="hover:bg-slate-50/60">
                      <td className="py-3 font-mono text-xs font-bold text-slate-700">
                        {assignment.siteCode}
                      </td>
                      <td className="py-3 font-medium text-slate-900">
                        <Link
                          href={`/sites/${assignment.siteId}`}
                          className="hover:text-amber-600"
                        >
                          {assignment.siteName}
                        </Link>
                      </td>
                      <td className="py-3 text-xs text-slate-600">
                        {new Date(assignment.startDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 text-xs text-slate-600">
                        {assignment.endDate ? (
                          new Date(assignment.endDate).toLocaleDateString()
                        ) : (
                          <span className="font-semibold text-emerald-600">
                            Present (On Site)
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <Badge
                          variant={
                            assignment.status === 'ACTIVE'
                              ? 'success'
                              : 'neutral'
                          }
                        >
                          {assignment.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-xs text-slate-600 italic">
                        {assignment.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* SECTION 3: Approved Attendance & Wage Register History */}
        <Card
          title="Approved Attendance & Earned Wage Records"
          subtitle="Audit-verified daily shifts, recorded payable hours, and snapshotted gross wages"
        >
          {attendanceHistoryData?.entries?.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-4">
              No approved attendance or earned wage entries found for this worker.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Site</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Units / Hours</th>
                    <th className="pb-3">Effective Rate</th>
                    <th className="pb-3">Gross Earned</th>
                    <th className="pb-3 text-right">Approved By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendanceHistoryData?.entries?.map((entry: any) => (
                    <tr key={entry.id} className="hover:bg-slate-50/60">
                      <td className="py-3 font-semibold text-xs text-slate-800">
                        {entry.attendanceDate}
                      </td>
                      <td className="py-3 text-xs text-slate-600">
                        {entry.siteName} <span className="font-mono text-slate-400">({entry.siteCode})</span>
                      </td>
                      <td className="py-3">
                        <Badge
                          variant={
                            entry.attendanceStatus === 'PRESENT'
                              ? 'success'
                              : entry.attendanceStatus === 'HALF_DAY'
                              ? 'warning'
                              : 'danger'
                          }
                        >
                          {entry.attendanceStatus}
                        </Badge>
                      </td>
                      <td className="py-3 text-xs font-medium text-slate-700">
                        {entry.wageType === 'HOURLY'
                          ? `${entry.hoursWorked || entry.payableUnits} hrs`
                          : `${entry.payableUnits} unit`}
                      </td>
                      <td className="py-3 text-xs text-slate-700">
                        ₹{entry.rate} / {entry.wageType.toLowerCase()}
                      </td>
                      <td className="py-3 font-bold text-xs text-slate-900">
                        ₹{entry.grossWage.toFixed(2)}
                      </td>
                      <td className="py-3 text-right text-xs text-slate-500">
                        {entry.approvedByName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Modal: Revise Wage Rate */}
      <Modal
        isOpen={isWageModalOpen}
        onClose={() => setIsWageModalOpen(false)}
        title="Revise Worker Wage Rate"
        description="Records a new wage rate with effective start date while preserving prior rate history"
      >
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {errorMessage}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            wageMutation.mutate();
          }}
          className="space-y-4"
        >
          <Select
            label="Wage Calculation Type"
            value={wageForm.wageType}
            onChange={(e) =>
              setWageForm({
                ...wageForm,
                wageType: e.target.value as 'DAILY' | 'HOURLY',
              })
            }
            options={[
              { value: 'DAILY', label: 'Daily Wage (₹/day)' },
              { value: 'HOURLY', label: 'Hourly Wage (₹/hour)' },
            ]}
          />

          <Input
            label="New Rate (₹ INR)"
            type="number"
            step="0.01"
            min="1"
            required
            value={wageForm.rate}
            onChange={(e) =>
              setWageForm({ ...wageForm, rate: e.target.value })
            }
            placeholder="e.g. 950"
          />

          <Input
            label="Effective From Date"
            type="date"
            required
            value={wageForm.effectiveFrom}
            onChange={(e) =>
              setWageForm({ ...wageForm, effectiveFrom: e.target.value })
            }
          />

          <Input
            label="Revision Notes / Reason"
            value={wageForm.notes}
            onChange={(e) =>
              setWageForm({ ...wageForm, notes: e.target.value })
            }
            placeholder="e.g. Skill upgrade to senior mason"
          />

          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsWageModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={wageMutation.isPending}
            >
              Save Wage Revision
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Deploy to Site */}
      <Modal
        isOpen={isSiteModalOpen}
        onClose={() => setIsSiteModalOpen(false)}
        title="Deploy Worker to Construction Site"
        description="Transfers worker to a new project site and closes prior active assignment"
      >
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {errorMessage}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            siteMutation.mutate();
          }}
          className="space-y-4"
        >
          <Select
            label="Select Active Project Site"
            required
            value={siteForm.siteId}
            onChange={(e) =>
              setSiteForm({ ...siteForm, siteId: e.target.value })
            }
            options={[
              { value: '', label: '-- Choose Site --' },
              ...(sites || []).map((s) => ({
                value: s.id,
                label: `${s.name} (${s.code})`,
              })),
            ]}
          />

          <Input
            label="Deployment Start Date"
            type="date"
            required
            value={siteForm.startDate}
            onChange={(e) =>
              setSiteForm({ ...siteForm, startDate: e.target.value })
            }
          />

          <Input
            label="Transfer Notes"
            value={siteForm.notes}
            onChange={(e) =>
              setSiteForm({ ...siteForm, notes: e.target.value })
            }
            placeholder="e.g. Reassigned for concrete casting"
          />

          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSiteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={siteMutation.isPending}
            >
              Confirm Deployment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Worker Profile */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Worker Profile"
      >
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {errorMessage}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            editMutation.mutate();
          }}
          className="space-y-4"
        >
          <Input
            label="Full Name"
            required
            value={editForm.name}
            onChange={(e) =>
              setEditForm({ ...editForm, name: e.target.value })
            }
          />

          <Select
            label="Trade / Skill Category"
            value={editForm.trade}
            onChange={(e) =>
              setEditForm({ ...editForm, trade: e.target.value })
            }
            options={TRADES.map((t) => ({ value: t, label: t }))}
          />

          <Input
            label="Mobile Number"
            type="tel"
            value={editForm.mobileNumber}
            onChange={(e) =>
              setEditForm({ ...editForm, mobileNumber: e.target.value })
            }
            placeholder="10-digit mobile"
          />

          <Select
            label="Verification Status"
            value={editForm.verificationStatus}
            onChange={(e) =>
              setEditForm({ ...editForm, verificationStatus: e.target.value })
            }
            options={[
              { value: 'UNVERIFIED', label: 'Unverified' },
              { value: 'AADHAAR_SUBMITTED', label: 'Aadhaar Submitted' },
              { value: 'VERIFIED', label: 'Verified' },
            ]}
          />

          <Input
            label="Aadhaar Last 4 Digits"
            maxLength={4}
            value={editForm.aadhaarLastFour}
            onChange={(e) =>
              setEditForm({ ...editForm, aadhaarLastFour: e.target.value })
            }
          />

          <Input
            label="Notes"
            value={editForm.notes}
            onChange={(e) =>
              setEditForm({ ...editForm, notes: e.target.value })
            }
          />

          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={editMutation.isPending}
            >
              Save Profile
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
