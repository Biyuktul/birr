import { useStore } from '../lib/store';
import { money, fmtDate } from '../lib/engine';
import { Card, NumberInput, useToast } from '../components/ui';

export default function Accounts() {
  const { data, engine, update } = useStore();
  const { toast, show } = useToast();

  function setStated(id: string, v: number | null) {
    update(d => {
      const recon = { ...d.recon };
      if (v == null) delete recon[id]; else recon[id] = v;
      return { ...d, recon };
    });
  }

  function removeTx(id: string) {
    update(d => ({ ...d, transactions: d.transactions.filter(t => t.id !== id) }));
    show('Deleted');
  }

  const recent = [...data.transactions].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 50);

  return (
    <>
      <Card title="Balances" sub="what Birr works out, against what the bank last told you">
        {engine.activeAccounts.map(a => {
          const calc = engine.accountBalance(a.id);
          const stated = data.recon[a.id];
          const r = stated != null ? engine.reconcile(a.id, stated) : null;
          return (
            <div className="editrow" key={a.id}>
              <div className="head">
                <strong>{a.name}</strong>
                <span className="amt" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>
                  {money(calc)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 160px' }}>
                  <label className="fld">Balance the bank states</label>
                  <NumberInput
                    value={stated ?? 0}
                    onChange={v => setStated(a.id, v)}
                    placeholder="from your latest SMS"
                  />
                </div>
                <div style={{ flex: '0 0 auto', paddingTop: 18 }}>
                  {r
                    ? (r.clean
                      ? <span className="pill ok">matches</span>
                      : <span className="pill bad">off by {money(Math.abs(r.drift))}</span>)
                    : <span className="pill">not checked</span>}
                </div>
                {stated != null && (
                  <button className="btn ghost sm" style={{ marginTop: 16 }} onClick={() => setStated(a.id, null)}>
                    clear
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
          A drift means a transaction is missing, booked twice, or a fee went through that
          Birr has not seen.
        </div>
      </Card>

      <Card title="Recorded transactions" sub={`${data.transactions.length} total`}>
        {!recent.length && (
          <div className="empty">
            Nothing recorded yet. Paste a bank message under Messages, or mark a bill paid
            in Coming.
          </div>
        )}
        {recent.length > 0 && (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Account</th><th>What</th><th className="num">Amount</th><th />
                </tr>
              </thead>
              <tbody>
                {recent.map(t => (
                  <tr key={t.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                    <td>{engine.accountById[t.accountId]?.name ?? t.accountId}</td>
                    <td>
                      {t.note || '—'}
                      {t.isTransfer && <> <span className="pill">transfer</span></>}
                      {t.category && <div className="muted" style={{ fontSize: 12 }}>{t.category}</div>}
                    </td>
                    <td className={`num ${t.amount < 0 ? 'neg' : 'pos'}`}>{money(t.amount)}</td>
                    <td>
                      <button className="btn ghost sm" onClick={() => removeTx(t.id)}>delete</button>
                    </td>
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
