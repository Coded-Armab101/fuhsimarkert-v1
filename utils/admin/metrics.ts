import type { SupabaseClient } from '@supabase/supabase-js';
import { buyerServiceFeeKobo, sellerCommissionKobo } from '@/utils/pricing';

/**
 * Server-only aggregation for the operator console.
 *
 * The repository does not contain the full database schema, so every query here
 * selects only columns that are already used elsewhere in the app. Data is
 * paged in 1,000-row chunks (Supabase's default cap) and aggregated in JS; this
 * keeps the console correct without requiring new database functions.
 */

export type AdminTab =
  | 'overview'
  | 'people'
  | 'withdrawals'
  | 'verifications'
  | 'fulfilment'
  | 'storage';

export type AdminAlertLevel = 'danger' | 'warn' | 'info';

export type AdminAlert = {
  id: string;
  level: AdminAlertLevel;
  title: string;
  detail: string;
  tab: AdminTab;
  count?: number;
};

export type AdminTrendPoint = {
  day: string;
  signups: number;
  orders: number;
  revenueKobo: number;
};

export type AdminOverview = {
  generatedAt: string;
  users: {
    total: number;
    newToday: number;
    new7d: number;
    new30d: number;
    buyers: number;
    sellers: number;
    approvedSellers: number;
    pendingSellers: number;
    rejectedSellers: number;
    admins: number;
    activeSubscriptions: number;
  };
  orders: {
    total: number;
    today: number;
    last7d: number;
    active: number;
    completed: number;
    cancelled: number;
    disputed: number;
    completionRatePct: number;
    disputeRatePct: number;
    gmvKobo: number;
    completedGmvKobo: number;
    activeValueKobo: number;
    commissionKobo: number;
    buyerFeesKobo: number;
    deliveryFeesKobo: number;
    subscriptionRevenueKobo: number;
    platformProfitKobo: number;
    sellerPayoutKobo: number;
  };
  money: {
    walletFloatKobo: number;
    sellerWalletKobo: number;
    buyerWalletKobo: number;
    pendingWithdrawalsKobo: number;
    pendingWithdrawalsCount: number;
    paidWithdrawalsKobo: number;
    paidWithdrawalsCount: number;
    sellerMoneyKobo: number;
  };
  catalogue: {
    total: number;
    outOfStock: number;
    lowStock: number;
  };
  trend: AdminTrendPoint[];
  alerts: AdminAlert[];
  recent: {
    signups: Array<{ id: string; name: string; persona: string; createdAt: string }>;
    orders: Array<{
      id: string;
      ref: string;
      buyer: string;
      sellers: string;
      amountKobo: number;
      status: string;
      createdAt: string;
      items: number;
    }>;
    withdrawals: Array<{
      id: string;
      seller: string;
      amountKobo: number;
      status: string;
      createdAt: string;
    }>;
  };
};

export type AdminUserRow = {
  id: string;
  fullName: string;
  persona: string;
  isSeller: boolean;
  isApprovedSeller: boolean;
  verificationStatus: string | null;
  isAdmin: boolean;
  createdAt: string;
  walletKobo: number;
  buyerOrders: number;
  spendKobo: number;
  sellerOrders: number;
  earnedKobo: number;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  user_persona: string | null;
  is_seller: boolean | null;
  is_approved_seller: boolean | null;
  verification_status: string | null;
  is_admin: boolean | null;
  /**
   * Not every deployment has a timestamp on `profiles` (the original schema
   * only guaranteed `updated_at`), so this is optional and only used as a
   * fallback. Real signup dates come from `auth.users.created_at`.
   */
  created_at?: string | null;
};

type OrderRow = {
  id: string;
  order_ref: string | null;
  buyer_id: string;
  seller_id: string;
  amount_kobo: number | null;
  delivery_fee_kobo: number | null;
  platform_fee_kobo: number | null;
  quantity: number | null;
  status: string;
  created_at: string | null;
  status_changed_at: string | null;
};

type WalletRow = {
  user_id: string;
  balance: number | null;
};

type WithdrawalRow = {
  id: string;
  seller_id: string;
  amount_kobo: number | null;
  status: string;
  created_at: string | null;
};

type ProductRow = {
  id: string;
  stock: number | null;
};

type SubscriptionRow = {
  user_id: string;
  amount_kobo: number | null;
  expires_at: string | null;
};

type OrderGroup = {
  ref: string;
  rows: OrderRow[];
  createdAt: string;
  status: string;
  goodsKobo: number;
  deliveryFeeKobo: number;
};

const ACTIVE_STATUSES = ['in_escrow', 'packing', 'ready_for_pickup'];
const COMPLETED_STATUSES = ['completed', 'confirmed', 'delivered'];
const CANCELLED_STATUSES = ['cancelled', 'canceled', 'refunded', 'failed'];
const DISPUTED_STATUSES = ['disputed'];

const DAY_MS = 24 * 60 * 60 * 1000;

async function fetchAllRows<T>(
  admin: SupabaseClient,
  table: string,
  select: string,
  order?: { column: string; ascending?: boolean },
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  // Hard stop protects the console from an unbounded scan if a table grows
  // unexpectedly large. 100k rows is far beyond a campus marketplace.
  for (let from = 0; from < 100_000; from += pageSize) {
    let query = admin.from(table).select(select).range(from, from + pageSize - 1);
    if (order) query = query.order(order.column, { ascending: order.ascending ?? false });
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data ?? []) as unknown as T[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

/**
 * Real signup timestamps live in `auth.users`, not necessarily on `profiles`.
 * This reads them with the service-role client and returns `id → created_at`.
 *
 * It fails soft: if the admin auth API is unavailable (for example a key
 * without admin scope), the console still works and uses `profiles.created_at`
 * when that column happens to exist.
 */
async function fetchAuthSignups(admin: SupabaseClient): Promise<Map<string, string>> {
  const signups = new Map<string, string>();
  try {
    for (let page = 1; page <= 100; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const users = data?.users ?? [];
      for (const user of users) {
        if (user.id && user.created_at) signups.set(user.id, user.created_at);
      }
      const lastPage = Number((data as { lastPage?: number } | null)?.lastPage);
      if (users.length < 1000 || page >= (Number.isFinite(lastPage) ? lastPage : page)) break;
    }
  } catch (err) {
    console.warn('[admin/metrics] auth signups unavailable, falling back to profile rows', err);
  }
  return signups;
}

/** Signup date for a profile, preferring `auth.users` over the profile row. */
function signupAt(profile: ProfileRow, authSignups: Map<string, string>): string {
  return authSignups.get(profile.id) || profile.created_at || '';
}

function num(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function time(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function startOfUtcDay(input: Date): Date {
  const day = new Date(input);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

function isoDay(input: Date): string {
  return input.toISOString().slice(0, 10);
}

function summarizeGroupStatus(statuses: string[]): string {
  if (statuses.length === 0) return 'unknown';
  if (statuses.every((status) => COMPLETED_STATUSES.includes(status))) return 'completed';
  if (statuses.every((status) => CANCELLED_STATUSES.includes(status))) return 'cancelled';
  if (statuses.some((status) => DISPUTED_STATUSES.includes(status))) return 'disputed';
  if (statuses.includes('in_escrow')) return 'in_escrow';
  if (statuses.includes('packing')) return 'packing';
  if (statuses.includes('ready_for_pickup')) return 'ready_for_pickup';
  return statuses[0];
}

function buildGroups(orders: OrderRow[]): OrderGroup[] {
  const groups = new Map<string, OrderGroup>();

  for (const order of orders) {
    const ref = order.order_ref || order.id;
    let group = groups.get(ref);
    if (!group) {
      group = {
        ref,
        rows: [],
        createdAt: order.created_at || '',
        status: order.status,
        goodsKobo: 0,
        deliveryFeeKobo: 0,
      };
      groups.set(ref, group);
    }

    group.rows.push(order);
    group.goodsKobo += num(order.amount_kobo);
    group.deliveryFeeKobo = Math.max(group.deliveryFeeKobo, num(order.delivery_fee_kobo));
    if (time(order.created_at) > time(group.createdAt)) group.createdAt = order.created_at || '';
  }

  for (const group of groups.values()) {
    group.status = summarizeGroupStatus(group.rows.map((row) => row.status));
  }

  return Array.from(groups.values());
}

function stageAgeHours(order: OrderRow, now: number): number {
  const changedAt = time(order.status_changed_at) || time(order.created_at);
  if (!changedAt) return 0;
  return (now - changedAt) / (60 * 60 * 1000);
}

function isSlow(order: OrderRow, now: number): boolean {
  const age = stageAgeHours(order, now);
  if (order.status === 'in_escrow') return age > 48;
  if (order.status === 'packing') return age > 24;
  if (order.status === 'ready_for_pickup') return age > 72;
  return false;
}

export async function loadAdminOverview(admin: SupabaseClient): Promise<AdminOverview> {
  const [
    profiles,
    orders,
    wallets,
    withdrawals,
    products,
    subscriptions,
    authSignups,
  ] = await Promise.all([
    // `*` keeps this working even if a deployment is missing `created_at`
    // (the original profiles schema only guaranteed `updated_at`).
    fetchAllRows<ProfileRow>(admin, 'profiles', '*', { column: 'id', ascending: true }),
    fetchAllRows<OrderRow>(
      admin,
      'orders',
      'id, order_ref, buyer_id, seller_id, amount_kobo, delivery_fee_kobo, platform_fee_kobo, quantity, status, created_at, status_changed_at',
      { column: 'id', ascending: true },
    ),
    fetchAllRows<WalletRow>(admin, 'wallets', 'user_id, balance', {
      column: 'user_id',
      ascending: true,
    }),
    fetchAllRows<WithdrawalRow>(
      admin,
      'withdrawals',
      'id, seller_id, amount_kobo, status, created_at',
      { column: 'id', ascending: true },
    ),
    fetchAllRows<ProductRow>(admin, 'products', 'id, stock', { column: 'id', ascending: true }),
    // Subscriptions are a bonus revenue line. A missing/renamed table must not
    // take down the whole console, so this one query is allowed to fail softly.
    fetchAllRows<SubscriptionRow>(
      admin,
      'subscriptions',
      'user_id, amount_kobo, expires_at',
      { column: 'reference', ascending: true },
    ).catch(() => [] as SubscriptionRow[]),
    fetchAuthSignups(admin),
  ]);

  const now = Date.now();
  const today = startOfUtcDay(new Date(now));
  const sevenDaysAgo = now - 7 * DAY_MS;
  const thirtyDaysAgo = now - 30 * DAY_MS;

  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const sellerIds = new Set(
    profiles
      .filter((profile) => profile.is_seller === true || profile.user_persona === 'seller')
      .map((profile) => profile.id),
  );

  const groups = buildGroups(orders);
  const activeRows = orders.filter((order) => ACTIVE_STATUSES.includes(order.status));
  const completedRows = orders.filter((order) => COMPLETED_STATUSES.includes(order.status));
  const completedGroups = groups.filter((group) => group.status === 'completed');
  const cancelledGroups = groups.filter((group) => group.status === 'cancelled');
  const disputedGroups = groups.filter((group) => group.status === 'disputed');
  const activeGroups = groups.filter((group) => ACTIVE_STATUSES.includes(group.status));

  const gmvKobo = groups
    .filter((group) => group.status !== 'cancelled')
    .reduce((sum, group) => sum + group.goodsKobo, 0);
  const completedGmvKobo = completedGroups.reduce((sum, group) => sum + group.goodsKobo, 0);
  const activeValueKobo = activeGroups.reduce((sum, group) => sum + group.goodsKobo, 0);

  const commissionKobo = completedRows.reduce(
    (sum, order) => sum + (num(order.platform_fee_kobo) || sellerCommissionKobo(num(order.amount_kobo))),
    0,
  );
  const buyerFeesKobo = completedGroups.reduce(
    (sum, group) => sum + buyerServiceFeeKobo(group.goodsKobo),
    0,
  );
  const deliveryFeesKobo = completedGroups.reduce(
    (sum, group) => sum + group.deliveryFeeKobo,
    0,
  );
  const subscriptionRevenueKobo = subscriptions.reduce(
    (sum, subscription) => sum + num(subscription.amount_kobo),
    0,
  );
  const platformProfitKobo =
    commissionKobo + buyerFeesKobo + deliveryFeesKobo + subscriptionRevenueKobo;
  const sellerPayoutKobo = completedRows.reduce((sum, order) => {
    const goods = num(order.amount_kobo);
    const fee = num(order.platform_fee_kobo) || sellerCommissionKobo(goods);
    return sum + Math.max(0, goods - fee);
  }, 0);

  const activeSubscriptionUsers = new Set(
    subscriptions
      .filter((subscription) => time(subscription.expires_at) > now)
      .map((subscription) => subscription.user_id),
  );

  const sellerWalletKobo = wallets
    .filter((wallet) => sellerIds.has(wallet.user_id))
    .reduce((sum, wallet) => sum + num(wallet.balance), 0);
  const walletFloatKobo = wallets.reduce((sum, wallet) => sum + num(wallet.balance), 0);
  const pendingWithdrawalRows = withdrawals.filter((withdrawal) => withdrawal.status === 'pending');
  const paidWithdrawalRows = withdrawals.filter((withdrawal) => withdrawal.status === 'paid');
  const pendingWithdrawalsKobo = pendingWithdrawalRows.reduce(
    (sum, withdrawal) => sum + num(withdrawal.amount_kobo),
    0,
  );
  const paidWithdrawalsKobo = paidWithdrawalRows.reduce(
    (sum, withdrawal) => sum + num(withdrawal.amount_kobo),
    0,
  );

  const outOfStock = products.filter(
    (product) => product.stock !== null && num(product.stock) <= 0,
  ).length;
  const lowStock = products.filter((product) => {
    const stock = product.stock === null ? null : num(product.stock);
    return stock !== null && stock > 0 && stock <= 3;
  }).length;

  const trend: AdminTrendPoint[] = [];
  const trendIndex = new Map<string, number>();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(today.getTime() - offset * DAY_MS);
    const key = isoDay(day);
    trendIndex.set(key, trend.length);
    trend.push({ day: key, signups: 0, orders: 0, revenueKobo: 0 });
  }

  for (const profile of profiles) {
    const joinedAt = signupAt(profile, authSignups);
    const key = joinedAt ? isoDay(new Date(joinedAt)) : '';
    const index = trendIndex.get(key);
    if (index !== undefined) trend[index].signups += 1;
  }

  for (const group of groups) {
    if (!group.createdAt) continue;
    const key = isoDay(new Date(group.createdAt));
    const index = trendIndex.get(key);
    if (index === undefined) continue;
    trend[index].orders += 1;
    if (group.status !== 'cancelled') trend[index].revenueKobo += group.goodsKobo;
  }

  const slowRows = activeRows.filter((order) => isSlow(order, now));
  const failedRecent = withdrawals.filter(
    (withdrawal) => withdrawal.status === 'failed' && time(withdrawal.created_at) > sevenDaysAgo,
  ).length;
  const oldestPendingHours = pendingWithdrawalRows.reduce((oldest, withdrawal) => {
    const age = (now - time(withdrawal.created_at)) / (60 * 60 * 1000);
    return Math.max(oldest, age);
  }, 0);

  const alerts: AdminAlert[] = [];

  if (pendingWithdrawalRows.length > 0) {
    const isLate = oldestPendingHours > 24;
    alerts.push({
      id: 'pending-withdrawals',
      level: isLate ? 'danger' : 'warn',
      title: `${pendingWithdrawalRows.length} withdrawal${pendingWithdrawalRows.length === 1 ? '' : 's'} waiting`,
      detail: `₦${Math.round(pendingWithdrawalsKobo / 100).toLocaleString('en-NG')} is waiting to be paid out${
        isLate ? ` — oldest request is ${Math.floor(oldestPendingHours)}h old.` : '.'
      }`,
      tab: 'withdrawals',
      count: pendingWithdrawalRows.length,
    });
  }

  const pendingVerifications = profiles.filter(
    (profile) => profile.verification_status === 'pending',
  ).length;
  if (pendingVerifications > 0) {
    alerts.push({
      id: 'pending-verifications',
      level: 'warn',
      title: `${pendingVerifications} seller verification${pendingVerifications === 1 ? '' : 's'} waiting`,
      detail: 'Review the student ID and selfie video before the seller can start listing.',
      tab: 'verifications',
      count: pendingVerifications,
    });
  }

  if (disputedGroups.length > 0) {
    alerts.push({
      id: 'disputes',
      level: 'danger',
      title: `${disputedGroups.length} disputed order${disputedGroups.length === 1 ? '' : 's'}`,
      detail: 'Escrow is frozen on these orders. They need a decision as soon as possible.',
      tab: 'fulfilment',
      count: disputedGroups.length,
    });
  }

  if (slowRows.length > 0) {
    alerts.push({
      id: 'slow-fulfilment',
      level: 'danger',
      title: `${slowRows.length} fulfilment item${slowRows.length === 1 ? '' : 's'} past deadline`,
      detail: 'A seller (or a buyer on a ready order) has left an order sitting too long.',
      tab: 'fulfilment',
      count: slowRows.length,
    });
  }

  if (failedRecent > 0) {
    alerts.push({
      id: 'failed-withdrawals',
      level: 'warn',
      title: `${failedRecent} failed payout${failedRecent === 1 ? '' : 's'} this week`,
      detail: 'Check the bank details and retry the transfer so the seller is not left waiting.',
      tab: 'withdrawals',
      count: failedRecent,
    });
  }

  if (outOfStock > 0) {
    alerts.push({
      id: 'out-of-stock',
      level: 'info',
      title: `${outOfStock} listing${outOfStock === 1 ? '' : 's'} out of stock`,
      detail: 'Buyers can still see these items but cannot complete a purchase until stock is added.',
      tab: 'people',
      count: outOfStock,
    });
  } else if (lowStock > 0) {
    alerts.push({
      id: 'low-stock',
      level: 'info',
      title: `${lowStock} listing${lowStock === 1 ? '' : 's'} almost sold out`,
      detail: 'Three units or fewer remain. A quick nudge to the seller keeps the catalogue healthy.',
      tab: 'people',
      count: lowStock,
    });
  }

  const recentSignups = profiles
    .map((profile) => ({ profile, joinedAt: signupAt(profile, authSignups) }))
    .filter((entry) => Boolean(entry.joinedAt))
    .sort((a, b) => time(b.joinedAt) - time(a.joinedAt))
    .slice(0, 6)
    .map(({ profile, joinedAt }) => ({
      id: profile.id,
      name: profile.full_name || 'Unnamed student',
      persona: profile.user_persona || 'buyer',
      createdAt: joinedAt,
    }));

  const recentOrders = groups
    .slice()
    .sort((a, b) => time(b.createdAt) - time(a.createdAt))
    .slice(0, 8)
    .map((group) => {
      const sellerNames = Array.from(
        new Set(
          group.rows.map(
            (row) => profilesById.get(row.seller_id)?.full_name || 'Seller',
          ),
        ),
      );
      const buyerId = group.rows[0]?.buyer_id;
      return {
        id: group.ref,
        ref: group.ref,
        buyer: (buyerId ? profilesById.get(buyerId)?.full_name : '') || 'Buyer',
        sellers: sellerNames.join(', '),
        amountKobo: group.goodsKobo + group.deliveryFeeKobo,
        status: group.status,
        createdAt: group.createdAt,
        items: group.rows.length,
      };
    });

  const recentWithdrawals = withdrawals
    .slice()
    .sort((a, b) => time(b.created_at) - time(a.created_at))
    .slice(0, 5)
    .map((withdrawal) => ({
      id: withdrawal.id,
      seller: profilesById.get(withdrawal.seller_id)?.full_name || 'Seller',
      amountKobo: num(withdrawal.amount_kobo),
      status: withdrawal.status,
      createdAt: withdrawal.created_at || '',
    }));

  const totalGroups = groups.length;
  const completionRatePct =
    totalGroups === 0 ? 0 : Math.round((completedGroups.length / totalGroups) * 100);
  const disputeRatePct =
    totalGroups === 0 ? 0 : Math.round((disputedGroups.length / totalGroups) * 100);

  return {
    generatedAt: new Date().toISOString(),
    users: {
      total: profiles.length,
      newToday: profiles.filter((profile) => time(signupAt(profile, authSignups)) >= today.getTime()).length,
      new7d: profiles.filter((profile) => time(signupAt(profile, authSignups)) >= sevenDaysAgo).length,
      new30d: profiles.filter((profile) => time(signupAt(profile, authSignups)) >= thirtyDaysAgo).length,
      buyers: profiles.length - sellerIds.size,
      sellers: sellerIds.size,
      approvedSellers: profiles.filter((profile) => profile.is_approved_seller === true).length,
      pendingSellers: pendingVerifications,
      rejectedSellers: profiles.filter(
        (profile) => profile.verification_status === 'rejected',
      ).length,
      admins: profiles.filter((profile) => profile.is_admin === true).length,
      activeSubscriptions: activeSubscriptionUsers.size,
    },
    orders: {
      total: totalGroups,
      today: groups.filter((group) => time(group.createdAt) >= today.getTime()).length,
      last7d: groups.filter((group) => time(group.createdAt) >= sevenDaysAgo).length,
      active: activeGroups.length,
      completed: completedGroups.length,
      cancelled: cancelledGroups.length,
      disputed: disputedGroups.length,
      completionRatePct,
      disputeRatePct,
      gmvKobo,
      completedGmvKobo,
      activeValueKobo,
      commissionKobo,
      buyerFeesKobo,
      deliveryFeesKobo,
      subscriptionRevenueKobo,
      platformProfitKobo,
      sellerPayoutKobo,
    },
    money: {
      walletFloatKobo,
      sellerWalletKobo,
      buyerWalletKobo: walletFloatKobo - sellerWalletKobo,
      pendingWithdrawalsKobo,
      pendingWithdrawalsCount: pendingWithdrawalRows.length,
      paidWithdrawalsKobo,
      paidWithdrawalsCount: paidWithdrawalRows.length,
      sellerMoneyKobo: sellerWalletKobo + pendingWithdrawalsKobo,
    },
    catalogue: {
      total: products.length,
      outOfStock,
      lowStock,
    },
    trend,
    alerts,
    recent: {
      signups: recentSignups,
      orders: recentOrders,
      withdrawals: recentWithdrawals,
    },
  };
}

export async function loadAdminUsers(
  admin: SupabaseClient,
  search = '',
  limit = 200,
): Promise<{ total: number; users: AdminUserRow[]; generatedAt: string }> {
  const [profiles, orders, wallets, authSignups] = await Promise.all([
    // See loadAdminOverview: `*` tolerates a profiles table without created_at.
    fetchAllRows<ProfileRow>(admin, 'profiles', '*', { column: 'id', ascending: true }),
    fetchAllRows<OrderRow>(
      admin,
      'orders',
      'id, order_ref, buyer_id, seller_id, amount_kobo, delivery_fee_kobo, platform_fee_kobo, quantity, status, created_at, status_changed_at',
      { column: 'id', ascending: true },
    ),
    fetchAllRows<WalletRow>(admin, 'wallets', 'user_id, balance', {
      column: 'user_id',
      ascending: true,
    }),
    fetchAuthSignups(admin),
  ]);

  const walletByUser = new Map(wallets.map((wallet) => [wallet.user_id, num(wallet.balance)]));
  const buyerRefs = new Map<string, Set<string>>();
  const sellerRefs = new Map<string, Set<string>>();
  const spendByUser = new Map<string, number>();
  const earnedByUser = new Map<string, number>();

  for (const order of orders) {
    if (!CANCELLED_STATUSES.includes(order.status)) {
      const ref = order.order_ref || order.id;
      const buyerSet = buyerRefs.get(order.buyer_id) ?? new Set<string>();
      buyerSet.add(ref);
      buyerRefs.set(order.buyer_id, buyerSet);
      spendByUser.set(
        order.buyer_id,
        (spendByUser.get(order.buyer_id) ?? 0) + num(order.amount_kobo),
      );

      const sellerSet = sellerRefs.get(order.seller_id) ?? new Set<string>();
      sellerSet.add(ref);
      sellerRefs.set(order.seller_id, sellerSet);
    }

    if (COMPLETED_STATUSES.includes(order.status)) {
      const goods = num(order.amount_kobo);
      const fee = num(order.platform_fee_kobo) || sellerCommissionKobo(goods);
      earnedByUser.set(
        order.seller_id,
        (earnedByUser.get(order.seller_id) ?? 0) + Math.max(0, goods - fee),
      );
    }
  }

  const needle = search.trim().toLowerCase();
  const filtered = profiles.filter((profile) => {
    if (!needle) return true;
    return (
      (profile.full_name || '').toLowerCase().includes(needle) ||
      profile.id.toLowerCase().includes(needle)
    );
  });

  const users: AdminUserRow[] = filtered
    .map((profile) => ({ profile, joinedAt: signupAt(profile, authSignups) }))
    .sort((a, b) => time(b.joinedAt) - time(a.joinedAt))
    .slice(0, Math.max(1, limit))
    .map(({ profile, joinedAt }) => ({
      id: profile.id,
      fullName: profile.full_name || 'Unnamed student',
      persona: profile.user_persona || 'buyer',
      isSeller: profile.is_seller === true || profile.user_persona === 'seller',
      isApprovedSeller: profile.is_approved_seller === true,
      verificationStatus: profile.verification_status,
      isAdmin: profile.is_admin === true,
      createdAt: joinedAt,
      walletKobo: walletByUser.get(profile.id) ?? 0,
      buyerOrders: buyerRefs.get(profile.id)?.size ?? 0,
      spendKobo: spendByUser.get(profile.id) ?? 0,
      sellerOrders: sellerRefs.get(profile.id)?.size ?? 0,
      earnedKobo: earnedByUser.get(profile.id) ?? 0,
    }));

  return {
    total: filtered.length,
    users,
    generatedAt: new Date().toISOString(),
  };
}
