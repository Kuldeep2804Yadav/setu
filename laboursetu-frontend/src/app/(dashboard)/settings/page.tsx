'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Header } from '@/components/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Building, CheckCircle2, AlertCircle, Shield } from 'lucide-react';

interface OrgProfile {
  id: string;
  name: string;
  slug: string;
  code: string;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  currency: string;
  createdAt: string;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  const isOwner = user?.role === 'OWNER';

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    gstin: '',
    currency: 'INR',
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: org, isLoading } = useQuery({
    queryKey: ['org-profile'],
    queryFn: async () => {
      const res = await api.get<OrgProfile>('/organization');
      return res.data;
    },
  });

  useEffect(() => {
    if (org) {
      setFormData({
        name: org.name || '',
        phone: org.phone || '',
        address: org.address || '',
        gstin: org.gstin || '',
        currency: org.currency || 'INR',
      });
    }
  }, [org]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put('/organization', {
        name: formData.name,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
        gstin: formData.gstin || undefined,
        currency: formData.currency,
      });
      return res.data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['org-profile'] });
      await refreshUser();
      setSuccessMessage('Organization profile updated successfully.');
      setErrorMessage(null);
      setTimeout(() => setSuccessMessage(null), 4000);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to update organization profile.');
      setSuccessMessage(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  return (
    <div className="pb-12">
      <Header
        title="Organization Settings"
        description="Contractor tenant profile, tax identification, and business configurations"
      />

      <div className="p-8 max-w-4xl mx-auto space-y-6">
        {successMessage && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-800 text-sm">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card title="Contractor Business Profile">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Organization Name"
                  required
                  disabled={!isOwner}
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />

                <Input
                  label="Tenant Code (System Identifier)"
                  disabled
                  value={org?.code || ''}
                  helperText="Permanent identifier across databases"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Contact Phone"
                  type="tel"
                  disabled={!isOwner}
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  placeholder="10-digit mobile"
                />

                <Input
                  label="GSTIN (Goods and Services Tax)"
                  disabled={!isOwner}
                  value={formData.gstin}
                  onChange={(e) =>
                    setFormData({ ...formData, gstin: e.target.value.toUpperCase() })
                  }
                  placeholder="e.g. 27AABCS1429B1Z2"
                />
              </div>

              <Input
                label="Registered Business Address"
                disabled={!isOwner}
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                placeholder="Plot / Street / City / State / Pincode"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Default Currency"
                  disabled
                  value="INR (₹ Indian Rupee)"
                />

                <Input
                  label="Organization Tenant ID"
                  disabled
                  value={org?.id || ''}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            {isOwner && (
              <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={updateMutation.isPending}
                >
                  Save Organization Changes
                </Button>
              </div>
            )}
          </Card>
        </form>
      </div>
    </div>
  );
}
