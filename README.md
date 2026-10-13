# Birr — household finance, Ethiopia

A prototype that models real household money: six accounts, income that arrives
when it arrives, a company loan repaid from payroll, an Ekub cycle, bank SMS
capture, and an honest answer to "can we afford to move?".

## Run it

```
node build.js        # produces dist/birr.html — one file, no network, no install
```

Open `dist/birr.html` in any browser. All state lives in that browser
(`localStorage`); nothing leaves the machine.

```
node run-tests.js    # 51 engine assertions, in the terminal
node verify-ui.js    # renders all 10 screens in a stubbed DOM
node shot.js         # screenshots light/dark/mobile via Chromium
```

The **Checks** tab runs the same 51 assertions live in the browser. If any fail,
nothing on the other screens should be believed.

## Read this first

**The numbers in `seed.js` are placeholders, not your money.** The previous
session's real data was lost when its container was reclaimed, before anything
was committed. The engine is correct; its inputs are invented. Every screen
carries a banner saying so until the seed is replaced.

Edit **`seed.js`** only — it is the single source of truth. Everything marked
`// ?? PLACEHOLDER` needs a real value.

## Files

| File | What it is |
|---|---|
| `seed.js` | **The only file you edit.** Accounts, income, bills, loan, Ekub, relocation, budgets. |
| `engine.js` | Pure financial engine. No DOM, no storage. Every claim the app makes is computed here. |
| `parser.js` | Bank SMS parser. Per-provider patterns + a generic extractor, with a confidence score. |
| `tests.js` | 51 assertions against the engine and parser. |
| `ui.js` | The 10 screens. |
| `styles.css` | Validated colour palette, light and dark. |
| `build.js` | Inlines everything into `dist/birr.html`. |
| `schema.sql` | PostgreSQL schema for the real app (not used by the prototype). |

## What the engine actually does

- **Balances** — opening balance plus transactions, per account and combined.
  Transactions dated before an account's opening are ignored, so the opening
  figure is never double-counted.
- **Safe to spend** — combined balance, minus every commitment falling due
  before the next *dependable* payday, minus a buffer you refuse to touch.
  Never shows a negative number; reports a shortfall instead.
- **Loan** — monthly amortisation with the payroll deduction and any manual
  payments, interest accrued monthly, final payment clamped so it cannot
  overpay. Detects the case where the deduction never clears the balance.
- **Ekub** — rounds paid, next due, payout round and amount. Makes the point
  that a cycle nets to zero and what you are actually buying is *timing*.
- **Forecast** — daily balance over 30/60/90/180 days under three scenarios:
  income on time, income late, and late plus an overspend. Late is never
  rosier than base; stress is never rosier than late (both asserted).
- **Relocation** — upfront cash needed vs cash you will actually have at the
  target date under the *late* scenario, plus the monthly position afterwards.
  Gives a verdict and what would have to change.
- **Reconciliation** — the bank's stated balance vs Birr's calculated one, with
  a drift alert. This is what catches a missed transaction or a silent fee.

### One modelling subtlety worth knowing

If the loan is repaid by payroll deduction, the salary figure in `seed.js` must
be the **net amount that actually lands**, and `netOfLoanDeduction: true` must be
set. Otherwise the repayment gets counted twice — once as missing income and
again as a cash outflow — and every forecast is wrong by the deduction amount.
There is an assertion for this.

## Open decisions (carried forward — these still block the real app)

### 1. Platform — the big one

| | SMS auto-capture | Cost | Notes |
|---|---|---|---|
| **Android only** | Full, automatic | Free sideload | The whole loop works. Recommended. |
| **iPhone only** | **None.** Apple forbids SMS access | $99/year developer account | Falls back to iOS Shortcuts automation or pasting into the Inbox screen. |
| **Both** | Android full, iPhone degraded | $99/year + extra work | Two capture paths to maintain. |

This changes effort, cost, and whether the central feature works at all.

### 2. Real SMS samples

2–3 per provider — **telebirr (127), CBE, Berhan, Bunna, Dashen, M-Pesa**.
Mask the account digits, but keep the wording, spacing and punctuation exactly.
The patterns in `parser.js` are reconstructions and will mis-read real messages
until tuned. Also needed: the **sender ID exactly as it appears** on the phone.

### 3. Seed data

Everything in the banner on the Home screen, listed in `seed.js` as
`NEEDS_CONFIRMATION`.

### 4. Household

Is this shared with your wife from day one (two logins, one household, row-level
security) or single-user first? `schema.sql` is built for shared from day one,
which costs nothing now and is painful to retrofit later.

## If the real app gets built

React Native + Expo + TypeScript, Supabase/PostgreSQL with row-level security,
Expo Router, React Hook Form + Zod. `engine.js` ports across essentially
unchanged — it is already pure, typed by shape, and covered by the assertions
in `tests.js`.

## Keep this repository

This work was rebuilt once already because nothing was committed. Push it
somewhere before the container is reclaimed.
