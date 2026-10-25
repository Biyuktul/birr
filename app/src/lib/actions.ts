/* ============================================================
   BIRR — things that change money

   Pure functions over Data. Every screen that settles an Ekub round
   or corrects a balance goes through here, so two screens can never
   disagree about what paying a round means.
   ============================================================ */

import type { Data, ISODate, Txn } from './types';
import { makeEngine, round2 } from './engine';
import { uid } from './defaults';

/* ---------- Ekub ---------- */

export interface PayRoundInput {
  round: number;
  date: ISODate;
  /** Defaults to the usual contribution. */
  amount?: number;
}

/**
 * Record an Ekub round as paid AND take the money out of the account the
 * Ekub is paid from. Doing only the first is what made the Ekub screen and
 * the Coming tab disagree.
 */
export function payEkubRound(d: Data, input: PayRoundInput): Data {
  const { round, date } = input;
  if (round < 1) return d;
  if ((d.ekub.contributionsPaid || []).some(c => c.round === round)) return d;  // already paid

  const amount = round2(input.amount ?? d.ekub.contributionAmount);
  const txId = uid('t');

  const tx: Txn = {
    id: txId,
    date,
    accountId: d.ekub.accountId,
    amount: -Math.abs(amount),
    category: 'Ekub',
    note: `${d.ekub.name} round ${round}`,
    isTransfer: false,
    source: 'calendar',
  };

  return {
    ...d,
    transactions: [...d.transactions, tx],
    ekub: {
      ...d.ekub,
      contributionsPaid: [...d.ekub.contributionsPaid, { round, date, amount, transactionId: txId }]
        .sort((a, b) => a.round - b.round),
    },
  };
}

/** Undo a round: forget it, and take back the money movement it created. */
export function unpayEkubRound(d: Data, round: number): Data {
  const rec = (d.ekub.contributionsPaid || []).find(c => c.round === round);
  if (!rec) return d;

  return {
    ...d,
    // Only the transaction this round created. Rounds recorded before the
    // money movement existed have no id, and leave nothing behind.
    transactions: rec.transactionId
      ? d.transactions.filter(t => t.id !== rec.transactionId)
      : d.transactions,
    ekub: {
      ...d.ekub,
      contributionsPaid: d.ekub.contributionsPaid.filter(c => c.round !== round),
    },
  };
}

/** Change what a round cost, keeping its money movement in step. */
export function setEkubRoundAmount(d: Data, round: number, amount: number): Data {
  const rec = (d.ekub.contributionsPaid || []).find(c => c.round === round);
  if (!rec) return d;
  const next = round2(amount);
  return {
    ...d,
    transactions: d.transactions.map(t =>
      t.id === rec.transactionId ? { ...t, amount: -Math.abs(next) } : t),
    ekub: {
      ...d.ekub,
      contributionsPaid: d.ekub.contributionsPaid.map(c =>
        c.round === round ? { ...c, amount: next } : c),
    },
  };
}

/** Move a round's date, keeping its money movement in step. */
export function setEkubRoundDate(d: Data, round: number, date: ISODate): Data {
  const rec = (d.ekub.contributionsPaid || []).find(c => c.round === round);
  if (!rec) return d;
  return {
    ...d,
    transactions: d.transactions.map(t => (t.id === rec.transactionId ? { ...t, date } : t)),
    ekub: {
      ...d.ekub,
      contributionsPaid: d.ekub.contributionsPaid.map(c =>
        c.round === round ? { ...c, date } : c),
    },
  };
}

/* ---------- account balances ---------- */

/**
 * Make an account read exactly `actual`.
 *
 * The balance is opening plus everything recorded since, so it is not a field
 * to overwrite — doing that would silently rewrite history. Instead this books
 * the difference as a correction, dated today. The history stays intact, the
 * correction is visible in the transaction list, and it is kept out of
 * spending so it can never look like something you bought.
 */
export function setAccountBalance(
  d: Data,
  accountId: string,
  actual: number,
  note = 'Balance correction',
): Data {
  const acct = d.accounts.find(a => a.id === accountId);
  if (!acct) return d;

  const calculated = makeEngine(d).accountBalance(accountId);
  const diff = round2(actual - calculated);
  if (Math.abs(diff) < 0.005) {
    // Already right. Record that it was checked, without inventing a movement.
    return { ...d, recon: { ...d.recon, [accountId]: round2(actual) } };
  }

  const tx: Txn = {
    id: uid('t'),
    date: d.meta.asOf,
    accountId,
    amount: diff,
    category: null,
    note,
    isTransfer: false,
    isAdjustment: true,
    source: 'manual',
    statedBalance: round2(actual),
  };

  return {
    ...d,
    transactions: [...d.transactions, tx],
    recon: { ...d.recon, [accountId]: round2(actual) },
  };
}
