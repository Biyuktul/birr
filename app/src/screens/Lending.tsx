import { useState } from 'react';
import { useStore } from '../lib/store';
import { money, fmtDate, fmtDateFull, daysBetween, addDaysISO } from '../lib/engine';
import { lendMoney, recordRepayment, removeRepayment, removeLending } from '../lib/actions';
import { Card, Tile, Field, NumberInput, useToast } from '../components/ui';
import type { LendingItem } from '../lib/types';

/** The value the account picker uses for "not one of my accounts". */
const ELSEWHERE = '__elsewhere__';

export default function Lending() {
  const { engine, update } = useStore();
  const { toast, show } = useToast();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const status = engine.lendingStatus();
  const openItems = status.items.filter(i => !i.settled);
  const settled = status.items.filter(i => i.settled);

  return (
    <>
      <div className="tiles">
        <Tile
          label="Owed back to you"
          value={<span className="hero">{money(status.outstanding)}</span>}
          color={status.overdueCount > 0 ? 'var(--serious)' : undefined}
          note={openItems.length === 0
            ? 'Nobody owes you anything.'
            : <>{openItems.length} {openItems.length === 1 ? 'person' : 'people'}
              {status.overdueCount > 0 && <> · <strong style={{ color: 'var(--critical)' }}>
                {status.overdueCount} overdue, {money(status.overdueAmount)}</strong></>}</>}
        />
      </div>

      <div className="alert good" style={{ marginTop: 14 }}>
        <span className="ico">i</span>
        <span>
          This money has left your accounts, so it is not part of what you can spend.
          It is counted here, not in your total — and it is kept out of your budget,
          because lending is not spending.
        </span>
      </div>

      {!adding && (
        <div className="btnrow" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={() => setAdding(true)}>
            Lend money to someone
          </button>
        </div>
      )}

      {adding && (
        <LendForm
          onCancel={() => setAdding(false)}
          onSave={input => {
            update(d => lendMoney(d, input));
            setAdding(false);
            show(`${money(input.amount)} lent to ${input.person}`);
          }}
        />
      )}

      {openItems.length > 0 && (
        <Card title="Still out there">
          {openItems.map(i => (
            <LendingRow
              key={i.id}
              item={i}
              isOpen={open === i.id}
              onToggle={() => setOpen(open === i.id ? null : i.id)}
              onRepay={(amount, date, accountId) => {
                update(d => recordRepayment(d, { lendingId: i.id, amount, date, accountId }));
                show(`${i.person} paid back ${money(amount)}`);
              }}
              onRemoveRepayment={rid => {
                update(d => removeRepayment(d, i.id, rid));
                show('Repayment removed');
              }}
              onForget={() => {
                update(d => removeLending(d, i.id));
                setOpen(null);
                show('Removed, and the money is back');
              }}
            />
          ))}
        </Card>
      )}

      {settled.length > 0 && (
        <Card title="Paid back in full" sub={`${settled.length}`}>
          {settled.map(i => (
            <div className="item" key={i.id}>
              <div className="nm">
                {i.person}
                <small>{money(i.amount)} lent {fmtDate(i.lentOn)} · all back</small>
              </div>
              <div className="amt pos">{money(i.repaid)}</div>
              <button
                className="btn ghost sm"
                onClick={() => { update(d => removeLending(d, i.id)); show('Removed'); }}
              >remove</button>
            </div>
          ))}
        </Card>
      )}

      {status.items.length === 0 && !adding && (
        <Card title="Nothing lent out">
          <div className="empty">
            When you lend somebody money, record it here. It comes out of the account you
            paid from, and Birr will remind you when it is due back.
          </div>
        </Card>
      )}
      {toast}
    </>
  );
}

/* ---------- one person's loan ---------- */
function LendingRow({ item, isOpen, onToggle, onRepay, onRemoveRepayment, onForget }: {
  item: LendingItem;
  isOpen: boolean;
  onToggle: () => void;
  onRepay: (amount: number, date: string, accountId: string | null) => void;
  onRemoveRepayment: (id: string) => void;
  onForget: () => void;
}) {
  const { engine } = useStore();
  const [amount, setAmount] = useState(item.outstanding);
  const [date, setDate] = useState(engine.asOf);
  const [into, setInto] = useState<string>(item.accountId ?? ELSEWHERE);

  const dueIn = item.dueOn ? daysBetween(engine.asOf, item.dueOn) : null;

  return (
    <div className="editrow">
      <button className="rowlink" style={{ borderBottom: 'none', padding: '2px 0' }} onClick={onToggle}>
        <span>
          <strong>{item.person}</strong>
          {item.overdue && <> <span className="pill bad">{item.daysLate}d late</span></>}
          <div className="meta" style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
            {money(item.amount)} lent {fmtDate(item.lentOn)} from{' '}
            {item.accountId
              ? (engine.accountById[item.accountId]?.name ?? item.accountId)
              : (item.source || 'outside your accounts')}
            {item.repaid > 0 && <> · {money(item.repaid)} back</>}
            {item.dueOn && <> · due {fmtDate(item.dueOn)}{dueIn !== null && dueIn >= 0 && ` (in ${dueIn}d)`}</>}
            {!item.dueOn && <> · no date agreed</>}
          </div>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>
            {money(item.outstanding)}
          </span>
          <span className="chev">{isOpen ? '⌄' : '›'}</span>
        </span>
      </button>

      {item.repaid > 0 && (
        <div className="bar-track" style={{ marginTop: 8, height: 6 }}>
          <div className="bar-fill" style={{ width: `${(item.repaid / item.amount) * 100}%` }} />
        </div>
      )}

      {isOpen && (
        <div style={{ paddingTop: 12 }}>
          {item.note && (
            <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>{item.note}</div>
          )}

          <div className="grid2">
            <Field label="Amount coming back">
              <NumberInput value={amount} onChange={setAmount} min={0} />
            </Field>
            <Field label="Date">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Back into">
            <select value={into} onChange={e => setInto(e.target.value)}>
              {engine.activeAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
              <option value={ELSEWHERE}>Cash in hand — not into an account</option>
            </select>
          </Field>
          {into === ELSEWHERE && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: -4, marginBottom: 10 }}>
              Recorded as back from {item.person}, but no balance changes.
            </div>
          )}
          <div className="btnrow">
            <button
              className="btn primary"
              disabled={amount <= 0}
              onClick={() => onRepay(amount, date, into === ELSEWHERE ? null : into)}
            >
              {amount >= item.outstanding
                ? `Paid back in full — ${money(item.outstanding)}`
                : `Record ${money(amount)} back`}
            </button>
            <button className="btn danger" onClick={onForget}>Remove</button>
          </div>

          {item.repayments.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--grid)' }}>
              <div className="fld" style={{ marginBottom: 6 }}>Already back</div>
              {item.repayments.map(r => (
                <div className="item" key={r.id} style={{ padding: '5px 0' }}>
                  <div className="nm" style={{ fontSize: 13.5 }}>
                    {fmtDateFull(r.date)}
                    <small>
                      {r.accountId
                        ? <>into {engine.accountById[r.accountId]?.name ?? r.accountId}</>
                        : 'cash in hand — no balance changed'}
                    </small>
                  </div>
                  <div className="amt pos">{money(r.amount)}</div>
                  <button className="btn ghost sm" onClick={() => onRemoveRepayment(r.id)}>
                    undo
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- lending something new ---------- */
function LendForm({ onSave, onCancel }: {
  onSave: (i: {
    person: string; amount: number; accountId: string | null; source?: string;
    lentOn: string; dueOn?: string; note?: string;
  }) => void;
  onCancel: () => void;
}) {
  const { engine } = useStore();
  const [person, setPerson] = useState('');
  const [amount, setAmount] = useState(0);
  const [accountId, setAccountId] = useState<string>(engine.activeAccounts[0]?.id ?? ELSEWHERE);
  const [source, setSource] = useState('');
  const [lentOn, setLentOn] = useState(engine.asOf);
  const [dueOn, setDueOn] = useState('');
  const [note, setNote] = useState('');

  const fromElsewhere = accountId === ELSEWHERE;
  const ready = person.trim().length > 0 && amount > 0;

  return (
    <Card title="Lend money">
      <Field label="To whom">
        <input
          type="text" value={person} onChange={e => setPerson(e.target.value)}
          placeholder="Their name"
        />
      </Field>
      <div className="grid2">
        <Field label="How much">
          <NumberInput value={amount} onChange={setAmount} min={0} />
        </Field>
        <Field label="Where it came from">
          <select value={accountId} onChange={e => setAccountId(e.target.value)}>
            {engine.activeAccounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} — {money(engine.accountBalance(a.id))}
              </option>
            ))}
            <option value={ELSEWHERE}>Somewhere else — not my accounts</option>
          </select>
        </Field>
        <Field label="Given on">
          <input type="date" value={lentOn} onChange={e => setLentOn(e.target.value)} />
        </Field>
        <Field label="Expected back (optional)">
          <input type="date" value={dueOn} onChange={e => setDueOn(e.target.value)} />
        </Field>
      </div>
      {fromElsewhere && (
        <Field label="Where from (optional)">
          <input
            type="text" value={source} onChange={e => setSource(e.target.value)}
            placeholder="cash I was holding, money from my brother…"
          />
        </Field>
      )}
      {!dueOn && (
        <div className="btnrow" style={{ marginBottom: 12 }}>
          {[{ d: 30, l: 'in a month' }, { d: 60, l: '2 months' }, { d: 90, l: '3 months' }].map(o => (
            <button key={o.d} className="btn ghost sm" onClick={() => setDueOn(addDaysISO(lentOn, o.d))}>
              {o.l}
            </button>
          ))}
        </div>
      )}
      <Field label="What for (optional)">
        <input
          type="text" value={note} onChange={e => setNote(e.target.value)}
          placeholder="Medical bill, school fees…"
        />
      </Field>
      <div className="btnrow">
        <button
          className="btn primary"
          disabled={!ready}
          onClick={() => onSave({
            person, amount,
            accountId: fromElsewhere ? null : accountId,
            source: fromElsewhere ? source : undefined,
            lentOn,
            dueOn: dueOn || undefined,
            note: note.trim() || undefined,
          })}
        >
          {ready
            ? <>Lend {money(amount)} to {person.trim()}</>
            : 'Lend money'}
        </button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
        {fromElsewhere
          ? <>None of your balances change — this money never sat in one of your
             accounts. It is still recorded as owed back to you, and you will be
             reminded when it is due.</>
          : <>This takes the money out of the account now. It is not counted as
             spending, and you will be reminded when it is due back.</>}
      </div>
    </Card>
  );
}
