'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Header } from '@/components/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  ShieldCheck,
  UserPlus,
  Mail,
  Phone,
  AlertCircle,
  Building,
} from 'lucide-react';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'OWNER' | 'ACCOUNTANT' | 'SUPERVISOR';
  isActive: boolean;
  createdAt: string;
  _count: {
    supervisorSites: number;
  };
}

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'SUPERVISOR' as 'ACCOUNTANT' | 'SUPERVISOR',
  });

  const { data: team, isLoading } = useQuery({
    queryKey: ['team-roster'],
    queryFn: async () => {
      const res = await api.get<TeamMember[]>('/organization/team');
      return res.data;
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/organization/team', {
        name: formData.name,
        email: formData.email,
        phone: formData.phone || undefined,
        password: formData.password,
        role: formData.role,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-roster'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      setIsInviteOpen(false);
      setFormData({
        name: '',
        email: '',
        phone: '',
        password: '',
        role: 'SUPERVISOR',
      });
      setErrorMessage(null);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to add team member.');
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await api.patch(`/organization/team/${id}`, { isActive });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-roster'] });
    },
  });

  const isOwner = user?.role === 'OWNER';

  return (
    <div className="pb-12">
      <Header
        title="Team & Supervisor Management"
        description="Manage organizational roles, site supervisors, and accounting staff"
        action={
          isOwner && (
            <Button variant="primary" onClick={() => setIsInviteOpen(true)}>
              <UserPlus className="w-4 h-4 mr-1.5" />
              Add Team Member
            </Button>
          )
        }
      />

      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <Card>
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              Loading team roster...
            </div>
          ) : !team || team.length === 0 ? (
            <div className="py-16 text-center">
              <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h4 className="text-base font-semibold text-slate-900">
                No team members found
              </h4>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="pb-3.5">Name</th>
                    <th className="pb-3.5">Email</th>
                    <th className="pb-3.5">Phone</th>
                    <th className="pb-3.5">Role</th>
                    <th className="pb-3.5">Assigned Sites</th>
                    <th className="pb-3.5">Status</th>
                    {isOwner && <th className="pb-3.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {team.map((member) => (
                    <tr key={member.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 font-semibold text-slate-900">
                        {member.name}
                      </td>
                      <td className="py-3.5 text-xs text-slate-600 font-mono">
                        {member.email}
                      </td>
                      <td className="py-3.5 text-xs text-slate-600">
                        {member.phone || '-'}
                      </td>
                      <td className="py-3.5">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold border ${
                            member.role === 'OWNER'
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : member.role === 'ACCOUNTANT'
                              ? 'bg-blue-50 text-blue-800 border-blue-300'
                              : 'bg-purple-50 text-purple-800 border-purple-300'
                          }`}
                        >
                          {member.role}
                        </span>
                      </td>
                      <td className="py-3.5 text-xs text-slate-700">
                        {member.role === 'SUPERVISOR' ? (
                          <span>{member._count.supervisorSites} Sites</span>
                        ) : (
                          <span className="text-slate-400">All Sites</span>
                        )}
                      </td>
                      <td className="py-3.5">
                        <Badge variant={member.isActive ? 'success' : 'neutral'}>
                          {member.isActive ? 'Active' : 'Suspended'}
                        </Badge>
                      </td>
                      {isOwner && (
                        <td className="py-3.5 text-right">
                          {member.role !== 'OWNER' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                toggleStatusMutation.mutate({
                                  id: member.id,
                                  isActive: !member.isActive,
                                })
                              }
                            >
                              {member.isActive ? 'Deactivate' : 'Activate'}
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Add Team Member Modal */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Add New Team Member"
        description="Grant access to site supervisors or account staff"
      >
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {errorMessage}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            addMemberMutation.mutate();
          }}
          className="space-y-4"
        >
          <Input
            label="Full Name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Vikram Singh"
          />

          <Input
            label="Email Address"
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="vikram@shreeram.com"
          />

          <Input
            label="Mobile Number (Optional)"
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="10-digit mobile number"
          />

          <Select
            label="Role Access Level"
            value={formData.role}
            onChange={(e) =>
              setFormData({
                ...formData,
                role: e.target.value as 'ACCOUNTANT' | 'SUPERVISOR',
              })
            }
            options={[
              {
                value: 'SUPERVISOR',
                label: 'Supervisor (Site & Worker Operations)',
              },
              {
                value: 'ACCOUNTANT',
                label: 'Accountant (Sites, Workers & Wage Rates)',
              },
            ]}
          />

          <Input
            label="Temporary Initial Password"
            type="password"
            required
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
            placeholder="Min 8 characters"
          />

          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsInviteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={addMemberMutation.isPending}
            >
              Add Member
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
