'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { KeyRound, CheckCircle2, AlertCircle, ArrowLeft, Send } from 'lucide-react';

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
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-transparent blur-3xl pointer-events-none rounded-full" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 shadow-xl shadow-amber-500/20 mb-4 ring-1 ring-amber-300/30">
          <KeyRound className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-white">
          Reset Your Password
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Enter your registered email to receive recovery instructions
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

          {status === 'success' ? (
            <div className="text-center space-y-5">
              <div className="w-14 h-14 bg-emerald-950/60 border border-emerald-500/40 rounded-2xl flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white mb-1">Check Your Inbox</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{message}</p>
              </div>

              {debugToken && (
                <div className="p-3.5 bg-slate-950/80 rounded-xl text-left text-xs font-mono text-amber-300 break-all border border-amber-500/30 ring-1 ring-amber-500/10">
                  <p className="text-slate-400 mb-1 font-sans font-medium text-[11px] uppercase tracking-wider">
                    Dev Test Quick Reset Link:
                  </p>
                  <Link
                    href={`/reset-password?token=${debugToken}`}
                    className="underline hover:text-white font-semibold transition-colors"
                  >
                    Click here to reset with token &rarr;
                  </Link>
                </div>
              )}

              <div className="pt-4 border-t border-slate-800">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs text-amber-400 font-semibold hover:text-amber-300 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Return to sign in
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="Registered Email Address"
                labelClassName="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@company.com"
                className="bg-slate-950/80 border-slate-700/80 text-white placeholder:text-slate-500 rounded-xl focus:border-amber-500 focus:ring-amber-500/20"
              />

              <Button
                type="submit"
                variant="primary"
                className="w-full mt-2 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 border border-amber-400/20 transition-all flex items-center justify-center gap-2"
                isLoading={status === 'loading'}
              >
                Send Password Reset Link
                <Send className="w-4 h-4" />
              </Button>

              <div className="pt-4 border-t border-slate-800 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 transition-colors font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Remember your password? Sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
