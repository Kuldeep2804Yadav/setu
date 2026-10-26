'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      await api.post('/auth/reset-password', {
        token,
        password,
      });
      setStatus('success');
      setTimeout(() => {
        router.push('/login');
      }, 2500);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password.');
      setStatus('idle');
    }
  };

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <p className="text-sm text-red-400">
          Invalid password reset link. Token is missing.
        </p>
        <Link href="/forgot-password" className="text-xs text-amber-400 underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-6 p-3.5 bg-red-950/60 border border-red-800/80 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-200">{error}</p>
        </div>
      )}

      {status === 'success' ? (
        <div className="text-center space-y-4">
          <div className="w-12 h-12 bg-emerald-950/60 border border-emerald-800 rounded-full flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <p className="text-sm text-slate-200">
            Password has been reset successfully! Redirecting to login...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="New Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 8 characters"
            className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
          />

          <Input
            label="Confirm New Password"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat new password"
            className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
          />

          <Button
            type="submit"
            variant="primary"
            className="w-full mt-2"
            isLoading={status === 'loading'}
          >
            Update Password & Sign In
          </Button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 shadow-lg mb-4">
          <KeyRound className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          Create New Password
        </h2>
        <p className="mt-2 text-xs text-slate-400">
          Enter your new password below
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900 py-8 px-6 shadow-2xl rounded-2xl border border-slate-800 sm:px-10">
          <Suspense fallback={<p className="text-slate-400 text-center">Loading...</p>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
