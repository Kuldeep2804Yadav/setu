'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Building2, AlertCircle, ArrowRight } from 'lucide-react';

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

  const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5';
  const inputClass = 'bg-slate-950/80 border-slate-700/80 text-white placeholder:text-slate-500 rounded-xl focus:border-amber-500 focus:ring-amber-500/20';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-transparent blur-3xl pointer-events-none rounded-full" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 shadow-xl shadow-amber-500/20 mb-4 ring-1 ring-amber-300/30">
          <Building2 className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-white">
          Register Contractor Organization
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Create your dedicated multi-tenant workforce workspace on LabourSetu
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-slate-900/90 backdrop-blur-xl py-8 px-6 shadow-2xl rounded-2xl border border-slate-800 ring-1 ring-white/10 sm:px-10">
          {error && (
            <div className="mb-6 p-4 bg-red-950/50 border border-red-500/30 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-red-200 leading-relaxed">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Organization / Company Name"
              labelClassName={labelClass}
              required
              value={formData.organizationName}
              onChange={(e) =>
                setFormData({ ...formData, organizationName: e.target.value })
              }
              placeholder="e.g. Shree Ram Constructions"
              className={inputClass}
            />

            <Input
              label="Owner / Managing Director Full Name"
              labelClassName={labelClass}
              required
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g. Rajesh Sharma"
              className={inputClass}
            />

            <Input
              label="Official Email Address"
              labelClassName={labelClass}
              type="email"
              required
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              placeholder="rajesh@shreeram.com"
              className={inputClass}
            />

            <Input
              label="Contact Mobile Number (Optional)"
              labelClassName={labelClass}
              type="tel"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              placeholder="10-digit mobile (e.g. 9820098200)"
              className={inputClass}
            />

            <Input
              label="Password (min 8 characters)"
              labelClassName={labelClass}
              type="password"
              required
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              placeholder="••••••••"
              className={inputClass}
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-3 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 border border-amber-400/20 transition-all flex items-center justify-center gap-2"
              isLoading={isLoading}
            >
              Complete Registration & Enter
              <ArrowRight className="w-4 h-4" />
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
