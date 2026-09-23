'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { uploadStudentId, uploadVerificationVideo } from '@/utils/verify';
import VerificationRecorder from './buyer/VerificationRecorder';
import {
  ArrowLeftRight,
  CheckCircle2,
  IdCard,
  Loader2,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';

export type SellerGateProfile = {
  full_name?: string | null;
  is_admin?: boolean | null;
  is_approved_seller?: boolean | null;
  verification_status?: string | null;
  verification_submitted_at?: string | null;
  verification_reject_reason?: string | null;
};

export default function SellerVerificationGate({
  profile,
  onRefresh,
}: {
  profile: SellerGateProfile;
  onRefresh: () => Promise<void> | void;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [idFile, setIdFile] = useState<File | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);

  const [status, setStatus] = useState<string | null>(profile.verification_status ?? null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(
    profile.verification_submitted_at ?? null,
  );
  const [rejectReason, setRejectReason] = useState<string | null>(
    profile.verification_reject_reason ?? null,
  );

  // Stay in sync when the parent re-fetches the profile (e.g. after submitting
  // or when the admin approves on another screen and the user checks again).
  useEffect(() => {
    setStatus(profile.verification_status ?? null);
    setSubmittedAt(profile.verification_submitted_at ?? null);
    setRejectReason(profile.verification_reject_reason ?? null);
  }, [profile]);

  const isPending = Boolean(submittedAt) && status === 'pending';

  const refreshStatus = async () => {
    setRefreshLoading(true);
    try {
      await onRefresh();
    } finally {
      setRefreshLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (!idFile) {
      alert('Please take a photo of your student ID card.');
      return;
    }
    if (!recordingBlob) {
      alert('Please record the 3-second selfie video.');
      return;
    }

    setSubmitting(true);
    try {
      const idRes = await uploadStudentId(supabase, user.id, idFile);
      if (!idRes.ok) throw new Error(idRes.error);

      const videoFile = new File([recordingBlob], `verification_${Date.now()}.webm`, {
        type: recordingBlob.type || 'video/webm',
      });
      const videoRes = await uploadVerificationVideo(supabase, user.id, videoFile);
      if (!videoRes.ok) throw new Error(videoRes.error);

      const { error } = await supabase
        .from('profiles')
        .update({
          student_id_url: idRes.path,
          verification_video_url: videoRes.path,
          verification_status: 'pending',
          verification_submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (error) throw error;

      setStatus('pending');
      setSubmittedAt(new Date().toISOString());
      setIdFile(null);
      setRecordingBlob(null);
      await onRefresh();
    } catch (err: unknown) {
      console.error('Verification submit error:', err);
      alert(err instanceof Error ? err.message : 'Could not submit your verification. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 py-2">
      <div className="rounded-[1.75rem] bg-gradient-to-br from-[#2e2520] to-[#473a32] p-6 text-white">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/70">
          <ShieldCheck size={16} className="text-[#ff9a55]" /> Seller onboarding
        </div>
        <h1 className="mt-2 text-2xl font-black leading-tight">
          {profile.full_name ? `${profile.full_name.split(' ')[0]}, ` : ''}verify to start selling
        </h1>
        <p className="mt-2 text-sm text-white/75">
          Your seller payment was successful. One quick identity check protects buyers — once an
          admin approves it, your full Seller Studio unlocks.
        </p>
        <button
          onClick={() => router.push('/buyer/profile')}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-xs font-bold text-white hover:bg-white/25 transition-colors cursor-pointer"
        >
          <ArrowLeftRight size={14} /> Switch to buyer profile
        </button>
      </div>

      {isPending ? (
        <div className="rounded-[1.75rem] bg-white p-6 text-center shadow-sm border border-[#eee4dc] space-y-4">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#fff0e9]">
            <CheckCircle2 size={26} className="text-[#ef6b3b]" />
          </div>
          <div>
            <h2 className="text-base font-black text-[#251d18]">Verification pending review</h2>
            <p className="mt-1 text-xs text-[#81756d] leading-relaxed">
              An administrator is reviewing your student ID and selfie video. Your seller tools stay
              locked until they approve you — you can still use your buyer profile to shop in the
              meantime.
            </p>
          </div>
          <button
            onClick={refreshStatus}
            disabled={refreshLoading}
            className="inline-flex items-center gap-2 rounded-full bg-[#2e2520] px-5 py-2.5 text-xs font-bold text-white hover:bg-black transition-colors disabled:opacity-60 cursor-pointer"
          >
            {refreshLoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            Check status
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-[1.75rem] bg-white p-6 shadow-sm border border-[#eee4dc] space-y-5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#251d18] border-b border-[#f0e9e2] pb-3">
            <IdCard size={16} className="text-[#ef6b3b]" /> Submit your ID and video
          </div>

          {status === 'rejected' && rejectReason && (
            <p role="alert" className="text-[11px] font-mono text-[#b04a27] bg-[#fff0e9] border border-[#ffd9c4] rounded-xl px-3 py-2.5">
              Your previous submission was rejected: “{rejectReason}”. Re-record and resubmit below.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block cursor-pointer rounded-2xl border border-[#eee6de] bg-[#faf6f2] p-4 hover:border-[#ef6b3b] transition-all">
              <div className="flex items-center gap-2 text-xs font-bold text-[#251d18]">
                <IdCard size={16} className="text-[#ef6b3b]" /> Student ID Card (Photo)
              </div>
              <p className="text-[10px] text-[#9d9188] mt-1 mb-2">JPG / PNG / WEBP, up to 1MB</p>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(e) => setIdFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <span className="text-[11px] text-[#81756d]">
                {idFile ? `✓ ${idFile.name}` : 'Tap to select your ID image'}
              </span>
            </label>

            <VerificationRecorder onRecorded={setRecordingBlob} disabled={submitting} />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#2e2520] hover:bg-black disabled:bg-[#e3dad1] disabled:cursor-not-allowed text-white font-bold text-xs py-3.5 transition-all cursor-pointer"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
            {submitting ? 'Uploading & submitting...' : 'Submit for verification'}
          </button>
        </form>
      )}
    </div>
  );
}