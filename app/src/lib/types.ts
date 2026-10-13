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
}

export interface Loan {
  enabled: boolean;
  name: string;
  balance: number;
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
  startingBalance: number;
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

export interface Alert {
  level: 'danger' | 'warn' | 'good';
  text: string;
}
