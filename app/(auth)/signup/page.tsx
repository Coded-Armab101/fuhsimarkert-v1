'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { User, Mail, Lock, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function SignUpPage() {
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uiStatus, setUiStatus] = useState({ type: '', text: '' });

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!fullName || !email || !password) {
      setUiStatus({ type: 'error', text: 'Please fill out all required fields.' });
      return;
    }

    setIsSubmitting(true);
    setUiStatus({ type: '', text: '' });

    try {
      // Execute the signup request to Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // The user metadata maps directly to our public profile trigger!
          data: {
            full_name: fullName
          }
        }
      });

      if (error) throw error;

      setUiStatus({ 
        type: 'success', 
        text: 'Account initiated! Please check your campus email inbox to click the verification link.' 
      });
      
      // Reset inputs
      setFullName('');
      setEmail('');
      setPassword('');

    } catch (err: any) {
      setUiStatus({ type: 'error', text: err.message || 'An error occurred during account registration.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
        
        <div className="text-center mb-8">
          <span className="text-2xl font-black tracking-wider text-red-500">FUHSI<span className="text-white">MARKET</span></span>
          <p className="text-sm text-neutral-400 mt-2">Create your secure student account</p>
        </div>

        <form onSubmit={handleSignUp} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-3.5 text-neutral-500" size={18} />
              <input 
                type="text" 
                placeholder="e.g., Abdulrahman..." 
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Campus Email Address</label>
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
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Secure Password</label>
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

          {uiStatus.text && (
            <div className={`p-4 rounded-xl flex items-start space-x-2 text-sm border ${
              uiStatus.type === 'error' ? 'bg-red-950/20 text-red-400 border-red-900/50' : 'bg-green-950/20 text-green-400 border-green-900/50'
            }`}>
              {uiStatus.type === 'error' ? <AlertCircle className="shrink-0 mt-0.5" size={16} /> : <CheckCircle2 className="shrink-0 mt-0.5" size={16} />}
              <span>{uiStatus.text}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-red-700 hover:bg-red-800 disabled:bg-neutral-800 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <span>Register Profile</span>}
          </button>
        </form>

        <p className="text-xs text-center text-neutral-500 mt-6">
          Already verified? <Link href="/login" className="text-red-500 hover:underline">Log in here</Link>
        </p>
      </div>
    </div>
  );
}
