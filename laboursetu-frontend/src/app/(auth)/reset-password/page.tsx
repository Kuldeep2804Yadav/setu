'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { KeyRound, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';

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
      setError('Passwords do not match.');
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

  const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5';
  const inputClass = 'bg-slate-950/80 border-slate-700/80 text-white placeholder:text-slate-500 rounded-xl focus:border-amber-500 focus:ring-amber-500/20';

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <div className="p-4 bg-red-950/50 border border-red-500/30 rounded-xl flex items-center justify-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-xs font-medium text-red-200">
            Invalid or missing password reset link.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="inline-flex items-center gap-1.5 text-xs text-amber-400 font-semibold hover:text-amber-300 underline underline-offset-2 transition-colors"
        >
          Request a new recovery link &rarr;
        </Link>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-6 p-4 bg-red-950/50 border border-red-500/30 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs font-medium text-red-200 leading-relaxed">{error}</p>
        </div>
      )}

      {status === 'success' ? (
        <div className="text-center space-y-5">
          <div className="w-14 h-14 bg-emerald-950/60 border border-emerald-500/40 rounded-2xl flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-500/10">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white mb-1">Password Reset Successfully!</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Your password has been updated. Redirecting you to login...
            </p>
          </div>
          <div className="pt-4 border-t border-slate-800">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs text-amber-400 font-semibold hover:text-amber-300 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Go to sign in now
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="New Password"
            labelClassName={labelClass}
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 8 characters"
            className={inputClass}
          />

          <Input
            label="Confirm New Password"
            labelClassName={labelClass}
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat new password"
            className={inputClass}
          />

          <Button
            type="submit"
            variant="primary"
            className="w-full mt-2 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 border border-amber-400/20 transition-all flex items-center justify-center gap-2"
            isLoading={status === 'loading'}
          >
            Update Password & Sign In
            <ArrowRight className="w-4 h-4" />
          </Button>

          <div className="pt-4 border-t border-slate-800 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 transition-colors font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to sign in
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-transparent blur-3xl pointer-events-none rounded-full" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 shadow-xl shadow-amber-500/20 mb-4 ring-1 ring-amber-300/30">
          <KeyRound className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-white">
          Create New Password
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Enter your new account password below
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-slate-900/90 backdrop-blur-xl py-8 px-6 shadow-2xl rounded-2xl border border-slate-800 ring-1 ring-white/10 sm:px-10">
          <Suspense fallback={<p className="text-slate-400 text-center py-4">Loading form...</p>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
