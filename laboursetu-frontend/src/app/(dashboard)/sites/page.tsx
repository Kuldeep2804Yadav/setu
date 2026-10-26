'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Header } from '@/components/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  Building2,
  Plus,
  Search,
  MapPin,
  Users,
  ShieldCheck,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

interface SiteItem {
  id: string;
  code: string;
  name: string;
  location: string | null;
  clientName: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  activeWorkerCount: number;
  supervisors: Array<{ id: string; name: string; email: string }>;
}

export default function SitesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ARCHIVED' | ''>('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    location: '',
    clientName: '',
  });

  // Query sites
  const { data, isLoading } = useQuery({
    queryKey: ['sites', search, statusFilter],
    queryFn: async () => {
      const res = await api.get<SiteItem[]>('/sites', {
        search: search || undefined,
        status: statusFilter || undefined,
      });
      return res.data;
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (input: typeof formData) => {
      const res = await api.post('/sites', input);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      setIsCreateOpen(false);
      setFormData({ name: '', code: '', location: '', clientName: '' });
      setCreateError(null);
    },
    onError: (err: any) => {
      setCreateError(err.message || 'Failed to create site.');
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <div className="pb-12">
      <Header
        title="Construction Sites Directory"
        description="Manage active projects, geographical locations, and supervisor allocations"
        action={
          <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add New Site
          </Button>
        }
      />

      <div className="p-8 max-w-7xl mx-auto space-y-6">
        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by site name, code, client..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setStatusFilter('')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === ''
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Sites
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === 'ACTIVE'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('ARCHIVED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === 'ARCHIVED'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Archived
            </button>
          </div>
        </div>

        {/* Sites Grid */}
        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Loading sites directory...
          </div>
        ) : !data || data.length === 0 ? (
          <Card className="text-center py-12">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-base font-semibold text-slate-900">
              No construction sites found
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              Get started by registering your active construction projects and assigning supervisors.
            </p>
            <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Create First Site
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.map((site) => (
              <Link
                key={site.id}
                href={`/sites/${site.id}`}
                className="block group"
              >
                <Card className="h-full hover:border-amber-400 transition-all hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                        {site.code}
                      </span>
                      <h4 className="text-base font-bold text-slate-900 mt-2 group-hover:text-amber-600 transition-colors">
                        {site.name}
                      </h4>
                      {site.clientName && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          Client: {site.clientName}
                        </p>
                      )}
                    </div>
                    <Badge variant={site.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {site.status}
                    </Badge>
                  </div>

                  {site.location && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-4">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{site.location}</span>
                    </div>
                  )}

                  <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 text-slate-700 font-medium">
                      <Users className="w-3.5 h-3.5 text-amber-500" />
                      <span>{site.activeWorkerCount} Active Workers</span>
                    </div>

                    <div className="flex items-center gap-1 text-slate-500">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                      <span>{site.supervisors.length} Supervisors</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Site Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Add New Construction Site"
        description="Register a new project site under your contractor organization"
      >
        {createError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
            <span>{createError}</span>
          </div>
        )}

        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <Input
            label="Site Name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Metro Line 4 - Thane Station"
          />

          <Input
            label="Site Code (Unique Alphanumeric)"
            required
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
            placeholder="e.g. SITE-ML4"
            helperText="Letters, numbers, hyphens, and underscores only"
          />

          <Input
            label="Site Location / Address"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="e.g. Eastern Express Highway, Thane West"
          />

          <Input
            label="Client Name"
            value={formData.clientName}
            onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
            placeholder="e.g. MMRDA or Apex Infratech"
          />

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={createMutation.isPending}
            >
              Save Site
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
