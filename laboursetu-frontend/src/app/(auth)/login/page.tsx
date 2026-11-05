'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { HardHat, AlertCircle, ArrowRight, Lock, Mail } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login({ email, password });
    } catch (err: any) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemoCredentials = () => {
    setEmail('owner@shreeram.com');
    setPassword('Password123!');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-transparent blur-3xl pointer-events-none rounded-full" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 shadow-xl shadow-amber-500/20 mb-4 ring-1 ring-amber-300/30">
          <HardHat className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-white">
          Sign in to Labour<span className="text-amber-400">Setu</span>
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Workforce & Site Management SaaS for Indian Contractors
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

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Input
                label="Email Address"
                labelClassName="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contractor@example.com"
                className="bg-slate-950/80 border-slate-700/80 text-black placeholder:text-slate-500 rounded-xl focus:border-amber-500 focus:ring-amber-500/20"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Password
                </span>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-slate-950/80 border-slate-700/80 text-black placeholder:text-slate-500 rounded-xl focus:border-amber-500 focus:ring-amber-500/20"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 border border-amber-400/20 transition-all flex items-center justify-center gap-2"
              isLoading={isLoading}
            >
              Sign In to Dashboard
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>

          {/* Quick Demo Credentials pill */}
          <div className="mt-5 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
            <p className="text-xs text-slate-400 mb-1.5 font-medium">Testing in dev / demo mode?</p>
            <button
              type="button"
              onClick={fillDemoCredentials}
              className="text-xs font-semibold text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors cursor-pointer"
            >
              Fill Demo Owner Credentials (owner@shreeram.com)
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-800 text-center">
            <p className="text-xs text-slate-400">
              New contractor?{' '}
              <Link
                href="/register"
                className="text-amber-400 font-semibold hover:text-amber-300 transition-colors"
              >
                Register your organization
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
