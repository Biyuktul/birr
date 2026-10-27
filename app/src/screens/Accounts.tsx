import { useState } from 'react';
import { useStore } from '../lib/store';
import { money, fmtDate } from '../lib/engine';
import { setAccountBalance } from '../lib/actions';
import { parseMessage } from '../lib/parser';
import { Card, Tile, NumberInput, useToast } from '../components/ui';

export default function Accounts() {
  const { data, engine, update } = useStore();
  const { toast, show } = useToast();
  const [open, setOpen] = useState<string | null>(null);

  const total = engine.combinedBalance();
  const accounts = engine.activeAccounts;

  function removeTx(id: string) {
    update(d => ({ ...d, transactions: d.transactions.filter(t => t.id !== id) }));
    show('Deleted');
  }

  const recent = [...data.transactions].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 50);

  return (
    <>
      <div className="tiles">
        <Tile
          label="Everything you have"
          value={<span className="hero">{money(total)}</span>}
          note={`Across ${accounts.length} account${accounts.length === 1 ? '' : 's'}`}
        />
      </div>

      <Card title="Where it sits" sub="tap an account to correct what it holds">
        {!accounts.length && (
          <div className="empty">No accounts yet. Add them under Setup → Accounts.</div>
        )}

        {accounts.map(a => {
          const bal = engine.accountBalance(a.id);
          const share = total > 0 ? Math.max(0, bal) / total : 0;
          const isOpen = open === a.id;
          return (
            <div className="editrow" key={a.id}>
              <button
                className="rowlink"
                style={{ borderBottom: 'none', padding: '2px 0' }}
                onClick={() => setOpen(isOpen ? null : a.id)}
              >
                <span>
                  <strong>{a.name}</strong>
                  <div className="meta" style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
                    {engine.accountPurpose(a.id)
                      ? <>for {engine.accountPurpose(a.id)}</>
                      : <>{a.type === 'mobile' ? 'mobile money' : a.type}</>}
                    {a.senderIds.length ? ` · ${a.senderIds.join(', ')}` : ''}
                  </div>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>
                    {money(bal)}
                  </span>
                  <span className="chev">{isOpen ? '⌄' : '›'}</span>
                </span>
              </button>

              <div className="bar-track" style={{ marginTop: 8, height: 6 }}>
                <div className="bar-fill" style={{ width: `${share * 100}%` }} />
              </div>

              {isOpen && (
                <BalanceEditor
                  accountId={a.id}
                  accountName={a.name}
                  current={bal}
                  onDone={() => setOpen(null)}
                />
              )}
            </div>
          );
        })}
      </Card>

      <Card title="Recorded transactions" sub={`${data.transactions.length} total`}>
        {!recent.length && (
          <div className="empty">
            Nothing recorded yet. Correct a balance above, paste a bank message under
            Messages, or mark a bill paid in Coming.
          </div>
        )}
        {recent.length > 0 && (
          <div className="scroll-x">
            <table>
              <thead>
                <tr><th>Date</th><th>Account</th><th>What</th><th className="num">Amount</th><th /></tr>
              </thead>
              <tbody>
                {recent.map(t => (
                  <tr key={t.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                    <td>{engine.accountById[t.accountId]?.name ?? t.accountId}</td>
                    <td>
                      {t.note || '—'}
                      {t.isTransfer && <> <span className="pill">transfer</span></>}
                      {t.isAdjustment && <> <span className="pill">correction</span></>}
                      {t.category && <div className="muted" style={{ fontSize: 12 }}>{t.category}</div>}
                    </td>
                    <td className={`num ${t.amount < 0 ? 'neg' : 'pos'}`}>{money(t.amount)}</td>
                    <td><button className="btn ghost sm" onClick={() => removeTx(t.id)}>delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {toast}
    </>
  );
}

/* ============================================================
   Correcting what an account holds.

   The balance is the opening figure plus everything recorded since, so it is
   not something to overwrite — that would quietly rewrite history. Setting it
   books the difference as a correction you can see and undo.
   ============================================================ */
function BalanceEditor({ accountId, accountName, current, onDone }: {
  accountId: string;
  accountName: string;
  current: number;
  onDone: () => void;
}) {
  const { data, update } = useStore();
  const { toast, show } = useToast();
  const [actual, setActual] = useState(current);
  const [sms, setSms] = useState('');
  const [smsNote, setSmsNote] = useState<string | null>(null);

  const diff = Math.round((actual - current) * 100) / 100;

  function readMessage() {
    if (!sms.trim()) return;
    const p = parseMessage(null, sms.trim(), data.accounts, data.meta.asOf);
    if (p.statedBalance == null) {
      setSmsNote('No balance found in that message. Type the figure in above instead.');
      return;
    }
    setActual(p.statedBalance);
    setSmsNote(
      `Read a balance of ${money(p.statedBalance)}${p.providerLabel !== 'Unknown sender' ? ` from ${p.providerLabel}` : ''}.`
      + ' Check it, then set it below.',
    );
  }

  return (
    <div style={{ paddingTop: 12 }}>
      <label className="fld">What {accountName} actually holds</label>
      <NumberInput value={actual} onChange={setActual} />

      <div style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0' }}>
        {Math.abs(diff) < 0.005
          ? 'That matches what Birr works out. Nothing to correct.'
          : <>Birr works out {money(current)}, so this books a correction of{' '}
            <strong className={diff < 0 ? 'neg' : 'pos'}>{money(diff)}</strong>.</>}
      </div>

      <div className="btnrow">
        <button
          className="btn primary"
          disabled={Math.abs(diff) < 0.005}
          onClick={() => {
            update(d => setAccountBalance(d, accountId, actual, `${accountName} balance confirmed`));
            show(`${accountName} set to ${money(actual)}`);
            onDone();
          }}
        >Set balance</button>
        <button className="btn ghost" onClick={onDone}>Cancel</button>
      </div>

      <details style={{ marginTop: 14 }}>
        <summary style={{ fontSize: 13.5, color: 'var(--series-1)', cursor: 'pointer' }}>
          Read it from a bank message
        </summary>
        <div style={{ marginTop: 10 }}>
          <textarea
            value={sms}
            onChange={e => { setSms(e.target.value); setSmsNote(null); }}
            placeholder="Paste the whole SMS — Birr takes the balance it states"
            style={{ minHeight: 80, fontSize: 13 }}
          />
          <div className="btnrow" style={{ marginTop: 8 }}>
            <button className="btn" disabled={!sms.trim()} onClick={readMessage}>
              Read the balance
            </button>
          </div>
          {smsNote && (
            <div className="alert warn" style={{ marginTop: 10 }}>
              <span className="ico">△</span><span>{smsNote}</span>
            </div>
          )}
          <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            This only takes the balance the bank states. To record what the money was
            spent on, use the Messages tab instead.
          </div>
        </div>
      </details>
      {toast}
    </div>
  );
}
