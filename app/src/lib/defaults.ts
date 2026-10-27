/* ============================================================
   BIRR — starting data

   Every figure here is a PLACEHOLDER so the app has something to
   work with on first run. None of it is anyone's real money.
   The Setup screen replaces all of it, section by section, and
   `confirmed` tracks which parts are real yet.
   ============================================================ */

import type { Data, ISODate } from './types';
import { iso, addDays } from './engine';

export function todayISO(): ISODate { return iso(new Date()); }

export function uid(prefix = 'x'): string {
  return prefix + Math.random().toString(36).slice(2, 10);
}

export const DEFAULT_CATEGORIES = [
  'Groceries', 'Transport', 'Child', 'Family support', 'Utilities',
  'Eating out', 'Airtime', 'Health', 'Church', 'Rent', 'Debt', 'Ekub', 'Other',
];

export function makeDefaultData(today: ISODate = todayISO()): Data {
  // anchor the placeholder history a little before today
  const opened = iso(addDays(new Date(today.split('-').map(Number)[0],
    Number(today.split('-')[1]) - 1, Number(today.split('-')[2])), -12));

  return {
    version: 1,
    meta: { asOf: today, currency: 'ETB', ownerName: '' },

    confirmed: {
      accounts: false, income: false, bills: false, loan: false,
      ekub: false, relocation: false, budgets: false,
    },

    policy: {
      bufferAmount: 3000,
      lateIncomeDays: 10,
      stressOverrun: 0.15,
      driftAlertThreshold: 50,
    },

    accounts: [
      { id: 'cbe', name: 'CBE', type: 'bank', provider: 'CBE', senderIds: ['CBE'], opening: 12400, openingDate: opened },
      { id: 'berhan', name: 'Berhan Bank', type: 'bank', provider: 'Berhan', senderIds: ['Berhan'], opening: 3200, openingDate: opened },
      { id: 'dashen', name: 'Dashen Bank', type: 'bank', provider: 'Dashen', senderIds: ['Dashen'], opening: 1800, openingDate: opened },
      { id: 'bunna', name: 'Bunna Bank', type: 'bank', provider: 'Bunna', senderIds: ['Bunna'], opening: 900, openingDate: opened },
      { id: 'telebirr', name: 'telebirr', type: 'mobile', provider: 'telebirr', senderIds: ['127'], opening: 1450, openingDate: opened },
      { id: 'cash', name: 'Cash on hand', type: 'cash', provider: null, senderIds: [], opening: 600, openingDate: opened },
    ],

    categories: [...DEFAULT_CATEGORIES],

    income: [
      {
        id: 'salary', name: 'Salary (net)', accountId: 'cbe', amount: 28000,
        schedule: { type: 'monthly', dayOfMonth: 30 },
        confidence: 'high', netOfLoanDeduction: true, active: true,
      },
      {
        id: 'side', name: 'Side income', accountId: 'telebirr', amount: 4000,
        schedule: { type: 'irregular', dayOfMonth: 15 },
        confidence: 'low', netOfLoanDeduction: false, active: true,
      },
    ],

    bills: [
      { id: 'rent', name: 'Rent', amount: 9000, accountId: 'cbe', category: 'Rent', schedule: { type: 'monthly', dayOfMonth: 1 }, essential: true, active: true },
      { id: 'family', name: 'Family support', amount: 4000, accountId: 'cbe', category: 'Family support', schedule: { type: 'monthly', dayOfMonth: 5 }, essential: true, active: true },
      { id: 'child', name: 'Child / school', amount: 2500, accountId: 'cbe', category: 'Child', schedule: { type: 'monthly', dayOfMonth: 8 }, essential: true, active: true },
      { id: 'transport', name: 'Transport', amount: 2200, accountId: 'cash', category: 'Transport', schedule: { type: 'monthly', dayOfMonth: 1 }, essential: true, active: true },
      { id: 'utilities', name: 'Electricity / water', amount: 900, accountId: 'telebirr', category: 'Utilities', schedule: { type: 'monthly', dayOfMonth: 20 }, essential: true, active: true },
      { id: 'airtime', name: 'Airtime / data', amount: 600, accountId: 'telebirr', category: 'Airtime', schedule: { type: 'monthly', dayOfMonth: 10 }, essential: false, active: true },
      { id: 'church', name: 'Church', amount: 500, accountId: 'cash', category: 'Church', schedule: { type: 'monthly', dayOfMonth: 7 }, essential: false, active: true },
    ],

    loan: {
      enabled: true,
      name: 'Company loan',
      balance: 78557,
      annualRate: 0,
      autoDeductAmount: 16000,
      autoDeductDay: 30,
      deductedFromPayroll: true,
      accountId: 'cbe',
      manualPayments: [],
    },

    ekub: {
      enabled: true,
      name: 'Ekub',
      contributionAmount: 3000,
      frequency: 'monthly',
      totalMembers: 12,
      myPayoutRound: 7,
      startDate: '2026-08-15',
      dayOfMonth: 15,
      accountId: 'cash',
      contributionsPaid: [
        { round: 1, date: '2026-08-15' },
        { round: 2, date: '2026-09-15' },
      ],
    },

    relocation: {
      enabled: true,
      targetDate: '2027-01-01',
      advanceMonths: 3,
      newMonthlyRent: 13000,
      deposit: 0,
      movingCost: 6000,
      otherMonthlyDelta: 800,
    },

    budgets: {
      Groceries: 6000,
      Transport: 2200,
      'Eating out': 800,
      Airtime: 600,
      Health: 1000,
      Child: 2500,
      Other: 1000,
    },

    transactions: [],
    lending: [],
    overrides: {},
    paid: {},
    recon: {},
    inbox: [],
  };
}
