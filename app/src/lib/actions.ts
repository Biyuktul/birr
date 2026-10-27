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

/* ---------- money you lend to other people ---------- */

export interface LendInput {
  person: string;
  amount: number;
  /** null when it did not come out of one of your accounts. */
  accountId: string | null;
  /** Where it came from, when that was not one of your accounts. */
  source?: string;
  lentOn: ISODate;
  dueOn?: ISODate;
  note?: string;
}

/**
 * Lend money to someone: it leaves the account, but it is not spending —
 * it is recorded as still owed to you, and kept out of the budget.
 */
export function lendMoney(d: Data, input: LendInput): Data {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return d;
  if (!input.person.trim()) return d;

  const amount = round2(input.amount);

  // Money that never passed through one of your accounts moves no balance.
  // It is still owed back to you, so it is still recorded.
  const txId = input.accountId ? uid('t') : undefined;
  const tx: Txn | null = input.accountId && txId ? {
    id: txId,
    date: input.lentOn,
    accountId: input.accountId,
    amount: -amount,
    category: null,
    note: `Lent to ${input.person.trim()}`,
    isTransfer: false,
    isLending: true,
    source: 'manual',
  } : null;

  return {
    ...d,
    transactions: tx ? [...d.transactions, tx] : d.transactions,
    lending: [...(d.lending || []), {
      id: uid('l'),
      person: input.person.trim(),
      amount,
      accountId: input.accountId,
      source: input.accountId ? undefined : (input.source?.trim() || undefined),
      lentOn: input.lentOn,
      dueOn: input.dueOn || undefined,
      note: input.note,
      transactionId: txId,
      repayments: [],
    }],
  };
}

export interface RepayInput {
  lendingId: string;
  amount: number;
  date: ISODate;
  /**
   * Which account it came back into. Omit to use the one it went out of;
   * pass null when it did not reach an account at all.
   */
  accountId?: string | null;
}

/** Record money coming back. Partial repayments are fine. */
export function recordRepayment(d: Data, input: RepayInput): Data {
  const l = (d.lending || []).find(x => x.id === input.lendingId);
  if (!l) return d;
  if (!Number.isFinite(input.amount) || input.amount <= 0) return d;

  const alreadyBack = round2((l.repayments || []).reduce((t, r) => t + r.amount, 0));
  const outstanding = round2(l.amount - alreadyBack);
  if (outstanding <= 0.005) return d;                 // nothing left owing

  // Never record more coming back than went out.
  const amount = round2(Math.min(input.amount, outstanding));
  const accountId = input.accountId === undefined ? l.accountId : input.accountId;

  // Money handed back in cash you have not banked moves no balance either.
  const txId = accountId ? uid('t') : undefined;
  const tx: Txn | null = accountId && txId ? {
    id: txId,
    date: input.date,
    accountId,
    amount,                                            // money coming in
    category: null,
    note: `${l.person} paid back`,
    isTransfer: false,
    isLending: true,
    source: 'manual',
  } : null;

  return {
    ...d,
    transactions: tx ? [...d.transactions, tx] : d.transactions,
    lending: d.lending.map(x => x.id === l.id ? {
      ...x,
      repayments: [...(x.repayments || []),
        { id: uid('r'), date: input.date, amount, accountId, transactionId: txId }],
    } : x),
  };
}

/** Undo a repayment: the money leaves the account again and is owed again. */
export function removeRepayment(d: Data, lendingId: string, repaymentId: string): Data {
  const l = (d.lending || []).find(x => x.id === lendingId);
  if (!l) return d;
  const r = (l.repayments || []).find(x => x.id === repaymentId);
  if (!r) return d;
  return {
    ...d,
    transactions: r.transactionId
      ? d.transactions.filter(t => t.id !== r.transactionId)
      : d.transactions,
    lending: d.lending.map(x => x.id === l.id
      ? { ...x, repayments: x.repayments.filter(p => p.id !== repaymentId) }
      : x),
  };
}

/** Forget a loan entirely, putting back every movement it created. */
export function removeLending(d: Data, lendingId: string): Data {
  const l = (d.lending || []).find(x => x.id === lendingId);
  if (!l) return d;
  const ids = new Set<string>(
    [l.transactionId, ...(l.repayments || []).map(r => r.transactionId)]
      .filter((x): x is string => !!x));
  return {
    ...d,
    transactions: d.transactions.filter(t => !ids.has(t.id)),
    lending: d.lending.filter(x => x.id !== lendingId),
  };
}
