'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { HardHat, AlertCircle, Building } from 'lucide-react';

export default function RegisterPage() {
  const { register } = useAuth();
  const [formData, setFormData] = useState({
    organizationName: '',
    name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await register({
        organizationName: formData.organizationName,
        name: formData.name,
        email: formData.email,
        phone: formData.phone || undefined,
        password: formData.password,
      });
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please check your inputs.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 shadow-lg mb-4">
          <Building className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          Register Contractor Organization
        </h2>
        <p className="mt-2 text-xs text-slate-400">
          Create your dedicated multi-tenant account on LabourSetu
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900 py-8 px-6 shadow-2xl rounded-2xl border border-slate-800 sm:px-10">
          {error && (
            <div className="mb-6 p-3.5 bg-red-950/60 border border-red-800/80 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-200">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Organization / Company Name"
              required
              value={formData.organizationName}
              onChange={(e) =>
                setFormData({ ...formData, organizationName: e.target.value })
              }
              placeholder="e.g. Shree Ram Constructions"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />

            <Input
              label="Owner / Managing Director Full Name"
              required
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g. Rajesh Sharma"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />

            <Input
              label="Official Email Address"
              type="email"
              required
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              placeholder="rajesh@shreeram.com"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />

            <Input
              label="Contact Mobile Number (Optional)"
              type="tel"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              placeholder="10-digit mobile (e.g. 9820098200)"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />

            <Input
              label="Password (min 8 characters)"
              type="password"
              required
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              placeholder="••••••••"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              isLoading={isLoading}
            >
              Complete Registration & Enter
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-800 text-center">
            <p className="text-xs text-slate-400">
              Already registered?{' '}
              <Link
                href="/login"
                className="text-amber-400 font-semibold hover:text-amber-300 transition-colors"
              >
                Sign in to your account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
