import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { LEGAL_TERMS_VERSION } from '@/utils/legal';
import { accountIsActive } from '@/utils/account';

type ProfileInput = {
  fullName?: unknown;
  matricNo?: unknown;
  hostel?: unknown;
  dob?: unknown;
  bankName?: unknown;
  accountNumber?: unknown;
};

function text(value: unknown, maxLength: number): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

/** Update only buyer-editable profile fields; privileged seller/admin fields
 * never come from the browser. The service client avoids profile-policy drift
 * while the cookie client still proves which user owns the row. */
export async function PATCH(request: Request) {
  try {
    let body: ProfileInput;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Malformed profile data.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    }
    if (!(await accountIsActive(supabase, user.id))) {
      return NextResponse.json({ error: 'This account is suspended.' }, { status: 403 });
    }

    const fullName = text(body.fullName, 120);
    const matricNo = text(body.matricNo, 50);
    const hostel = text(body.hostel, 120);
    const dob = text(body.dob, 10);
    const bankName = text(body.bankName, 120);
    const accountNumber = text(body.accountNumber, 10);

    // These four fields identify a buyer for order tracking; checkout refuses
    // any profile that is missing one, so do not let the form save a partial one.
    if (!fullName || !matricNo || !hostel || !dob) {
      return NextResponse.json(
        { error: 'Complete your full name, matric number, hostel and date of birth.' },
        { status: 400 },
      );
    }
    if (accountNumber && !/^\d{10}$/.test(accountNumber)) {
      return NextResponse.json({ error: 'Account number must be exactly 10 digits.' }, { status: 400 });
    }
    if (dob) {
      const parsedDob = new Date(`${dob}T00:00:00.000Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(dob) ||
        Number.isNaN(parsedDob.getTime()) ||
        parsedDob.toISOString().slice(0, 10) !== dob
      ) {
        return NextResponse.json({ error: 'Date of birth is invalid.' }, { status: 400 });
      }
    }

    const metadataAcceptedAt = text(user.user_metadata?.legal_accepted_at, 40);
    const metadataLegalVersion = text(user.user_metadata?.legal_version, 40);
    const acceptedDate = metadataAcceptedAt ? new Date(metadataAcceptedAt) : null;
    const legalConsent =
      metadataLegalVersion === LEGAL_TERMS_VERSION &&
      acceptedDate &&
      !Number.isNaN(acceptedDate.getTime())
        ? {
            legal_accepted_at: acceptedDate.toISOString(),
            legal_version: LEGAL_TERMS_VERSION,
          }
        : {};

    const values = {
      full_name: fullName,
      matric_no: matricNo || null,
      hostel: hostel || null,
      dob: dob || null,
      bank_name: bankName || null,
      account_number: accountNumber || null,
      updated_at: new Date().toISOString(),
      ...legalConsent,
    };

    const admin = createAdminClient();
    const { data: updated, error: updateError } = await admin
      .from('profiles')
      .update(values)
      .eq('id', user.id)
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;

    if (!updated) {
      const { error: insertError } = await admin.from('profiles').insert({
        id: user.id,
        user_persona: 'buyer',
        created_at: new Date().toISOString(),
        ...values,
      });
      if (insertError) throw insertError;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[profile] update failed', err);
    return NextResponse.json({ error: 'Could not update your profile.' }, { status: 500 });
  }
}
