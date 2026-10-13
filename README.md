# Birr

Household finance for Ethiopia. Several bank accounts, income that arrives when
it arrives, a company loan repaid from payroll, an Ekub cycle, bank-SMS capture,
and an honest answer to "can we afford to move?".

**Live app:** https://biyuktul.github.io/birr/ — open in Safari, then
Share → *Add to Home Screen*.

Each person owns their own data. There is no shared pot.

---

## Repository layout

| Path | What it is |
|---|---|
| `app/` | **The real app.** React + TypeScript + Vite, installable PWA. |
| `.github/workflows/deploy.yml` | Builds and deploys to GitHub Pages on every push to `main`. Runs the assertions first. |
| `supabase-setup.sql` | **Run this once** in the Supabase SQL editor. Creates the ledger table and its security rules. |
| `schema.sql` | A fuller relational schema, kept for the day one document per person is not enough. Not in use. |
| `*.js`, `dist/` | The original single-file prototype. Kept for reference; superseded by `app/`. |

## Running the app

```bash
cd app
npm install
npm run dev        # http://localhost:5173, --host so a phone on the same wifi can reach it
npm test           # 61 engine assertions
npm run build      # production build into app/dist
```

Other scripts:

```bash
node e2e.mjs            # drives the built app at iPhone size and checks the real flows
node focus-test.mjs    # proves typing in Setup keeps focus and stores what was typed
node audit.mjs         # edge cases: empty dates, zero accounts, far-future plans, old Safari APIs
node scripts-gen-icons.mjs  # regenerates the app icons
```

## How it is put together

```
app/src/lib/
  types.ts     the data model — one object holds everything a person owns
  engine.ts    the financial engine. Pure functions, no React, no storage, no IO
  parser.ts    bank SMS parser
  selftest.ts  61 assertions, shared by `npm test` AND the in-app Checks screen
  store.tsx    state, persistence and sync
  sync.ts      accounts and syncing, including the planner that decides
               pull / push / stop-and-ask
  defaults.ts  the placeholder figures a new install starts from
```

Everything the app claims about money is computed in `engine.ts`. The Checks
screen runs the assertions **against your own data**, not a fixture — so if a
figure is ever wrong, the app says so instead of showing it.

### The one modelling subtlety

If the loan is repaid by payroll deduction, the income figure must be the
**net amount that actually lands**, with `netOfLoanDeduction` set. Otherwise the
repayment is counted twice — once as missing income, again as cash going out —
and every forecast is wrong by the deduction. There is an assertion for this.

## Entering your figures

All of it is editable in the app under **Setup**. Each section is marked
*placeholder* or *yours*, and the warnings clear as you confirm them. Nothing
needs editing in code.

A new install starts from invented placeholder figures so the app has something
to show. None of it is anyone's real money, and the app says so until you
replace it.

## Getting bank messages in, on an iPhone

iOS does not let **any** app read SMS — not this one, and not a native app
either. The way round it is a Shortcut that forwards the message:

1. Shortcuts → Automation → New → **Message**
2. Sender contains `127` (one automation per bank)
3. Action: **Open URL**
4. URL: `https://biyuktul.github.io/birr/?sender=127&sms=` + the *Shortcut Input* variable
5. Turn off "Ask Before Running" if your iOS version allows it

Birr reads those values on open, files the message in the inbox, and scrubs the
URL so a refresh cannot book it twice.

Whether iOS runs the automation without a tap varies by version — it needs
testing on the actual device.

## Using it on more than one device

Each person gets an account and their own figures. Set it up once:

1. Make a free project at supabase.com
2. Run `supabase-setup.sql` in that project's SQL editor
3. In the app: More → Account, paste the project URL and the **anon** key, then
   sign up
4. Do the same on the other device with the same email

The anon key is designed to be public — row-level security means it only ever
reaches your own row. The **service_role** key must never be pasted anywhere.

### How syncing behaves

The device is always the working copy, so nothing ever waits on the network and
the app works with no signal. Changes go up a couple of seconds after you stop
typing and come down when you open the app.

Every write names the revision it was based on, and the database rejects it if
that revision has moved on. So if both devices changed things while apart, Birr
**stops and asks** rather than picking a winner. `planSync` in `sync.ts` holds
that decision, and its tests sweep every combination to prove local work is
never pulled over.

## Status

**Done** — the app, offline, installable, self-validating; Setup for every
figure; SMS parsing and the Shortcut capture path; Pages deploy; accounts and
multi-device sync.

**Needed** — real SMS samples from telebirr (127), CBE, Berhan, Bunna, Dashen
and M-Pesa, with the account digits masked but the wording and spacing exact.
The parser patterns are reconstructions and will misread real messages until
they are tuned against the real thing.
