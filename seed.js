/* ============================================================
   BIRR — SEED DATA
   ------------------------------------------------------------
   THIS IS THE ONLY FILE YOU NEED TO EDIT TO MAKE THE NUMBERS REAL.

   Every value marked  // ?? PLACEHOLDER  is a guess I invented so the
   engine has something to chew on. It is NOT your money. Replace it.

   Values marked  // ++ CONFIRMED  came from our earlier session and are
   believed correct, but re-check them anyway.
   ============================================================ */

const SEED = {
  meta: {
    asOf: '2026-10-13',
    currency: 'ETB',
    household: 'Household',
  },

  /* ---------- POLICY: how cautious Birr should be ---------- */
  policy: {
    // Cash never to be counted as spendable. Your "don't touch" floor.
    bufferAmount: 3000,            // ?? PLACEHOLDER
    // Days of income delay assumed in the "late" forecast scenario.
    lateIncomeDays: 10,            // ?? PLACEHOLDER
    // Expense overrun assumed in the "stress" scenario.
    stressOverrun: 0.15,           // ?? PLACEHOLDER
    // Drift above this on reconciliation raises an alert.
    driftAlertThreshold: 50,
  },

  /* ---------- ACCOUNTS (6) ---------- */
  // opening = the real balance on openingDate. Get these from the app /
  // last SMS / passbook on one single day, so they are all consistent.
  accounts: [
    { id: 'cbe',      name: 'CBE',           type: 'bank',   provider: 'CBE',      senderIds: ['CBE', 'CBEBirr'], opening: 0, openingDate: '2026-10-01' }, // ?? PLACEHOLDER
    { id: 'berhan',   name: 'Berhan Bank',   type: 'bank',   provider: 'Berhan',   senderIds: ['Berhan'],         opening: 0, openingDate: '2026-10-01' }, // ?? PLACEHOLDER
    { id: 'dashen',   name: 'Dashen Bank',   type: 'bank',   provider: 'Dashen',   senderIds: ['Dashen'],         opening: 0, openingDate: '2026-10-01' }, // ?? PLACEHOLDER
    { id: 'bunna',    name: 'Bunna Bank',    type: 'bank',   provider: 'Bunna',    senderIds: ['Bunna'],          opening: 0, openingDate: '2026-10-01' }, // ?? PLACEHOLDER
    { id: 'telebirr', name: 'telebirr',      type: 'mobile', provider: 'telebirr', senderIds: ['127'],            opening: 0, openingDate: '2026-10-01' }, // ?? PLACEHOLDER
    { id: 'cash',     name: 'Cash on hand',  type: 'cash',   provider: null,       senderIds: [],                 opening: 0, openingDate: '2026-10-01' }, // ?? PLACEHOLDER
  ],

  /* ---------- CATEGORIES ---------- */
  // Confirm or edit this list — it drives budgets and the inbox buttons.
  categories: [
    'Groceries', 'Transport', 'Child', 'Family support', 'Utilities',
    'Eating out', 'Airtime', 'Health', 'Church', 'Rent', 'Debt', 'Ekub', 'Other',
  ],

  /* ---------- INCOME ---------- */
  // confidence: 'high'   = you can plan around the date (salary)
  //             'medium' = usually arrives, timing slips
  //             'low'    = do not count on it (side work)
  // netOfLoanDeduction: true means the loan repayment is ALREADY taken out
  //   of this figure by payroll, so Birr must not subtract it again as cash.
  income: [
    {
      id: 'salary', name: 'Salary (net)', accountId: 'cbe',
      amount: 28000,                    // ?? PLACEHOLDER — net amount that actually lands
      schedule: { type: 'monthly', dayOfMonth: 30 },  // ?? PLACEHOLDER
      confidence: 'high',
      netOfLoanDeduction: true,
    },
    {
      id: 'side', name: 'Side income', accountId: 'telebirr',
      amount: 4000,                     // ?? PLACEHOLDER
      schedule: { type: 'irregular', dayOfMonth: 15 }, // ?? PLACEHOLDER
      confidence: 'low',
      netOfLoanDeduction: false,
    },
  ],

  /* ---------- RECURRING BILLS & COMMITMENTS ---------- */
  bills: [
    { id: 'rent',      name: 'Rent',            amount: 9000, accountId: 'cbe',      category: 'Rent',           schedule: { type: 'monthly', dayOfMonth: 1 },  essential: true  }, // ?? PLACEHOLDER
    { id: 'utilities', name: 'Electricity/water', amount: 900, accountId: 'telebirr', category: 'Utilities',      schedule: { type: 'monthly', dayOfMonth: 20 }, essential: true  }, // ?? PLACEHOLDER
    { id: 'family',    name: 'Family support',  amount: 4000, accountId: 'cbe',      category: 'Family support', schedule: { type: 'monthly', dayOfMonth: 5 },  essential: true  }, // ?? PLACEHOLDER
    { id: 'child',     name: 'Child / school',  amount: 2500, accountId: 'cbe',      category: 'Child',          schedule: { type: 'monthly', dayOfMonth: 8 },  essential: true  }, // ?? PLACEHOLDER
    { id: 'transport', name: 'Transport',       amount: 2200, accountId: 'cash',     category: 'Transport',      schedule: { type: 'monthly', dayOfMonth: 1 },  essential: true  }, // ?? PLACEHOLDER
    { id: 'airtime',   name: 'Airtime / data',  amount: 600,  accountId: 'telebirr', category: 'Airtime',        schedule: { type: 'monthly', dayOfMonth: 10 }, essential: false }, // ?? PLACEHOLDER
    { id: 'church',    name: 'Church',          amount: 500,  accountId: 'cash',     category: 'Church',         schedule: { type: 'monthly', dayOfMonth: 7 },  essential: false }, // ?? PLACEHOLDER
  ],

  /* ---------- COMPANY LOAN ---------- */
  loan: {
    name: 'Company loan',
    balance: 78557,                 // ++ CONFIRMED (from earlier session — re-check it is still current)
    annualRate: 0,                  // ?? PLACEHOLDER — company loans are often 0%. Confirm.
    autoDeductAmount: 16000,        // ?? PLACEHOLDER — the payroll deduction each month
    autoDeductDay: 30,              // ?? PLACEHOLDER — same day as salary
    // Extra one-off payments you make by hand, on top of payroll:
    manualPayments: [
      // { date: '2026-11-15', amount: 5000, note: 'bonus' },
    ],
  },

  /* ---------- EKUB (savings group) ---------- */
  ekub: {
    name: 'Ekub',
    contributionAmount: 3000,       // ?? PLACEHOLDER — per round
    frequency: 'monthly',           // ?? PLACEHOLDER — monthly | weekly
    totalMembers: 12,               // ?? PLACEHOLDER — determines payout size
    myPayoutRound: 7,               // ?? PLACEHOLDER — which round you collect
    startDate: '2026-08-15',        // ?? PLACEHOLDER — round 1 date
    dayOfMonth: 15,                 // ?? PLACEHOLDER
    accountId: 'cash',              // ?? PLACEHOLDER
    // Rounds already paid. Earlier session said #1 and #2 are paid, #3 due —
    // the DATES below are guesses. Confirm them.
    contributionsPaid: [
      { round: 1, date: '2026-08-15' },  // ?? PLACEHOLDER date
      { round: 2, date: '2026-09-15' },  // ?? PLACEHOLDER date
    ],
  },

  /* ---------- RELOCATION PLAN ---------- */
  relocation: {
    targetDate: '2027-01-01',       // ?? PLACEHOLDER
    advanceMonths: 3,               // ?? PLACEHOLDER — months of rent demanded up front
    newMonthlyRent: 13000,          // ?? PLACEHOLDER
    deposit: 0,                     // ?? PLACEHOLDER
    movingCost: 6000,               // ?? PLACEHOLDER
    // Change in other monthly costs after the move (transport, utilities...)
    otherMonthlyDelta: 800,         // ?? PLACEHOLDER
  },

  /* ---------- BUDGETS (monthly caps) ---------- */
  budgets: {
    Groceries: 6000,   // ?? PLACEHOLDER
    Transport: 2200,   // ?? PLACEHOLDER
    'Eating out': 800, // ?? PLACEHOLDER
    Airtime: 600,      // ?? PLACEHOLDER
    Health: 1000,      // ?? PLACEHOLDER
    Child: 2500,       // ?? PLACEHOLDER
    Other: 1000,       // ?? PLACEHOLDER
  },

  /* ---------- TRANSACTIONS ALREADY RECORDED ---------- */
  // Leave empty on a fresh start; openings above carry the history.
  transactions: [],
};

/* What is still a guess. The app shows this list on the Home screen so it
   can never quietly pretend the numbers are yours. */
const NEEDS_CONFIRMATION = [
  'Opening balance + opening date for all 6 accounts (take them all on ONE day)',
  'Salary: net amount that actually lands, and the day it lands',
  'Whether the loan repayment is deducted by payroll before you see the money',
  'Loan: interest rate (0% if company loan), monthly deduction amount, deduction day',
  'Loan balance 78,557 ETB — still current?',
  'Every bill amount and due day (rent, utilities, family, child, transport, airtime, church)',
  'Ekub: contribution amount, number of members, which round is yours, round 1 date',
  'Ekub: exact dates contributions #1 and #2 were paid, and when #3 is due',
  'Relocation: target date, advance months, new rent, deposit, moving cost',
  'Side income: realistic amount and how reliable it actually is',
  'Category list — confirm or edit',
  'Monthly budget caps',
];

/* Results the previous session computed from the REAL data. Once the seed
   above is real again, these should roughly reproduce. If they do not, the
   seed is wrong somewhere. */
const PRIOR_SESSION_RESULTS = {
  loanPayoffDate: '2027-03-22',
  relocationVerdict: 'NOT AFFORDABLE',
  relocationAdvanceShortfall: 5000,
  relocationMonthlyDeficit: 13000,
};
