'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { Mail, Lock, Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      setErrorMessage('Please provide both parameters to authenticate.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Upon success, push them straight past the entry gate to the default hub
      router.push('/buyer');

    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failure. Verify credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
        
        <div className="text-center mb-8">
          <span className="text-2xl font-black tracking-wider text-red-500">FUHSI<span className="text-white">MARKET</span></span>
          <p className="text-sm text-neutral-400 mt-2">Sign into your workspace node</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 text-neutral-500" size={18} />
              <input 
                type="email" 
                placeholder="you@student.edu.ng" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 text-neutral-500" size={18} />
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
              />
            </div>
          </div>

          {errorMessage && (
            <div className="p-4 bg-red-950/20 border border-red-900/50 text-red-400 text-sm rounded-xl flex items-center space-x-2">
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-red-700 hover:bg-red-800 disabled:bg-neutral-800 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all cursor-pointer"
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <span>Access Dashboard</span>}
          </button>
        </form>

        <p className="text-xs text-center text-neutral-500 mt-6">
          New to the hub? <Link href="/signup" className="text-red-500 hover:underline">Register here</Link>
        </p>
      </div>
    </div>
  );
}
