/* ============================================================
   BIRR — data model
   One object holds everything a person owns. The Setup screen
   edits it; the engine reads it; the backend will sync it.
   ============================================================ */

export type ISODate = string;                  // 'YYYY-MM-DD'
export type AccountType = 'bank' | 'mobile' | 'cash';
export type Confidence = 'high' | 'medium' | 'low';

/** Which parts of the data the person has actually confirmed as real.
 *  Anything false is still a placeholder and the app says so. */
export type Section =
  | 'accounts' | 'income' | 'bills' | 'loan' | 'ekub' | 'relocation' | 'budgets';

export const SECTIONS: { key: Section; label: string; why: string }[] = [
  { key: 'accounts', label: 'Accounts', why: 'Opening balance and date for each account — take them all on one day' },
  { key: 'income', label: 'Income', why: 'What actually lands, and the day it lands' },
  { key: 'bills', label: 'Bills', why: 'Every regular payment and its due day' },
  { key: 'loan', label: 'Loan', why: 'Balance, rate, and the monthly deduction' },
  { key: 'ekub', label: 'Ekub', why: 'Contribution, members, your round, and what you have paid' },
  { key: 'relocation', label: 'Relocation', why: 'Target date, advance months and the new rent' },
  { key: 'budgets', label: 'Budgets', why: 'Monthly caps per category' },
];

export interface Schedule {
  type: 'monthly' | 'weekly' | 'irregular';
  dayOfMonth?: number;
  dayOfWeek?: number;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  provider: string | null;
  /** SMS sender IDs that map to this account, e.g. ['127'] */
  senderIds: string[];
  opening: number;
  openingDate: ISODate;
  archived?: boolean;
  /** What this account is for, in your words — "the kids", "coffee". */
  purpose?: string;
  /** Spending of these categories defaults to this account. */
  categories?: string[];
}

export interface IncomeItem {
  id: string;
  name: string;
  accountId: string;
  amount: number;
  schedule: Schedule;
  confidence: Confidence;
  /** true when payroll already took the loan repayment out of this figure */
  netOfLoanDeduction: boolean;
  active: boolean;
}

export interface BillItem {
  id: string;
  name: string;
  amount: number;
  accountId: string;
  category: string;
  schedule: Schedule;
  essential: boolean;
  active: boolean;
}

export interface LoanPayment {
  id: string;
  date: ISODate;
  amount: number;
  note?: string;
  /** Which account it came out of. Falls back to the loan's own account. */
  accountId?: string;
  /** The money movement it created, so removing it undoes that too. */
  transactionId?: string;
}

export interface Loan {
  enabled: boolean;
  name: string;
  /** The figure you last confirmed with the lender, on `balanceAsOf`. */
  balance: number;
  /**
   * When `balance` was true. Payments you record after this date are
   * subtracted from it to give today's outstanding figure. Absent on data
   * saved before this field existed: every recorded payment then counts.
   */
  balanceAsOf?: ISODate;
  annualRate: number;
  autoDeductAmount: number;
  autoDeductDay: number;
  deductedFromPayroll: boolean;
  accountId: string;
  manualPayments: LoanPayment[];
}

export interface EkubContribution {
  round: number;
  date: ISODate;
  /** What was actually handed over, if it differed from the usual amount. */
  amount?: number;
  /** The money movement this created, so unmarking can undo it exactly. */
  transactionId?: string;
}

export interface Ekub {
  enabled: boolean;
  name: string;
  contributionAmount: number;
  frequency: 'monthly' | 'weekly';
  totalMembers: number;
  myPayoutRound: number;
  startDate: ISODate;
  dayOfMonth: number;
  accountId: string;
  contributionsPaid: EkubContribution[];
}

export interface Relocation {
  enabled: boolean;
  targetDate: ISODate;
  advanceMonths: number;
  newMonthlyRent: number;
  deposit: number;
  movingCost: number;
  otherMonthlyDelta: number;
}

/* ---------- money you lend to other people ---------- */

export interface Repayment {
  id: string;
  date: ISODate;
  amount: number;
  /** Which account it came back into. */
  accountId: string;
  transactionId?: string;
}

export interface Lending {
  id: string;
  /** Who has it. */
  person: string;
  amount: number;
  /** Which account it went out of. */
  accountId: string;
  lentOn: ISODate;
  /** When you expect it back. Absent means no date was agreed. */
  dueOn?: ISODate;
  note?: string;
  transactionId?: string;
  repayments: Repayment[];
}

export interface LendingItem extends Lending {
  repaid: number;
  outstanding: number;
  settled: boolean;
  overdue: boolean;
  daysLate: number;
}

export interface LendingStatus {
  items: LendingItem[];
  totalOut: number;
  totalRepaid: number;
  outstanding: number;
  overdueCount: number;
  overdueAmount: number;
}

export interface Policy {
  /** cash never counted as spendable */
  bufferAmount: number;
  lateIncomeDays: number;
  stressOverrun: number;
  driftAlertThreshold: number;
}

export interface Txn {
  id: string;
  date: ISODate;
  accountId: string;
  /** negative = money out */
  amount: number;
  category: string | null;
  note: string | null;
  isTransfer: boolean;
  transferGroupId?: string | null;
  source: 'manual' | 'sms' | 'calendar' | 'import';
  statedBalance?: number | null;
  externalRef?: string | null;
  /**
   * A correction that brings an account to a balance you confirmed, rather
   * than money you spent. Kept out of spending so a correction can never
   * masquerade as groceries.
   */
  isAdjustment?: boolean;
  /**
   * Money lent to someone, or coming back from them. It leaves the account
   * but it is not spending — you expect to see it again.
   */
  isLending?: boolean;
}

export interface ParsedMessage {
  id: string;
  raw: string;
  sender: string | null;
  provider: string | null;
  providerLabel: string;
  direction: 'debit' | 'credit' | null;
  amount: number | null;
  signedAmount: number | null;
  statedBalance: number | null;
  counterparty: string | null;
  accountDigits: string | null;
  accountId: string | null;
  category: string | null;
  date: ISODate;
  ref: string | null;
  looksLikeTransfer: boolean;
  confidence: number;
  missing: string[];
  needsReview: boolean;
}

export interface Data {
  version: number;
  meta: {
    asOf: ISODate;
    currency: string;
    ownerName: string;
  };
  /** false until the person has entered their own figures for that section */
  confirmed: Record<Section, boolean>;
  policy: Policy;
  accounts: Account[];
  categories: string[];
  income: IncomeItem[];
  bills: BillItem[];
  loan: Loan;
  ekub: Ekub;
  relocation: Relocation;
  budgets: Record<string, number>;
  transactions: Txn[];
  /** Money you have lent to other people. */
  lending: Lending[];
  /** commitment key -> moved-to date */
  overrides: Record<string, ISODate>;
  /** commitment key -> settled */
  paid: Record<string, boolean>;
  /** account id -> balance the bank last stated */
  recon: Record<string, number>;
  inbox: ParsedMessage[];
}

/* ---------- things the engine returns ---------- */

export interface Commitment {
  id: string;
  key: string;
  name: string;
  amount: number;
  accountId: string;
  category: string;
  date: ISODate;
  kind: 'bill' | 'ekub' | 'loan';
  essential: boolean;
  overdue: boolean;
  note?: string;
}

export interface IncomeOccurrence extends IncomeItem {
  date: ISODate;
}

export interface SafeToSpend {
  balance: number;
  committedTotal: number;
  buffer: number;
  nextPayday: ISODate;
  daysToPayday: number;
  amount: number;
  shortfall: number;
  committed: Commitment[];
}

export interface ForecastDay {
  date: ISODate;
  in: number;
  out: number;
  balance: number;
  events: string[];
}

export type Scenario = 'base' | 'late' | 'stress';

export interface Forecast {
  scenario: Scenario;
  series: ForecastDay[];
  lowest: { balance: number; date: ISODate };
  firstNegative: ISODate | null;
  endBalance: number;
  startBalance: number;
  totalIn: number;
  totalOut: number;
}

export interface LoanRow {
  month: string;
  interest: number;
  manual: number;
  auto: number;
  closing: number;
  date: ISODate | null;
}

export interface LoanSchedule {
  rows: LoanRow[];
  payoffDate: ISODate | null;
  totalInterest: number;
  totalPaid: number;
  monthsRemaining: number;
  /** What you owe today: the confirmed balance less everything you have paid since. */
  startingBalance: number;
  /** The figure you confirmed with the lender, before your payments. */
  confirmedBalance: number;
  /** Payments you have recorded as already made. */
  paidSoFar: number;
  /** Payments you have recorded but dated in the future. */
  plannedAhead: number;
  stalled: boolean;
}

export interface EkubStatus {
  paidCount: number;
  totalRounds: number;
  nextRound: number;
  nextDue: ISODate | null;
  overdue: boolean;
  payoutAmount: number;
  payoutDate: ISODate;
  payoutRound: number;
  contributedSoFar: number;
  contributedByPayout: number;
  netAtPayout: number;
  totalContribution: number;
  progress: number;
  alreadyPaidOut: boolean;
}

export interface RelocationResult {
  targetDate: ISODate;
  daysOut: number;
  advance: number;
  upfrontNeed: number;
  availableAtTarget: number;
  advanceShortfall: number;
  upfrontShortfall: number;
  monthlyIncome: number;
  newMonthlyOut: number;
  monthlyDeficit: number;
  currentRent: number;
  newRent: number;
  affordable: boolean;
  verdict: string;
  monthlySavingNeeded: number;
}

export interface Reconciliation {
  accountId: string;
  calculated: number;
  stated: number;
  drift: number;
  clean: boolean;
}

export interface BudgetRow {
  category: string;
  spent: number;
  cap: number;
  remaining: number;
  pct: number;
  over: boolean;
}

export type AlertRoute =
  | 'home' | 'calendar' | 'forecast' | 'loan' | 'ekub' | 'accounts'
  | 'relocation' | 'budget' | 'inbox' | 'setup' | 'lending';

export interface Alert {
  level: 'danger' | 'warn' | 'good' | 'info';
  text: string;
  /** Where tapping it takes you, and what the button says. */
  action?: { label: string; route: AlertRoute };
  /** Sorts soonest-first within a level; also shown as a due chip. */
  date?: ISODate;
}
