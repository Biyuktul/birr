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

  const requested = input.amount ?? d.ekub.contributionAmount;
  if (!Number.isFinite(requested) || requested <= 0) return d;
  const amount = round2(requested);
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

/* ---------- loan ---------- */

export interface PayLoanInput {
  date: ISODate;
  amount: number;
  /** Where the money came from. Defaults to the loan's own account. */
  accountId?: string;
  note?: string;
}

/**
 * Record a loan payment: it comes off what you owe AND out of the account it
 * was paid from. Recording only the first left the loan smaller while the
 * money was still sitting in the bank.
 *
 * A payment dated in the future is recorded as scheduled — the engine only
 * counts transactions up to today, so it leaves the balance alone until then.
 */
export function payLoan(d: Data, input: PayLoanInput): Data {
  // Check the sign of what was actually passed. Taking the absolute value
  // first would turn a mistyped -100 into a real 100 payment.
  if (!Number.isFinite(input.amount) || input.amount <= 0) return d;
  const amount = round2(input.amount);

  const accountId = input.accountId || d.loan.accountId;
  const txId = uid('t');

  const tx: Txn = {
    id: txId,
    date: input.date,
    accountId,
    amount: -amount,
    category: 'Debt',
    note: input.note || `${d.loan.name} payment`,
    isTransfer: false,
    source: 'manual',
  };

  return {
    ...d,
    transactions: [...d.transactions, tx],
    loan: {
      ...d.loan,
      manualPayments: [
        ...d.loan.manualPayments,
        { id: uid('p'), date: input.date, amount, accountId, transactionId: txId, note: input.note },
      ],
    },
  };
}

/** Undo a loan payment: it goes back onto the debt and back into the account. */
export function unpayLoan(d: Data, paymentId: string): Data {
  const p = (d.loan.manualPayments || []).find(x => x.id === paymentId);
  if (!p) return d;
  return {
    ...d,
    // Payments recorded before this carried no money movement; nothing to undo.
    transactions: p.transactionId
      ? d.transactions.filter(t => t.id !== p.transactionId)
      : d.transactions,
    loan: {
      ...d.loan,
      manualPayments: d.loan.manualPayments.filter(x => x.id !== paymentId),
    },
  };
}
