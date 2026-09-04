import { DealStatus } from '@prisma/client';

/**
 * Standard e-commerce deal lifecycle — not specified in the schema itself,
 * so this is the one defensible reading of the DealStatus enum's ordering:
 * you can't jump from NEW straight to COMPLETED, and CANCELLED/REFUNDED are
 * terminal. CANCELLED and REFUNDED both restore reserved stock (see
 * DealsService.changeStatus) — CANCELLED for a sale that never shipped,
 * REFUNDED for one that did but came back.
 */
export const DEAL_STATUS_TRANSITIONS: Record<DealStatus, DealStatus[]> = {
  [DealStatus.NEW]: [DealStatus.WAITING_PAYMENT, DealStatus.CANCELLED],
  [DealStatus.WAITING_PAYMENT]: [DealStatus.PAID, DealStatus.CANCELLED],
  [DealStatus.PAID]: [DealStatus.SHIPPED, DealStatus.REFUNDED],
  [DealStatus.SHIPPED]: [DealStatus.COMPLETED, DealStatus.REFUNDED],
  [DealStatus.COMPLETED]: [DealStatus.REFUNDED],
  [DealStatus.CANCELLED]: [],
  [DealStatus.REFUNDED]: [],
};

export const STOCK_RESTORING_STATUSES: ReadonlySet<DealStatus> = new Set([
  DealStatus.CANCELLED,
  DealStatus.REFUNDED,
]);

export const TERMINAL_DEAL_STATUSES: ReadonlySet<DealStatus> = new Set([
  DealStatus.COMPLETED,
  DealStatus.CANCELLED,
  DealStatus.REFUNDED,
]);

/** Deals eligible to count toward a manager's commission payout — see payouts module. */
export const COMMISSIONABLE_DEAL_STATUSES: ReadonlySet<DealStatus> = new Set([
  DealStatus.PAID,
  DealStatus.SHIPPED,
  DealStatus.COMPLETED,
]);
