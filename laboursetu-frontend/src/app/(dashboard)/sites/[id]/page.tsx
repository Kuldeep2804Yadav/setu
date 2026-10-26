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
import {
  Building2,
  MapPin,
  Users,
  ShieldCheck,
  Archive,
  Edit2,
  ArrowLeft,
  AlertCircle,
  Plus,
} from 'lucide-react';

interface SiteDetails {
  id: string;
  code: string;
  name: string;
  location: string | null;
  clientName: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  archivedAt: string | null;
  createdAt: string;
  supervisors: Array<{ id: string; name: string; email: string; phone: string | null; role: string }>;
  assignedWorkers: Array<{
    assignmentId: string;
    startDate: string;
    worker: {
      id: string;
      code: string;
      name: string;
      trade: string;
      mobileNumber: string | null;
      verificationStatus: string;
      status: string;
    };
  }>;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function SiteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const siteId = params.id as string;

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSupervisorModalOpen, setIsSupervisorModalOpen] = useState(false);
  const [editData, setEditData] = useState({ name: '', code: '', location: '', clientName: '' });
  const [selectedSupervisors, setSelectedSupervisors] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch Site Details
  const { data: site, isLoading } = useQuery({
    queryKey: ['site-details', siteId],
    queryFn: async () => {
      const res = await api.get<SiteDetails>(`/sites/${siteId}`);
      return res.data;
    },
  });

  // Fetch Team Members for supervisor assignment
  const { data: teamMembers } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const res = await api.get<TeamMember[]>('/organization/team');
      return res.data;
    },
  });

  // Archive Mutation
  const archiveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/sites/${siteId}/archive`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-details', siteId] });
      queryClient.invalidateQueries({ queryKey: ['sites'] });
    },
  });

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: async (input: typeof editData) => {
      const res = await api.put(`/sites/${siteId}`, input);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-details', siteId] });
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      setIsEditOpen(false);
      setErrorMessage(null);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to update site.');
    },
  });

  // Supervisor assignment mutation
  const supervisorMutation = useMutation({
    mutationFn: async (supervisorIds: string[]) => {
      const res = await api.post(`/sites/${siteId}/supervisors`, { supervisorIds });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-details', siteId] });
      setIsSupervisorModalOpen(false);
    },
  });

  const handleOpenEdit = () => {
    if (site) {
      setEditData({
        name: site.name,
        code: site.code,
        location: site.location || '',
        clientName: site.clientName || '',
      });
      setIsEditOpen(true);
    }
  };

  const handleOpenSupervisors = () => {
    if (site) {
      setSelectedSupervisors(site.supervisors.map((s) => s.id));
      setIsSupervisorModalOpen(true);
    }
  };

  const toggleSupervisor = (userId: string) => {
    if (selectedSupervisors.includes(userId)) {
      setSelectedSupervisors(selectedSupervisors.filter((id) => id !== userId));
    } else {
      setSelectedSupervisors([...selectedSupervisors, userId]);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        Loading site details...
      </div>
    );
  }

  if (!site) {
    return (
      <div className="p-8 text-center text-slate-500">
        Site not found or removed.
      </div>
    );
  }

  return (
    <div className="pb-12">
      <Header
        title={site.name}
        description={`Site Code: ${site.code} • Created ${new Date(site.createdAt).toLocaleDateString()}`}
        action={
          <div className="flex items-center gap-2">
            <Link href="/sites">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back to Sites
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleOpenEdit}>
              <Edit2 className="w-3.5 h-3.5 mr-1.5" />
              Edit
            </Button>
            {site.status === 'ACTIVE' && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (confirm('Are you sure you want to archive this site?')) {
                    archiveMutation.mutate();
                  }
                }}
                isLoading={archiveMutation.isPending}
              >
                <Archive className="w-3.5 h-3.5 mr-1.5" />
                Archive Site
              </Button>
            )}
          </div>
        }
      />

      <div className="p-8 max-w-7xl mx-auto space-y-8">
        {/* Site Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card title="Project Summary">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <Badge variant={site.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {site.status}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Site Code</span>
                <span className="font-mono font-bold text-slate-900">{site.code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Client / Authority</span>
                <span className="font-medium text-slate-900">
                  {site.clientName || 'Not specified'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Location</span>
                <span className="font-medium text-slate-900 text-right truncate max-w-[180px]">
                  {site.location || 'Not specified'}
                </span>
              </div>
            </div>
          </Card>

          {/* Supervisors Assigned */}
          <Card
            title={`Supervisors (${site.supervisors.length})`}
            action={
              <Button variant="outline" size="sm" onClick={handleOpenSupervisors}>
                Manage
              </Button>
            }
          >
            {site.supervisors.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">
                No supervisors assigned yet.
              </p>
            ) : (
              <div className="space-y-2">
                {site.supervisors.map((sup) => (
                  <div
                    key={sup.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100"
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-900">{sup.name}</p>
                      <p className="text-[11px] text-slate-500">{sup.email}</p>
                    </div>
                    <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-bold border border-purple-200">
                      SUPERVISOR
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Deployed Workforce Count */}
          <Card title="Deployed Workforce">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-3xl font-bold text-amber-600">
                  {site.assignedWorkers.length}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Active workers currently assigned
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
            </div>
          </Card>
        </div>

        {/* Assigned Workers List */}
        <Card
          title={`Assigned Workers on Site (${site.assignedWorkers.length})`}
          subtitle="Workers currently deployed to this construction site"
        >
          {site.assignedWorkers.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">
              No workers are currently assigned to this site.{' '}
              <Link href="/workers" className="text-amber-600 underline">
                Assign workers from directory
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="pb-3">Worker Code</th>
                    <th className="pb-3">Name</th>
                    <th className="pb-3">Trade</th>
                    <th className="pb-3">Mobile</th>
                    <th className="pb-3">Assigned Since</th>
                    <th className="pb-3">Verification</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {site.assignedWorkers.map(({ worker, startDate }) => (
                    <tr key={worker.id} className="hover:bg-slate-50/60">
                      <td className="py-3 font-mono text-xs font-bold text-slate-700">
                        {worker.code}
                      </td>
                      <td className="py-3 font-medium text-slate-900">
                        <Link
                          href={`/workers/${worker.id}`}
                          className="hover:text-amber-600"
                        >
                          {worker.name}
                        </Link>
                      </td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 font-medium">
                          {worker.trade}
                        </span>
                      </td>
                      <td className="py-3 text-xs text-slate-600">
                        {worker.mobileNumber || '-'}
                      </td>
                      <td className="py-3 text-xs text-slate-500">
                        {new Date(startDate).toLocaleDateString()}
                      </td>
                      <td className="py-3">
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
                      <td className="py-3 text-right">
                        <Link href={`/workers/${worker.id}`}>
                          <Button variant="ghost" size="sm">
                            View Profile
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

      {/* Edit Site Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Construction Site"
      >
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {errorMessage}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate(editData);
          }}
          className="space-y-4"
        >
          <Input
            label="Site Name"
            required
            value={editData.name}
            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
          />
          <Input
            label="Site Code"
            required
            value={editData.code}
            onChange={(e) =>
              setEditData({ ...editData, code: e.target.value.toUpperCase() })
            }
          />
          <Input
            label="Location / Address"
            value={editData.location}
            onChange={(e) =>
              setEditData({ ...editData, location: e.target.value })
            }
          />
          <Input
            label="Client Name"
            value={editData.clientName}
            onChange={(e) =>
              setEditData({ ...editData, clientName: e.target.value })
            }
          />
          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={updateMutation.isPending}
            >
              Update Site
            </Button>
          </div>
        </form>
      </Modal>

      {/* Manage Supervisors Modal */}
      <Modal
        isOpen={isSupervisorModalOpen}
        onClose={() => setIsSupervisorModalOpen(false)}
        title="Assign Site Supervisors"
        description="Select supervisors responsible for overseeing this project site"
      >
        <div className="space-y-3 py-2">
          {!teamMembers || teamMembers.length === 0 ? (
            <p className="text-xs text-slate-400">
              No team members available. Invite supervisors in Team settings first.
            </p>
          ) : (
            teamMembers
              .filter((m) => m.role === 'SUPERVISOR')
              .map((member) => (
                <label
                  key={member.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedSupervisors.includes(member.id)}
                    onChange={() => toggleSupervisor(member.id)}
                    className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      {member.name}
                    </p>
                    <p className="text-[11px] text-slate-500">{member.email}</p>
                  </div>
                </label>
              ))
          )}
        </div>

        <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsSupervisorModalOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => supervisorMutation.mutate(selectedSupervisors)}
            isLoading={supervisorMutation.isPending}
          >
            Save Supervisor Allocations
          </Button>
        </div>
      </Modal>
    </div>
  );
}
