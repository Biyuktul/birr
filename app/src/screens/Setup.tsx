import { useState } from 'react';
import { useStore, exportJSON, importJSON } from '../lib/store';
import { money } from '../lib/engine';
import { uid } from '../lib/defaults';
import { SECTIONS, type Section, type AccountType, type Confidence } from '../lib/types';
import { Card, Field, NumberInput, Switch, useToast } from '../components/ui';

export default function Setup() {
  const { data, update, confirm, reset } = useStore();
  const { toast, show } = useToast();
  const [open, setOpen] = useState<Section | 'data' | null>(null);

  const toggle = (s: Section | 'data') => setOpen(o => (o === s ? null : s));

  function SectionHead({ k }: { k: Section }) {
    const meta = SECTIONS.find(s => s.key === k)!;
    const done = data.confirmed[k];
    return (
      <button
        className="rowlink"
        onClick={() => toggle(k)}
        style={{ borderBottom: open === k ? 'none' : undefined }}
      >
        <span>
          {meta.label}
          <div className="meta" style={{ fontWeight: 400 }}>{meta.why}</div>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {done ? <span className="pill ok">yours</span> : <span className="pill warn">placeholder</span>}
          <span className="chev">{open === k ? '⌄' : '›'}</span>
        </span>
      </button>
    );
  }

  function ConfirmBar({ k }: { k: Section }) {
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
  function AccountsEditor() {
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
                type="text" value={a.name}
                onChange={e => update(d => ({ ...d, accounts: d.accounts.map(x => x.id === a.id ? { ...x, name: e.target.value } : x) }))}
                style={{ fontWeight: 650 }}
              />
              <button
                className="btn ghost sm"
                onClick={() => update(d => ({ ...d, accounts: d.accounts.filter(x => x.id !== a.id) }))}
              >remove</button>
            </div>
            <div className="grid2">
              <Field label="Opening balance">
                <NumberInput value={a.opening} onChange={v => update(d => ({ ...d, accounts: d.accounts.map(x => x.id === a.id ? { ...x, opening: v } : x) }))} />
              </Field>
              <Field label="On this date">
                <input type="date" value={a.openingDate}
                  onChange={e => update(d => ({ ...d, accounts: d.accounts.map(x => x.id === a.id ? { ...x, openingDate: e.target.value } : x) }))} />
              </Field>
              <Field label="Kind">
                <select value={a.type}
                  onChange={e => update(d => ({ ...d, accounts: d.accounts.map(x => x.id === a.id ? { ...x, type: e.target.value as AccountType } : x) }))}>
                  <option value="bank">Bank</option>
                  <option value="mobile">Mobile money</option>
                  <option value="cash">Cash</option>
                </select>
              </Field>
              <Field label="SMS sender IDs (comma separated)">
                <input type="text" value={a.senderIds.join(', ')} placeholder="127, CBE"
                  autoCapitalize="off" autoCorrect="off"
                  onChange={e => update(d => ({ ...d, accounts: d.accounts.map(x => x.id === a.id ? { ...x, senderIds: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } : x) }))} />
              </Field>
            </div>
            <Switch
              label="Archived"
              hint="keeps the history but leaves it out of your total"
              checked={!!a.archived}
              onChange={v => update(d => ({ ...d, accounts: d.accounts.map(x => x.id === a.id ? { ...x, archived: v } : x) }))}
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
        <ConfirmBar k="accounts" />
      </div>
    );
  }

  /* ---------------- income ---------------- */
  function IncomeEditor() {
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
                onChange={e => update(d => ({ ...d, income: d.income.map(x => x.id === i.id ? { ...x, name: e.target.value } : x) }))} />
              <button className="btn ghost sm"
                onClick={() => update(d => ({ ...d, income: d.income.filter(x => x.id !== i.id) }))}>remove</button>
            </div>
            <div className="grid2">
              <Field label="Amount that lands">
                <NumberInput value={i.amount} onChange={v => update(d => ({ ...d, income: d.income.map(x => x.id === i.id ? { ...x, amount: v } : x) }))} />
              </Field>
              <Field label="Day of the month">
                <NumberInput value={i.schedule.dayOfMonth ?? 1} min={1} step={1}
                  onChange={v => update(d => ({ ...d, income: d.income.map(x => x.id === i.id ? { ...x, schedule: { ...x.schedule, dayOfMonth: Math.min(31, Math.max(1, Math.round(v))) } } : x) }))} />
              </Field>
              <Field label="Into which account">
                <select value={i.accountId}
                  onChange={e => update(d => ({ ...d, income: d.income.map(x => x.id === i.id ? { ...x, accountId: e.target.value } : x) }))}>
                  {data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="How dependable">
                <select value={i.confidence}
                  onChange={e => update(d => ({ ...d, income: d.income.map(x => x.id === i.id ? { ...x, confidence: e.target.value as Confidence } : x) }))}>
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
              onChange={v => update(d => ({ ...d, income: d.income.map(x => x.id === i.id ? { ...x, netOfLoanDeduction: v } : x) }))}
            />
            <Switch label="Active" checked={i.active}
              onChange={v => update(d => ({ ...d, income: d.income.map(x => x.id === i.id ? { ...x, active: v } : x) }))} />
          </div>
        ))}
        <button className="btn"
          onClick={() => update(d => ({
            ...d,
            income: [...d.income, {
              id: uid('i'), name: 'New income', accountId: d.accounts[0]?.id ?? '', amount: 0,
              schedule: { type: 'monthly', dayOfMonth: 1 }, confidence: 'medium',
              netOfLoanDeduction: false, active: true,
            }],
          }))}
        >Add income</button>
        <ConfirmBar k="income" />
      </div>
    );
  }

  /* ---------------- bills ---------------- */
  function BillsEditor() {
    return (
      <div style={{ paddingTop: 10 }}>
        {data.bills.map(b => (
          <div className="editrow" key={b.id}>
            <div className="head">
              <input type="text" value={b.name} style={{ fontWeight: 650 }}
                onChange={e => update(d => ({ ...d, bills: d.bills.map(x => x.id === b.id ? { ...x, name: e.target.value } : x) }))} />
              <button className="btn ghost sm"
                onClick={() => update(d => ({ ...d, bills: d.bills.filter(x => x.id !== b.id) }))}>remove</button>
            </div>
            <div className="grid2">
              <Field label="Amount">
                <NumberInput value={b.amount} onChange={v => update(d => ({ ...d, bills: d.bills.map(x => x.id === b.id ? { ...x, amount: v } : x) }))} />
              </Field>
              <Field label="Day of the month">
                <NumberInput value={b.schedule.dayOfMonth ?? 1} min={1} step={1}
                  onChange={v => update(d => ({ ...d, bills: d.bills.map(x => x.id === b.id ? { ...x, schedule: { ...x.schedule, dayOfMonth: Math.min(31, Math.max(1, Math.round(v))) } } : x) }))} />
              </Field>
              <Field label="Paid from">
                <select value={b.accountId}
                  onChange={e => update(d => ({ ...d, bills: d.bills.map(x => x.id === b.id ? { ...x, accountId: e.target.value } : x) }))}>
                  {data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="Category">
                <select value={b.category}
                  onChange={e => update(d => ({ ...d, bills: d.bills.map(x => x.id === b.id ? { ...x, category: e.target.value } : x) }))}>
                  {data.categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
            <Switch label="Essential" hint="something you cannot simply skip" checked={b.essential}
              onChange={v => update(d => ({ ...d, bills: d.bills.map(x => x.id === b.id ? { ...x, essential: v } : x) }))} />
            <Switch label="Active" checked={b.active}
              onChange={v => update(d => ({ ...d, bills: d.bills.map(x => x.id === b.id ? { ...x, active: v } : x) }))} />
          </div>
        ))}
        <button className="btn"
          onClick={() => update(d => ({
            ...d,
            bills: [...d.bills, {
              id: uid('b'), name: 'New bill', amount: 0, accountId: d.accounts[0]?.id ?? '',
              category: 'Other', schedule: { type: 'monthly', dayOfMonth: 1 },
              essential: true, active: true,
            }],
          }))}
        >Add a bill</button>
        <ConfirmBar k="bills" />
      </div>
    );
  }

  /* ---------------- loan ---------------- */
  function LoanEditor() {
    const L = data.loan;
    const set = (f: Partial<typeof L>) => update(d => ({ ...d, loan: { ...d.loan, ...f } }));
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
                <NumberInput value={L.balance} onChange={v => set({ balance: v })} />
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
            </div>
          </>
        )}
        <ConfirmBar k="loan" />
      </div>
    );
  }

  /* ---------------- ekub ---------------- */
  function EkubEditor() {
    const E = data.ekub;
    const set = (f: Partial<typeof E>) => update(d => ({ ...d, ekub: { ...d.ekub, ...f } }));
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
        <ConfirmBar k="ekub" />
      </div>
    );
  }

  /* ---------------- relocation ---------------- */
  function RelocationEditor() {
    const R = data.relocation;
    const set = (f: Partial<typeof R>) => update(d => ({ ...d, relocation: { ...d.relocation, ...f } }));
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
        <ConfirmBar k="relocation" />
      </div>
    );
  }

  /* ---------------- budgets ---------------- */
  function BudgetsEditor() {
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
        <ConfirmBar k="budgets" />
      </div>
    );
  }

  /* ---------------- data / backup ---------------- */
  function DataEditor() {
    const [text, setText] = useState('');
    return (
      <div style={{ paddingTop: 10 }}>
        <Field label="How cautious Birr should be">
          <div className="grid2">
            <div>
              <label className="fld">Buffer you never spend</label>
              <NumberInput value={data.policy.bufferAmount}
                onChange={v => update(d => ({ ...d, policy: { ...d.policy, bufferAmount: v } }))} />
            </div>
            <div>
              <label className="fld">Days income might be late</label>
              <NumberInput value={data.policy.lateIncomeDays} min={0} step={1}
                onChange={v => update(d => ({ ...d, policy: { ...d.policy, lateIncomeDays: Math.max(0, Math.round(v)) } }))} />
            </div>
          </div>
        </Field>

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
        </div>

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
        {SECTIONS.map(s => (
          <div key={s.key}>
            <SectionHead k={s.key} />
            {open === s.key && (
              s.key === 'accounts' ? <AccountsEditor />
                : s.key === 'income' ? <IncomeEditor />
                  : s.key === 'bills' ? <BillsEditor />
                    : s.key === 'loan' ? <LoanEditor />
                      : s.key === 'ekub' ? <EkubEditor />
                        : s.key === 'relocation' ? <RelocationEditor />
                          : <BudgetsEditor />
            )}
          </div>
        ))}
      </Card>

      <Card title="App and data">
        <button className="rowlink" onClick={() => toggle('data')} style={{ borderBottom: 'none' }}>
          <span>Settings, backup and reset</span>
          <span className="chev">{open === 'data' ? '⌄' : '›'}</span>
        </button>
        {open === 'data' && <DataEditor />}
      </Card>
      {toast}
    </>
  );
}
