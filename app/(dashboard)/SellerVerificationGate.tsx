'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { uploadStudentId, uploadVerificationVideo } from '@/utils/verify';
import VerificationRecorder from './buyer/VerificationRecorder';
import Link from 'next/link';
import { useNotifications } from '@/components/NotificationProvider';
import { SELLER_VERIFICATION_CONSENT_VERSION } from '@/utils/legal';
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
  const { notify } = useNotifications();

  const [idFile, setIdFile] = useState<File | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [verificationConsent, setVerificationConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);

  // The parent profile is the source of truth. Only keep local overrides for
  // values this form changes before the parent re-fetches (e.g. after submit).
  // Deriving instead of copying into state through an effect avoids an extra
  // render and the react-hooks/set-state-in-effect warning.
  const [override, setOverride] = useState<{
    status?: string | null;
    submittedAt?: string | null;
    rejectReason?: string | null;
  }>({});

  const status = override.status !== undefined ? override.status : (profile.verification_status ?? null);
  const submittedAt = override.submittedAt !== undefined ? override.submittedAt : (profile.verification_submitted_at ?? null);
  const rejectReason = override.rejectReason !== undefined ? override.rejectReason : (profile.verification_reject_reason ?? null);

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
      notify('Please take a photo of your student ID card.', { tone: 'warning' });
      return;
    }
    if (!recordingBlob) {
      notify('Please record the 3-second selfie video.', { tone: 'warning' });
      return;
    }
    if (!verificationConsent) {
      notify('Please agree to the verification use of your ID and video.', { tone: 'warning' });
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

      const response = await fetch('/api/seller/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentIdPath: idRes.path,
          videoPath: videoRes.path,
          consent: verificationConsent,
          consentVersion: SELLER_VERIFICATION_CONSENT_VERSION,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Could not submit your verification.');

      setOverride({ status: 'pending', submittedAt: result.submittedAt || new Date().toISOString() });
      setIdFile(null);
      setRecordingBlob(null);
      setVerificationConsent(false);
      notify('Verification submitted. An administrator will review it.', { tone: 'success' });
      await onRefresh();
    } catch (err: unknown) {
      console.error('Verification submit error:', err);
      notify(err instanceof Error ? err.message : 'Could not submit your verification. Please try again.', { tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 py-2">
      <div className="verification-hero rounded-[1.75rem] bg-gradient-to-br from-[#2e2520] to-[#473a32] p-6 text-white">
        <div className="verification-muted flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/70">
          <ShieldCheck size={16} className="verification-accent text-[#ff9a55]" /> Seller onboarding
        </div>
        <h1 className="mt-2 text-2xl font-black leading-tight">
          {profile.full_name ? `${profile.full_name.split(' ')[0]}, ` : ''}verify to start selling
        </h1>
        <p className="verification-muted mt-2 text-sm text-white/75">
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

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#eaded4] bg-[#fffaf7] p-4 text-[11px] leading-relaxed text-[#6f625a]">
            <input
              type="checkbox"
              checked={verificationConsent}
              onChange={(event) => setVerificationConsent(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#ef6b3b]"
              required
            />
            <span>
              I agree that FuhsiMarket may use my student ID and short selfie video only to confirm that I am the FUHSI student represented by this account. The files are private, are not used for advertising or facial recognition, and are deleted after review. Read the{' '}
              <Link href="/privacy" target="_blank" className="font-bold text-[#d8552e] underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>

          {!verificationConsent ? (
            <p className="rounded-xl bg-[#fff7e8] px-3 py-2 text-[10px] font-mono text-[#8a650f]">
              Agree above to unlock the ID and video controls.
            </p>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className={`block rounded-2xl border border-[#eee6de] bg-[#faf6f2] p-4 transition-all ${verificationConsent ? 'cursor-pointer hover:border-[#ef6b3b]' : 'cursor-not-allowed opacity-55'}`}>
              <div className="flex items-center gap-2 text-xs font-bold text-[#251d18]">
                <IdCard size={16} className="text-[#ef6b3b]" /> Student ID Card (Photo)
              </div>
              <p className="text-[10px] text-[#9d9188] mt-1 mb-2">JPG / PNG / WEBP, up to 10MB</p>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={!verificationConsent || submitting}
                onChange={(e) => setIdFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <span className="text-[11px] text-[#81756d]">
                {idFile ? `✓ ${idFile.name}` : 'Tap to choose a photo (camera or gallery)'}
              </span>
            </label>

            <VerificationRecorder onRecorded={setRecordingBlob} disabled={!verificationConsent || submitting} />
          </div>

          <button
            type="submit"
            disabled={submitting || !verificationConsent}
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
