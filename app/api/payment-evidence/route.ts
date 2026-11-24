import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { accountIsActive } from '@/utils/account';

/**
 * Buyer submission for a payment that was made but never reflected.
 *
 * GET  -> { submissions: [...] } for the signed-in buyer.
 * POST -> multipart form-data: checkout_reference, buyer_reference, note (required),
 *         amount_naira, paid_at (optional), proof (optional image/jpeg|png|webp <=4MB).
 *
 * The checkout attempt is read with the service role because its table is not
 * readable by buyers; the buyer_id on it must match the cookie session. The
 * image goes to a PRIVATE bucket and the database row is written with the cookie
 * client so RLS still enforces buyer ownership.
 */

const BUCKET = 'payment-proofs';
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const REFERENCE_RE = /^[A-Za-z0-9_-]{1,200}$/;

const textField = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

async function authenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { error: 'Unauthorized.' as const, status: 401 as const };
  return { supabase, user };
}

export async function GET() {
  try {
    const auth = await authenticatedUser();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { data, error } = await auth.supabase
      .from('payment_evidence')
      .select(
        'id, checkout_reference, buyer_reference, amount_naira, paid_at, note, proof_path, status, admin_note, resolved_at, created_at',
      )
      .eq('buyer_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const submissions = (data ?? []) as Array<Record<string, unknown>>;
    const references = Array.from(
      new Set(submissions.map((row) => String(row.checkout_reference))),
    );

    // Checkout attempts are intentionally not readable by buyers; enrich the
    // buyer's own submissions with frozen totals through the service role.
    let attempts = new Map<string, Record<string, unknown>>();
    if (references.length > 0) {
      try {
        const admin = createAdminClient();
        const { data: attemptRows } = await admin
          .from('checkout_attempts')
          .select('reference, expected_total_kobo, status, created_at')
          .in('reference', references);
        attempts = new Map(
          ((attemptRows ?? []) as Array<Record<string, unknown>>).map((row) => [
            String(row.reference),
            row,
          ]),
        );
      } catch (lookupError) {
        console.warn('[payment-evidence] attempt enrichment failed', lookupError);
      }
    }

    return NextResponse.json({
      submissions: submissions.map((row) => {
        const attempt = attempts.get(String(row.checkout_reference));
        return {
          ...row,
          checkout_status: attempt?.status ?? null,
          expected_total_kobo: attempt?.expected_total_kobo ?? null,
        };
      }),
    });
  } catch (error) {
    console.error('[payment-evidence] GET failed', error);
    return NextResponse.json({ error: 'Could not load your payment submissions.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticatedUser();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    if (!(await accountIsActive(auth.supabase, auth.user.id))) {
      return NextResponse.json({ error: 'This account is suspended.' }, { status: 403 });
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: 'Malformed form data.' }, { status: 400 });
    }

    const checkoutReference = textField(form.get('checkout_reference'));
    const buyerReference = textField(form.get('buyer_reference'));
    const amountNaira = textField(form.get('amount_naira'));
    const paidAt = textField(form.get('paid_at'));
    const note = textField(form.get('note'));

    if (!REFERENCE_RE.test(checkoutReference)) {
      return NextResponse.json(
        { error: 'Enter a valid payment reference (letters, numbers, - or _).' },
        { status: 400 },
      );
    }
    if (buyerReference.length < 1 || buyerReference.length > 200) {
      return NextResponse.json(
        { error: 'Your payment/bank reference must be between 1 and 200 characters.' },
        { status: 400 },
      );
    }
    if (amountNaira.length > 40 || paidAt.length > 40) {
      return NextResponse.json(
        { error: 'Amount and payment date must be 40 characters or fewer.' },
        { status: 400 },
      );
    }
    if (note.length < 10 || note.length > 2000) {
      return NextResponse.json(
        { error: 'Explain the problem in at least 10 characters (maximum 2000).' },
        { status: 400 },
      );
    }

    const proofEntry = form.get('proof');
    let proofFile: File | null = null;
    if (proofEntry !== null && proofEntry !== '') {
      if (typeof proofEntry === 'string' || !(proofEntry instanceof File)) {
        return NextResponse.json({ error: 'The proof must be an image file.' }, { status: 400 });
      }
      // An empty <input type="file"> is submitted as a nameless 0-byte File.
      // Treat that as "no proof" instead of rejecting every form that has the
      // optional input rendered.
      if (proofEntry.name || proofEntry.size > 0) {
        if (!Object.prototype.hasOwnProperty.call(ALLOWED_TYPES, proofEntry.type)) {
          return NextResponse.json(
            { error: 'Proof images must be JPG, PNG or WEBP.' },
            { status: 400 },
          );
        }
        if (proofEntry.size <= 0 || proofEntry.size > MAX_FILE_BYTES) {
          return NextResponse.json(
            { error: 'Proof image must be 4MB or smaller.' },
            { status: 400 },
          );
        }
        proofFile = proofEntry;
      }
    }

    const admin = createAdminClient();
    const { data: attempt, error: attemptError } = await admin
      .from('checkout_attempts')
      .select('reference, buyer_id, expected_total_kobo, status')
      .eq('reference', checkoutReference)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt || String(attempt.buyer_id) !== auth.user.id) {
      return NextResponse.json(
        { error: 'That payment reference was not found for your account.' },
        { status: 404 },
      );
    }

    let proofPath: string | null = null;
    if (proofFile) {
      const { data: bucket, error: bucketError } = await admin.storage.getBucket(BUCKET);
      if (bucketError || !bucket) {
        console.error('[payment-evidence] proof bucket unavailable', bucketError);
        return NextResponse.json(
          {
            error:
              'Payment proof storage is not configured. Ask support to enable the payment-proofs bucket before submitting an image.',
          },
          { status: 503 },
        );
      }
      if (bucket.public) {
        console.error('[payment-evidence] proof bucket is public');
        return NextResponse.json(
          { error: 'Payment proof storage is misconfigured. Please contact support.' },
          { status: 503 },
        );
      }

      const extension = ALLOWED_TYPES[proofFile.type];
      const path = `${auth.user.id}/${checkoutReference}/${globalThis.crypto.randomUUID()}.${extension}`;
      const { data: upload, error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(path, proofFile, {
          cacheControl: '3600',
          contentType: proofFile.type,
          upsert: false,
        });
      if (uploadError || !upload?.path) {
        console.error('[payment-evidence] proof upload failed', uploadError);
        return NextResponse.json(
          { error: 'Could not upload your proof image. Please try again.' },
          { status: 503 },
        );
      }
      proofPath = upload.path;
    }

    const { data: submission, error: insertError } = await auth.supabase
      .from('payment_evidence')
      .insert({
        checkout_reference: checkoutReference,
        buyer_id: auth.user.id,
        buyer_reference: buyerReference,
        amount_naira: amountNaira || null,
        paid_at: paidAt || null,
        note,
        proof_path: proofPath,
      })
      .select(
        'id, checkout_reference, buyer_reference, amount_naira, paid_at, note, proof_path, status, created_at',
      )
      .single();

    if (insertError) {
      if (proofPath) {
        const { error: removeError } = await admin.storage.from(BUCKET).remove([proofPath]);
        if (removeError) console.error('[payment-evidence] orphan proof cleanup failed', removeError);
      }
      throw insertError;
    }

    return NextResponse.json({ ok: true, submission }, { status: 201 });
  } catch (error) {
    console.error('[payment-evidence] POST failed', error);
    return NextResponse.json({ error: 'Could not submit your payment evidence.' }, { status: 500 });
  }
}
