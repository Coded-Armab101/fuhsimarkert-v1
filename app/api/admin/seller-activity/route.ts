import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  adminDateWindow,
  applyAdminRange,
  parseAdminRange,
} from '@/utils/admin/date-range';

/**
 * Operator seller-monitoring view.
 *
 * GET ?range=<shared window>&sellerId=<uuid>
 *
 * Returns a compact list of sellers with activity counts plus an optional
 * detail payload for one seller (listings, orders, complaints, failed/stalled
 * checkouts and moderation history). Every detail query is bounded, and the
 * optional audit tables degrade to empty lists if they are not present.
 *
 * Authorization: profiles.is_admin = true. All reads use the service role.
 */

type Row = Record<string, unknown>;
type AdminClient = ReturnType<typeof createAdminClient>;

type AdminContext =
  | { admin: AdminClient; user: { id: string } }
  | { error: string; status: number };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_ISSUE_STATUSES = new Set(['initialized', 'initialize_failed']);

function text(value: unknown, max = 1000): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function createdAt(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Never let an optional table break the whole operator view. */
async function safeRows(
  run: () => PromiseLike<{ data: unknown; error: { message?: string } | null }>,
  label: string,
): Promise<Row[]> {
  try {
    const { data, error } = await run();
    if (error) {
      console.warn(`[admin/seller-activity] ${label} query failed`, error.message);
      return [];
    }
    return Array.isArray(data) ? (data as Row[]) : [];
  } catch (error) {
    console.warn(`[admin/seller-activity] ${label} query unavailable`, error);
    return [];
  }
}

async function requireAdmin(): Promise<AdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { error: 'Unauthorized.', status: 401 };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.is_admin !== true) return { error: 'Forbidden.', status: 403 };
  return { admin, user: { id: user.id } };
}

async function loadNames(admin: AdminClient, ids: string[]): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  const unique = Array.from(new Set(ids.filter(Boolean))).slice(0, 1000);
  for (let offset = 0; offset < unique.length; offset += 200) {
    const chunk = unique.slice(offset, offset + 200);
    const rows = await safeRows(
      () => admin.from('profiles').select('id, full_name').in('id', chunk),
      'names',
    );
    for (const row of rows) names.set(String(row.id), text(row.full_name, 200));
  }
  return names;
}

/** product_ids / checkout_items may be a JSON string or an already-parsed array. */
function jsonProductIds(value: unknown): string[] {
  let parsed: unknown = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const ids: string[] = [];
  for (const item of parsed) {
    if (typeof item === 'string' && item) ids.push(item);
    else if (item && typeof item === 'object') {
      const id = text((item as Row).product_id, 200);
      if (id) ids.push(id);
    }
  }
  return ids;
}

function latest(...values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isFinite(time) && time > bestTime) {
      bestTime = time;
      best = value;
    }
  }
  return best;
}

type Complaint = {
  id: string;
  sellerId: string;
  source: 'review' | 'support';
  label: string;
  snippet: string | null;
  rating: number | null;
  createdAt: string | null;
};

type PaymentIssue = {
  reference: string;
  sellerId: string;
  status: string;
  buyerEmail: string | null;
  expectedTotalKobo: number | null;
  createdAt: string | null;
};

type Moderation = {
  id: string;
  sellerId: string;
  action: string | null;
  reason: string | null;
  createdAt: string | null;
  adminName: string | null;
};

type ReviewNote = {
  id: string;
  sellerId: string;
  note: string | null;
  createdAt: string | null;
  adminName: string | null;
};

function groupRows<T extends { sellerId: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.sellerId) ?? [];
    list.push(row);
    grouped.set(row.sellerId, list);
  }
  return grouped;
}

export async function GET(request: Request) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const sellerId = searchParams.get('sellerId');
  if (sellerId && !UUID_RE.test(sellerId)) {
    return NextResponse.json({ error: 'Invalid sellerId.' }, { status: 400 });
  }

  const window = adminDateWindow(parseAdminRange(searchParams.get('range')));
  const admin = ctx.admin;

  try {
    const [profileRows, products, orders, reviews, tickets, attempts, moderation, reviewEvents] =
      await Promise.all([
        safeRows(
          () => admin
            .from('profiles')
            .select(
              'id, full_name, user_persona, is_seller, is_approved_seller, verification_status, is_suspended, suspension_reason, is_pickup_staff',
            )
            .order('full_name', { ascending: true })
            .limit(1000),
          'profiles',
        ),
        safeRows(
          () => applyAdminRange(
            admin
              .from('products')
              .select('id, seller_id, title, price, stock, created_at')
              .order('created_at', { ascending: false }),
            window,
          ).limit(1000),
          'products',
        ),
        safeRows(
          () => applyAdminRange(
            admin
              .from('orders')
              .select('id, order_ref, seller_id, buyer_id, amount_kobo, status, delivery_code, created_at')
              .order('created_at', { ascending: false }),
            window,
          ).limit(1000),
          'orders',
        ),
        safeRows(
          () => applyAdminRange(
            admin
              .from('reviews')
              .select('id, product_id, rating, comment, created_at')
              .order('created_at', { ascending: false }),
            window,
          ).limit(1000),
          'reviews',
        ),
        safeRows(
          () => applyAdminRange(
            admin
              .from('support_tickets')
              .select('id, user_id, subject, message, created_at')
              .order('created_at', { ascending: false }),
            window,
          ).limit(1000),
          'support_tickets',
        ),
        safeRows(
          () => applyAdminRange(
            admin
              .from('checkout_attempts')
              .select('reference, buyer_email, status, expected_total_kobo, product_ids, checkout_items, created_at')
              .order('created_at', { ascending: false }),
            window,
          ).limit(1000),
          'checkout_attempts',
        ),
        safeRows(
          () => applyAdminRange(
            admin
              .from('account_moderation_events')
              .select('id, user_id, admin_id, action, reason, created_at')
              .order('created_at', { ascending: false }),
            window,
          ).limit(1000),
          'account_moderation_events',
        ),
        safeRows(
          () => applyAdminRange(
            admin
              .from('seller_review_events')
              .select('id, seller_id, admin_id, note, created_at')
              .order('created_at', { ascending: false }),
            window,
          ).limit(1000),
          'seller_review_events',
        ),
      ]);

    const profileById = new Map(profileRows.map((row) => [String(row.id), row]));
    const sellerIds = new Set<string>();
    for (const row of profileRows) {
      if (row.is_seller === true || row.user_persona === 'seller') sellerIds.add(String(row.id));
    }

    const productsBySeller = new Map<string, Row[]>();
    const productIdsBySeller = new Map<string, Set<string>>();
    for (const row of products) {
      const id = text(row.seller_id, 200);
      if (!id) continue;
      sellerIds.add(id);
      const list = productsBySeller.get(id) ?? [];
      list.push(row);
      productsBySeller.set(id, list);
      const ids = productIdsBySeller.get(id) ?? new Set<string>();
      const productId = text(row.id, 200);
      if (productId) ids.add(productId);
      productIdsBySeller.set(id, ids);
    }

    const ordersBySeller = new Map<string, Row[]>();
    const buyersBySeller = new Map<string, Set<string>>();
    for (const row of orders) {
      const id = text(row.seller_id, 200);
      if (!id) continue;
      sellerIds.add(id);
      const list = ordersBySeller.get(id) ?? [];
      list.push(row);
      ordersBySeller.set(id, list);
      const buyers = buyersBySeller.get(id) ?? new Set<string>();
      const buyerId = text(row.buyer_id, 200);
      if (buyerId) buyers.add(buyerId);
      buyersBySeller.set(id, buyers);
    }
    if (sellerId) sellerIds.add(sellerId);

    const nameIds = [
      ...profileRows.map((row) => String(row.id)),
      ...orders.map((row) => String(row.buyer_id ?? '')),
      ...moderation.map((row) => String(row.user_id ?? '')),
      ...moderation.map((row) => String(row.admin_id ?? '')),
      ...reviewEvents.map((row) => String(row.seller_id ?? '')),
      ...reviewEvents.map((row) => String(row.admin_id ?? '')),
    ];
    const names = await loadNames(admin, nameIds);

    // Reviews on this seller's listings, plus tickets from buyers who ordered
    // from the seller. De-duplicated by (source, id, seller).
    const complaints = new Map<string, Complaint>();
    const addComplaint = (complaint: Complaint) => {
      const key = `${complaint.source}:${complaint.id}:${complaint.sellerId}`;
      if (!complaints.has(key)) complaints.set(key, complaint);
    };
    for (const review of reviews) {
      const rating = Number(review.rating);
      if (!Number.isFinite(rating) || rating > 2) continue;
      const productId = text(review.product_id, 200);
      if (!productId) continue;
      for (const [id, ownedProductIds] of productIdsBySeller) {
        if (!ownedProductIds.has(productId)) continue;
        addComplaint({
          id: String(review.id),
          sellerId: id,
          source: 'review',
          label: 'Low product rating',
          snippet: text(review.comment, 180),
          rating,
          createdAt: createdAt(review.created_at),
        });
      }
    }
    for (const ticket of tickets) {
      const buyerId = text(ticket.user_id, 200);
      if (!buyerId) continue;
      for (const [id, buyers] of buyersBySeller) {
        if (!buyers.has(buyerId)) continue;
        addComplaint({
          id: String(ticket.id),
          sellerId: id,
          source: 'support',
          label: text(ticket.subject, 120) ?? 'Support ticket',
          snippet: text(ticket.message, 180),
          rating: null,
          createdAt: createdAt(ticket.created_at),
        });
      }
    }
    const complaintsBySeller = groupRows(Array.from(complaints.values()));

    // Open/failed checkouts referencing the seller's listings.
    const paymentIssues = new Map<string, PaymentIssue>();
    for (const attempt of attempts) {
      const status = text(attempt.status, 40);
      if (!status || !PAYMENT_ISSUE_STATUSES.has(status)) continue;
      const ids = new Set([
        ...jsonProductIds(attempt.product_ids),
        ...jsonProductIds(attempt.checkout_items),
      ]);
      if (ids.size === 0) continue;
      const reference = text(attempt.reference, 200);
      if (!reference) continue;
      for (const [id, ownedProductIds] of productIdsBySeller) {
        let matches = false;
        for (const productId of ids) {
          if (ownedProductIds.has(productId)) {
            matches = true;
            break;
          }
        }
        if (!matches) continue;
        const key = `${reference}:${id}`;
        if (paymentIssues.has(key)) continue;
        paymentIssues.set(key, {
          reference,
          sellerId: id,
          status,
          buyerEmail: text(attempt.buyer_email, 320),
          expectedTotalKobo: attempt.expected_total_kobo === null || attempt.expected_total_kobo === undefined
            ? null
            : Number(attempt.expected_total_kobo),
          createdAt: createdAt(attempt.created_at),
        });
      }
    }
    const paymentIssuesBySeller = groupRows(Array.from(paymentIssues.values()));

    const moderationBySeller = groupRows(
      moderation
        .filter((row) => sellerIds.has(String(row.user_id ?? '')))
        .map((row): Moderation => ({
          id: String(row.id),
          sellerId: String(row.user_id),
          action: text(row.action, 80),
          reason: text(row.reason, 500),
          createdAt: createdAt(row.created_at),
          adminName: names.get(String(row.admin_id ?? '')) ?? null,
        })),
    );

    const reviewNotesBySeller = groupRows(
      reviewEvents
        .filter((row) => sellerIds.has(String(row.seller_id ?? '')))
        .map((row): ReviewNote => ({
          id: String(row.id),
          sellerId: String(row.seller_id),
          note: text(row.note, 2000),
          createdAt: createdAt(row.created_at),
          adminName: names.get(String(row.admin_id ?? '')) ?? null,
        })),
    );

    const sellers = Array.from(sellerIds)
      .slice(0, 500)
      .map((id) => {
        const ownProducts = productsBySeller.get(id) ?? [];
        const ownOrders = ordersBySeller.get(id) ?? [];
        const ownComplaints = complaintsBySeller.get(id) ?? [];
        const ownPaymentIssues = paymentIssuesBySeller.get(id) ?? [];
        const ownModeration = moderationBySeller.get(id) ?? [];
        const ownNotes = reviewNotesBySeller.get(id) ?? [];
        const profile = profileById.get(id);
        return {
          id,
          name: names.get(id) ?? null,
          isSuspended: profile?.is_suspended === true,
          productCount: ownProducts.length,
          orderCount: ownOrders.length,
          disputeCount: ownOrders.filter((order) => order.status === 'disputed').length,
          complaintCount: ownComplaints.length,
          paymentIssueCount: ownPaymentIssues.length,
          moderationCount: ownModeration.length,
          lastActivityAt: latest(
            ...ownProducts.map((row) => createdAt(row.created_at)),
            ...ownOrders.map((row) => createdAt(row.created_at)),
            ...ownComplaints.map((row) => row.createdAt),
            ...ownPaymentIssues.map((row) => row.createdAt),
            ...ownModeration.map((row) => row.createdAt),
            ...ownNotes.map((row) => row.createdAt),
          ),
        };
      })
      .sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''));

    let selected: Record<string, unknown> | null = null;
    if (sellerId) {
      const profile = profileById.get(sellerId);
      let signupAt: string | null = null;
      try {
        const { data } = await admin
          .from('profiles')
          .select('created_at')
          .eq('id', sellerId)
          .maybeSingle();
        const value = (data as Row | null)?.created_at;
        signupAt = createdAt(value);
      } catch (error) {
        // Older schemas have no profiles.created_at.
        console.warn('[admin/seller-activity] signup date unavailable', error);
      }

      selected = {
        seller: {
          id: sellerId,
          name: names.get(sellerId) ?? null,
          isSuspended: profile?.is_suspended === true,
          suspensionReason: text(profile?.suspension_reason, 500),
          isApprovedSeller: profile?.is_approved_seller === true,
          verificationStatus: text(profile?.verification_status, 100),
          createdAt: signupAt,
          isPickupStaff: profile?.is_pickup_staff === true,
        },
        products: (productsBySeller.get(sellerId) ?? []).slice(0, 100).map((row) => ({
          id: String(row.id),
          title: text(row.title, 300),
          // products.price is already kobo (and may come back as a string).
          priceKobo: row.price === null || row.price === undefined ? null : Number(row.price),
          stock: row.stock === null || row.stock === undefined ? null : Number(row.stock),
          createdAt: createdAt(row.created_at),
        })),
        orders: (ordersBySeller.get(sellerId) ?? []).slice(0, 100).map((row) => ({
          id: String(row.id),
          ref: text(row.order_ref, 200),
          buyerName: names.get(String(row.buyer_id ?? '')) ?? null,
          status: text(row.status, 80),
          amountKobo: row.amount_kobo === null || row.amount_kobo === undefined ? null : Number(row.amount_kobo),
          createdAt: createdAt(row.created_at),
        })),
        complaints: (complaintsBySeller.get(sellerId) ?? []).slice(0, 100).map((row) => ({
          id: row.id,
          source: row.source,
          label: row.label,
          snippet: row.snippet,
          rating: row.rating,
          createdAt: row.createdAt,
        })),
        paymentIssues: (paymentIssuesBySeller.get(sellerId) ?? []).slice(0, 100).map((row) => ({
          reference: row.reference,
          status: row.status,
          buyerEmail: row.buyerEmail,
          expectedTotalKobo: row.expectedTotalKobo,
          createdAt: row.createdAt,
        })),
        moderation: (moderationBySeller.get(sellerId) ?? []).slice(0, 100).map((row) => ({
          id: row.id,
          action: row.action,
          reason: row.reason,
          createdAt: row.createdAt,
          adminName: row.adminName,
        })),
        reviewNotes: (reviewNotesBySeller.get(sellerId) ?? []).slice(0, 100).map((row) => ({
          id: row.id,
          note: row.note,
          createdAt: row.createdAt,
          adminName: row.adminName,
        })),
      };
    }

    return NextResponse.json({ sellers, selected });
  } catch (error) {
    console.error('[admin/seller-activity] GET failed', error);
    return NextResponse.json({ error: 'Could not load seller activity.' }, { status: 500 });
  }
}
