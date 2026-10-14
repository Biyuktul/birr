import { useState } from 'react';
import { useStore, exportJSON, importJSON } from '../lib/store';
import { money } from '../lib/engine';
import { uid } from '../lib/defaults';
import {
  SECTIONS, type Section, type AccountType, type Confidence, type Data,
} from '../lib/types';
import { Card, Field, NumberInput, Switch, useToast } from '../components/ui';

/* ============================================================
   Every editor below lives at MODULE level, not inside Setup().

   A component declared inside another component is a brand-new
   function on every render, so React throws the old subtree away
   and builds a fresh one. That destroys the <input> elements —
   the keyboard closes on each keystroke and half-typed numbers
   get mangled. Keeping them out here keeps the inputs alive.
   ============================================================ */

type Update = (fn: (d: Data) => Data) => void;

interface EditorProps {
  data: Data;
  update: Update;
  confirm: (s: Section, v?: boolean) => void;
  show: (m: string) => void;
}

function ConfirmBar({ k, data, confirm, show }: { k: Section } & Omit<EditorProps, 'update'>) {
  const done = data.confirmed[k];
  return (
    <div className="btnrow" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--grid)' }}>
      {!done ? (
        <button className="btn primary" onClick={() => { confirm(k, true); show('Marked as your real figures'); }}>
          These are my real figures
        </button>
      ) : (
        <button className="btn ghost" onClick={() => confirm(k, false)}>
          Mark as placeholder again
        </button>
      )}
    </div>
  );
}

/* ---------------- accounts ---------------- */
function AccountsEditor({ data, update, confirm, show }: EditorProps) {
  const setAcct = (id: string, f: (a: Data['accounts'][number]) => Data['accounts'][number]) =>
    update(d => ({ ...d, accounts: d.accounts.map(x => (x.id === id ? f(x) : x)) }));

  return (
    <div style={{ paddingTop: 10 }}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        Take every opening balance on the <strong>same day</strong>, otherwise the combined
        figure is a mixture of different moments and nothing reconciles.
      </div>
      {data.accounts.map(a => (
        <div className="editrow" key={a.id}>
          <div className="head">
            <input
              type="text" value={a.name} style={{ fontWeight: 650 }}
              onChange={e => setAcct(a.id, x => ({ ...x, name: e.target.value }))}
            />
            <button
              className="btn ghost sm"
              onClick={() => update(d => ({ ...d, accounts: d.accounts.filter(x => x.id !== a.id) }))}
            >remove</button>
          </div>
          <div className="grid2">
            <Field label="Opening balance">
              <NumberInput value={a.opening} onChange={v => setAcct(a.id, x => ({ ...x, opening: v }))} />
            </Field>
            <Field label="On this date">
              <input type="date" value={a.openingDate}
                onChange={e => setAcct(a.id, x => ({ ...x, openingDate: e.target.value }))} />
            </Field>
            <Field label="Kind">
              <select value={a.type}
                onChange={e => setAcct(a.id, x => ({ ...x, type: e.target.value as AccountType }))}>
                <option value="bank">Bank</option>
                <option value="mobile">Mobile money</option>
                <option value="cash">Cash</option>
              </select>
            </Field>
            <Field label="SMS sender IDs (comma separated)">
              <input
                type="text" value={a.senderIds.join(', ')} placeholder="127, CBE"
                autoCapitalize="off" autoCorrect="off"
                onChange={e => setAcct(a.id, x => ({
                  ...x, senderIds: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                }))}
              />
            </Field>
          </div>
          <Switch
            label="Archived" hint="keeps the history but leaves it out of your total"
            checked={!!a.archived}
            onChange={v => setAcct(a.id, x => ({ ...x, archived: v }))}
          />
        </div>
      ))}
      <button
        className="btn"
        onClick={() => update(d => ({
          ...d,
          accounts: [...d.accounts, {
            id: uid('a'), name: 'New account', type: 'bank', provider: null,
            senderIds: [], opening: 0, openingDate: d.meta.asOf,
          }],
        }))}
      >Add an account</button>
      <ConfirmBar k="accounts" data={data} confirm={confirm} show={show} />
    </div>
  );
}

/* ---------------- income ---------------- */
function IncomeEditor({ data, update, confirm, show }: EditorProps) {
  const setInc = (id: string, f: (i: Data['income'][number]) => Data['income'][number]) =>
    update(d => ({ ...d, income: d.income.map(x => (x.id === id ? f(x) : x)) }));

  return (
    <div style={{ paddingTop: 10 }}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        Enter what <strong>actually lands</strong>. If your employer takes the loan repayment
        out before you see it, tick the box below so Birr does not subtract it twice.
      </div>
      {data.income.map(i => (
        <div className="editrow" key={i.id}>
          <div className="head">
            <input type="text" value={i.name} style={{ fontWeight: 650 }}
              onChange={e => setInc(i.id, x => ({ ...x, name: e.target.value }))} />
            <button className="btn ghost sm"
              onClick={() => update(d => ({ ...d, income: d.income.filter(x => x.id !== i.id) }))}>remove</button>
          </div>
          <div className="grid2">
            <Field label="Amount that lands">
              <NumberInput value={i.amount} onChange={v => setInc(i.id, x => ({ ...x, amount: v }))} />
            </Field>
            <Field label="Day of the month">
              <NumberInput
                value={i.schedule.dayOfMonth ?? 1} min={1} step={1}
                onChange={v => setInc(i.id, x => ({
                  ...x, schedule: { ...x.schedule, dayOfMonth: Math.min(31, Math.max(1, Math.round(v))) },
                }))}
              />
            </Field>
            <Field label="Into which account">
              <select value={i.accountId}
                onChange={e => setInc(i.id, x => ({ ...x, accountId: e.target.value }))}>
                {data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="How dependable">
              <select value={i.confidence}
                onChange={e => setInc(i.id, x => ({ ...x, confidence: e.target.value as Confidence }))}>
                <option value="high">Can plan around it</option>
                <option value="medium">Usually arrives, timing slips</option>
                <option value="low">Do not count on it</option>
              </select>
            </Field>
          </div>
          <Switch
            label="Loan repayment already taken out"
            hint="the amount above is what reaches you after payroll deducts it"
            checked={i.netOfLoanDeduction}
            onChange={v => setInc(i.id, x => ({ ...x, netOfLoanDeduction: v }))}
          />
          <Switch label="Active" checked={i.active}
            onChange={v => setInc(i.id, x => ({ ...x, active: v }))} />
        </div>
      ))}
      <button
        className="btn"
        onClick={() => update(d => ({
          ...d,
          income: [...d.income, {
            id: uid('i'), name: 'New income', accountId: d.accounts[0]?.id ?? '', amount: 0,
            schedule: { type: 'monthly', dayOfMonth: 1 }, confidence: 'medium',
            netOfLoanDeduction: false, active: true,
          }],
        }))}
      >Add income</button>
      <ConfirmBar k="income" data={data} confirm={confirm} show={show} />
    </div>
  );
}

/* ---------------- bills ---------------- */
function BillsEditor({ data, update, confirm, show }: EditorProps) {
  const setBill = (id: string, f: (b: Data['bills'][number]) => Data['bills'][number]) =>
    update(d => ({ ...d, bills: d.bills.map(x => (x.id === id ? f(x) : x)) }));

  return (
    <div style={{ paddingTop: 10 }}>
      {data.bills.map(b => (
        <div className="editrow" key={b.id}>
          <div className="head">
            <input type="text" value={b.name} style={{ fontWeight: 650 }}
              onChange={e => setBill(b.id, x => ({ ...x, name: e.target.value }))} />
            <button className="btn ghost sm"
              onClick={() => update(d => ({ ...d, bills: d.bills.filter(x => x.id !== b.id) }))}>remove</button>
          </div>
          <div className="grid2">
            <Field label="Amount">
              <NumberInput value={b.amount} onChange={v => setBill(b.id, x => ({ ...x, amount: v }))} />
            </Field>
            <Field label="Day of the month">
              <NumberInput
                value={b.schedule.dayOfMonth ?? 1} min={1} step={1}
                onChange={v => setBill(b.id, x => ({
                  ...x, schedule: { ...x.schedule, dayOfMonth: Math.min(31, Math.max(1, Math.round(v))) },
                }))}
              />
            </Field>
            <Field label="Paid from">
              <select value={b.accountId}
                onChange={e => setBill(b.id, x => ({ ...x, accountId: e.target.value }))}>
                {data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select value={b.category}
                onChange={e => setBill(b.id, x => ({ ...x, category: e.target.value }))}>
                {data.categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Switch label="Essential" hint="something you cannot simply skip" checked={b.essential}
            onChange={v => setBill(b.id, x => ({ ...x, essential: v }))} />
          <Switch label="Active" checked={b.active}
            onChange={v => setBill(b.id, x => ({ ...x, active: v }))} />
        </div>
      ))}
      <button
        className="btn"
        onClick={() => update(d => ({
          ...d,
          bills: [...d.bills, {
            id: uid('b'), name: 'New bill', amount: 0, accountId: d.accounts[0]?.id ?? '',
            category: 'Other', schedule: { type: 'monthly', dayOfMonth: 1 },
            essential: true, active: true,
          }],
        }))}
      >Add a bill</button>
      <ConfirmBar k="bills" data={data} confirm={confirm} show={show} />
    </div>
  );
}

/* ---------------- loan ---------------- */
function LoanEditor({ data, update, confirm, show }: EditorProps) {
  const L = data.loan;
  const set = (f: Partial<Data['loan']>) => update(d => ({ ...d, loan: { ...d.loan, ...f } }));
  return (
    <div style={{ paddingTop: 10 }}>
      <Switch label="I have a loan" checked={L.enabled} onChange={v => set({ enabled: v })} />
      {L.enabled && (
        <>
          <Field label="What it is called">
            <input type="text" value={L.name} onChange={e => set({ name: e.target.value })} />
          </Field>
          <div className="grid2">
            <Field label="Outstanding balance">
              <NumberInput
                value={L.balance}
                onChange={v => set({ balance: v, balanceAsOf: data.meta.asOf })}
              />
            </Field>
            <Field label="Interest rate (% a year)">
              <NumberInput value={L.annualRate * 100} onChange={v => set({ annualRate: v / 100 })} />
            </Field>
            <Field label="Taken each month">
              <NumberInput value={L.autoDeductAmount} onChange={v => set({ autoDeductAmount: v })} />
            </Field>
            <Field label="On which day">
              <NumberInput value={L.autoDeductDay} min={1} step={1}
                onChange={v => set({ autoDeductDay: Math.min(31, Math.max(1, Math.round(v))) })} />
            </Field>
          </div>
          <Switch
            label="Taken from my pay automatically"
            hint="payroll deducts it before the money reaches me"
            checked={L.deductedFromPayroll}
            onChange={v => set({ deductedFromPayroll: v })}
          />
          <div className="muted" style={{ fontSize: 12.5 }}>
            A company loan is often 0%. If yours is, leave the rate at zero.
            {(L.manualPayments || []).length > 0 && (
              <> Payments you record are taken off this figure, so enter what the lender
              says you owe{L.balanceAsOf ? ` as of ${L.balanceAsOf}` : ' today'} — not what is left after your own payments.</>
            )}
          </div>
        </>
      )}
      <ConfirmBar k="loan" data={data} confirm={confirm} show={show} />
    </div>
  );
}

/* ---------------- ekub ---------------- */
function EkubEditor({ data, update, confirm, show }: EditorProps) {
  const E = data.ekub;
  const set = (f: Partial<Data['ekub']>) => update(d => ({ ...d, ekub: { ...d.ekub, ...f } }));
  return (
    <div style={{ paddingTop: 10 }}>
      <Switch label="I am in an Ekub" checked={E.enabled} onChange={v => set({ enabled: v })} />
      {E.enabled && (
        <>
          <div className="grid2">
            <Field label="Contribution each round">
              <NumberInput value={E.contributionAmount} onChange={v => set({ contributionAmount: v })} />
            </Field>
            <Field label="How many members">
              <NumberInput value={E.totalMembers} min={1} step={1}
                onChange={v => set({ totalMembers: Math.max(1, Math.round(v)) })} />
            </Field>
            <Field label="Which round is yours">
              <NumberInput value={E.myPayoutRound} min={1} step={1}
                onChange={v => set({ myPayoutRound: Math.max(1, Math.round(v)) })} />
            </Field>
            <Field label="How often">
              <select value={E.frequency} onChange={e => set({ frequency: e.target.value as 'monthly' | 'weekly' })}>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
              </select>
            </Field>
            <Field label="Date of round 1">
              <input type="date" value={E.startDate} onChange={e => set({ startDate: e.target.value })} />
            </Field>
            <Field label="Day of the month">
              <NumberInput value={E.dayOfMonth} min={1} step={1}
                onChange={v => set({ dayOfMonth: Math.min(31, Math.max(1, Math.round(v))) })} />
            </Field>
          </div>
          {E.myPayoutRound > E.totalMembers && (
            <div className="alert danger">
              <span className="ico">!</span>
              <span>Your round ({E.myPayoutRound}) is beyond the number of members ({E.totalMembers}).</span>
            </div>
          )}
          <div className="muted" style={{ fontSize: 12.5 }}>
            Payout works out at {money(E.contributionAmount * E.totalMembers)}. Mark rounds
            paid on the Ekub screen.
          </div>
        </>
      )}
      <ConfirmBar k="ekub" data={data} confirm={confirm} show={show} />
    </div>
  );
}

/* ---------------- relocation ---------------- */
function RelocationEditor({ data, update, confirm, show }: EditorProps) {
  const R = data.relocation;
  const set = (f: Partial<Data['relocation']>) =>
    update(d => ({ ...d, relocation: { ...d.relocation, ...f } }));
  return (
    <div style={{ paddingTop: 10 }}>
      <Switch label="I am planning a move" checked={R.enabled} onChange={v => set({ enabled: v })} />
      {R.enabled && (
        <div className="grid2">
          <Field label="Target date">
            <input type="date" value={R.targetDate} onChange={e => set({ targetDate: e.target.value })} />
          </Field>
          <Field label="New monthly rent">
            <NumberInput value={R.newMonthlyRent} onChange={v => set({ newMonthlyRent: v })} />
          </Field>
          <Field label="Months of rent demanded up front">
            <NumberInput value={R.advanceMonths} min={0} step={1}
              onChange={v => set({ advanceMonths: Math.max(0, Math.round(v)) })} />
          </Field>
          <Field label="Deposit">
            <NumberInput value={R.deposit} onChange={v => set({ deposit: v })} />
          </Field>
          <Field label="Moving costs">
            <NumberInput value={R.movingCost} onChange={v => set({ movingCost: v })} />
          </Field>
          <Field label="Other monthly costs change by">
            <NumberInput value={R.otherMonthlyDelta} onChange={v => set({ otherMonthlyDelta: v })} />
          </Field>
        </div>
      )}
      <ConfirmBar k="relocation" data={data} confirm={confirm} show={show} />
    </div>
  );
}

/* ---------------- budgets ---------------- */
function BudgetsEditor({ data, update, confirm, show }: EditorProps) {
  return (
    <div style={{ paddingTop: 10 }}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        A monthly cap per category. Leave a category out if you do not want to cap it.
      </div>
      {Object.keys(data.budgets).map(c => (
        <div key={c} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="fld">{c}</label>
            <NumberInput
              value={data.budgets[c]}
              onChange={v => update(d => ({ ...d, budgets: { ...d.budgets, [c]: v } }))}
            />
          </div>
          <button
            className="btn ghost sm"
            onClick={() => update(d => {
              const b = { ...d.budgets }; delete b[c]; return { ...d, budgets: b };
            })}
          >remove</button>
        </div>
      ))}
      <select
        value=""
        onChange={e => {
          const c = e.target.value;
          if (c) update(d => ({ ...d, budgets: { ...d.budgets, [c]: 0 } }));
        }}
      >
        <option value="">Add a category cap…</option>
        {data.categories.filter(c => !(c in data.budgets)).map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <ConfirmBar k="budgets" data={data} confirm={confirm} show={show} />
    </div>
  );
}

/* ---------------- settings, backup, reset ---------------- */
function DataEditor({ data, update, show, reset }: Omit<EditorProps, 'confirm'> & { reset: () => void }) {
  const [text, setText] = useState('');
  const [backup, setBackup] = useState<string | null>(null);

  return (
    <div style={{ paddingTop: 10 }}>
      <div className="grid2">
        <Field label="Buffer you never spend">
          <NumberInput value={data.policy.bufferAmount}
            onChange={v => update(d => ({ ...d, policy: { ...d.policy, bufferAmount: v } }))} />
        </Field>
        <Field label="Days income might be late">
          <NumberInput value={data.policy.lateIncomeDays} min={0} step={1}
            onChange={v => update(d => ({
              ...d, policy: { ...d.policy, lateIncomeDays: Math.max(0, Math.round(v)) },
            }))} />
        </Field>
      </div>

      <div className="btnrow" style={{ marginTop: 10 }}>
        <button
          className="btn"
          onClick={() => {
            const blob = new Blob([exportJSON(data)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `birr-backup-${data.meta.asOf}.json`;
            a.click();
            URL.revokeObjectURL(url);
            show('Backup downloaded');
          }}
        >Download a backup</button>
        {/* Downloads are blocked in some embedded viewers, so there is always
            a plain-text route out of the app that cannot be taken away. */}
        <button className="btn" onClick={() => setBackup(b => (b ? null : exportJSON(data)))}>
          {backup ? 'Hide backup text' : 'Show backup text'}
        </button>
        {backup && (
          <button
            className="btn"
            onClick={async () => {
              try { await navigator.clipboard.writeText(backup); show('Copied'); }
              catch { show('Select the text and copy it by hand'); }
            }}
          >Copy</button>
        )}
      </div>

      {backup && (
        <>
          <textarea
            readOnly value={backup} onFocus={e => e.currentTarget.select()}
            style={{ marginTop: 10, minHeight: 150, fontSize: 12 }}
          />
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
            Copy this somewhere safe — a note to yourself, an email. Pasting it back into
            the box below restores everything.
          </div>
        </>
      )}

      <Field label="Restore from a backup (paste the file contents)">
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="{ … }" />
      </Field>
      <div className="btnrow">
        <button
          className="btn"
          disabled={!text.trim()}
          onClick={() => {
            const r = importJSON(text);
            if ('error' in r) { show(r.error); return; }
            update(() => r);
            setText('');
            show('Restored');
          }}
        >Restore</button>
        <button
          className="btn danger"
          onClick={() => {
            if (window.confirm('Erase everything on this device and start again from placeholders?')) {
              reset(); show('Started over');
            }
          }}
        >Erase and start again</button>
      </div>

      <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
        Everything lives on this device only. Clearing your browser data, or deleting the
        app from your home screen, takes it with it — so take a backup now and then until
        the sync is built.
      </div>
    </div>
  );
}

const EDITORS: Record<Section, (p: EditorProps) => JSX.Element> = {
  accounts: AccountsEditor,
  income: IncomeEditor,
  bills: BillsEditor,
  loan: LoanEditor,
  ekub: EkubEditor,
  relocation: RelocationEditor,
  budgets: BudgetsEditor,
};

/* ============================================================
   The screen itself
   ============================================================ */
export default function Setup() {
  const { data, update, confirm, reset } = useStore();
  const { toast, show } = useToast();
  const [open, setOpen] = useState<Section | 'data' | null>(null);

  const toggle = (s: Section | 'data') => setOpen(o => (o === s ? null : s));
  const unconfirmed = SECTIONS.filter(s => !data.confirmed[s.key]);

  return (
    <>
      {unconfirmed.length > 0 ? (
        <div className="seedwarn">
          <h3>{unconfirmed.length} section{unconfirmed.length === 1 ? '' : 's'} still hold placeholder numbers</h3>
          <p>
            Work through the ones marked <em>placeholder</em>. Each asks for what it needs and
            nothing more. Mark a section as yours when the figures in it are real — the warnings
            disappear as you go.
          </p>
        </div>
      ) : (
        <div className="alert good" style={{ marginTop: 14 }}>
          <span className="ico">✓</span>
          <span>Every section holds your own figures. Nothing in the app is invented any more.</span>
        </div>
      )}

      <Card title="Your figures">
        {SECTIONS.map(s => {
          const Editor = EDITORS[s.key];
          const isOpen = open === s.key;
          return (
            <div key={s.key}>
              <button
                className="rowlink"
                onClick={() => toggle(s.key)}
                style={isOpen ? { borderBottom: 'none' } : undefined}
              >
                <span>
                  {s.label}
                  <div className="meta" style={{ fontWeight: 400 }}>{s.why}</div>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {data.confirmed[s.key]
                    ? <span className="pill ok">yours</span>
                    : <span className="pill warn">placeholder</span>}
                  <span className="chev">{isOpen ? '⌄' : '›'}</span>
                </span>
              </button>
              {isOpen && <Editor data={data} update={update} confirm={confirm} show={show} />}
            </div>
          );
        })}
      </Card>

      <Card title="App and data">
        <button className="rowlink" onClick={() => toggle('data')} style={{ borderBottom: 'none' }}>
          <span>Settings, backup and reset</span>
          <span className="chev">{open === 'data' ? '⌄' : '›'}</span>
        </button>
        {open === 'data' && <DataEditor data={data} update={update} show={show} reset={reset} />}
      </Card>
      {toast}
    </>
  );
}
