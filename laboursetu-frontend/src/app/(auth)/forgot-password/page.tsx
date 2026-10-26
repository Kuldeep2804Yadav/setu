'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [message, setMessage] = useState('');
  const [debugToken, setDebugToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setError(null);

    try {
      const res = await api.post<{ message: string; debugToken?: string }>(
        '/auth/forgot-password',
        { email }
      );
      setMessage(res.data.message);
      if (res.data.debugToken) {
        setDebugToken(res.data.debugToken);
      }
      setStatus('success');
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
      setStatus('idle');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 shadow-lg mb-4">
          <KeyRound className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          Reset Your Password
        </h2>
        <p className="mt-2 text-xs text-slate-400">
          Enter your registered email to receive recovery instructions
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

          {status === 'success' ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 bg-emerald-950/60 border border-emerald-800 rounded-full flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="text-sm text-slate-200">{message}</p>

              {debugToken && (
                <div className="p-3 bg-slate-800 rounded-lg text-left text-xs font-mono text-amber-300 break-all border border-slate-700">
                  <p className="text-slate-400 mb-1 font-sans">
                    Dev Test Reset Link:
                  </p>
                  <Link
                    href={`/reset-password?token=${debugToken}`}
                    className="underline hover:text-white"
                  >
                    Click here to reset with token
                  </Link>
                </div>
              )}

              <div className="pt-4 border-t border-slate-800">
                <Link
                  href="/login"
                  className="text-xs text-amber-400 font-semibold hover:text-amber-300"
                >
                  Return to sign in
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Registered Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@company.com"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              />

              <Button
                type="submit"
                variant="primary"
                className="w-full mt-2"
                isLoading={status === 'loading'}
              >
                Send Reset Link
              </Button>

              <div className="mt-6 pt-4 border-t border-slate-800 text-center">
                <Link
                  href="/login"
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
