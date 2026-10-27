import { useState } from 'react';
import { useStore } from '../lib/store';
import { money } from '../lib/engine';
import { parseMessage } from '../lib/parser';
import { uid } from '../lib/defaults';
import { Card, Field, useToast } from '../components/ui';
import type { ParsedMessage } from '../lib/types';

const SAMPLES: [string, string][] = [
  ['CBE', 'Dear customer your account 1****5678 has been debited with ETB 450.00 on 13/10/2026. Your current balance is ETB 3,120.00. Ref FT26286XYZ'],
  ['127', 'You have transferred ETB 250.00 to ABEBE KEBEDE. Your current balance is ETB 880.50. transaction number CAB1234567'],
  ['CBE', 'Your account 1****5678 has been credited with ETB 28,000.00. Current balance is ETB 31,120.00'],
  ['127', 'You have transferred ETB 1,000.00 to your CBE account. Your balance is ETB 120.00'],
];

export default function Inbox() {
  const { data, engine, update } = useStore();
  const { toast, show } = useToast();
  const [sender, setSender] = useState('');
  const [body, setBody] = useState('');
  const [sampleIdx, setSampleIdx] = useState(0);

  function parse() {
    if (!body.trim()) return;
    const p = parseMessage(sender.trim() || null, body.trim(), data.accounts, engine.asOf);
    update(d => ({ ...d, inbox: [p, ...d.inbox] }));
    setBody('');
    show(p.needsReview ? 'Read it — needs a check' : 'Read it');
  }

  function loadSample() {
    const [s, b] = SAMPLES[sampleIdx % SAMPLES.length];
    setSender(s); setBody(b); setSampleIdx(i => i + 1);
  }

  function patch(id: string, fields: Partial<ParsedMessage>) {
    update(d => ({
      ...d,
      inbox: d.inbox.map(m => {
        if (m.id !== id) return m;
        const next = { ...m, ...fields };
        next.signedAmount = next.amount == null || !next.direction
          ? null
          : (next.direction === 'debit' ? -next.amount : next.amount);
        return next;
      }),
    }));
  }

  function discard(id: string) {
    update(d => ({ ...d, inbox: d.inbox.filter(m => m.id !== id) }));
    show('Discarded');
  }

  function commit(m: ParsedMessage) {
    if (m.amount == null || !m.direction) { show('Set the amount and the direction'); return; }
    if (!m.accountId) { show('Pick which account'); return; }
    const signed = m.direction === 'debit' ? -Math.abs(m.amount) : Math.abs(m.amount);
    update(d => ({
      ...d,
      transactions: [...d.transactions, {
        id: uid('t'),
        date: m.date,
        accountId: m.accountId!,
        amount: signed,
        category: m.looksLikeTransfer ? null : (m.category || 'Other'),
        note: m.counterparty || m.providerLabel,
        isTransfer: m.looksLikeTransfer,
        source: 'sms' as const,
        statedBalance: m.statedBalance,
        externalRef: m.ref,
      }],
      recon: m.statedBalance != null && m.accountId
        ? { ...d.recon, [m.accountId]: m.statedBalance }
        : d.recon,
      inbox: d.inbox.filter(x => x.id !== m.id),
    }));
    show('Logged');
  }

  return (
    <>
      <Card title="Paste a bank message">
        <Field label="Sender, as it shows on your phone">
          <input
            type="text" value={sender} onChange={e => setSender(e.target.value)}
            placeholder="127, CBE, Dashen…" autoCapitalize="off" autoCorrect="off"
          />
        </Field>
        <Field label="Message">
          <textarea
            value={body} onChange={e => setBody(e.target.value)}
            placeholder="Paste the whole SMS, exactly as it arrived"
          />
        </Field>
        <div className="btnrow">
          <button className="btn primary" onClick={parse}>Read it</button>
          <button className="btn" onClick={loadSample}>Load a sample</button>
        </div>
      </Card>

      {!data.inbox.length && (
        <Card title="Waiting">
          <div className="empty">
            Nothing waiting. Messages you paste land here for you to confirm before anything
            touches your balances.
          </div>
        </Card>
      )}

      {data.inbox.map(m => {
        const conf = m.confidence >= 0.7 ? 'ok' : m.confidence >= 0.45 ? 'warn' : 'bad';
        const r = m.statedBalance != null && m.accountId
          ? engine.reconcile(m.accountId, m.statedBalance) : null;
        return (
          <Card key={m.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div>
                <strong>{m.providerLabel}</strong>{' '}
                <span className={`pill ${conf}`}>{Math.round(m.confidence * 100)}% sure</span>
                {m.looksLikeTransfer && <> <span className="pill">your own transfer</span></>}
              </div>
              <div style={{ fontSize: 18, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}
                className={m.signedAmount != null && m.signedAmount < 0 ? 'neg' : 'pos'}>
                {m.signedAmount != null ? money(m.signedAmount) : <span className="muted">amount unclear</span>}
              </div>
            </div>

            <div className="muted" style={{ fontSize: 12, margin: '8px 0', wordBreak: 'break-word' }}>{m.raw}</div>

            {m.missing.length > 0 && (
              <div className="alert warn">
                <span className="ico">△</span>
                <span>Could not work out: {m.missing.join(', ')}. Fill it in below.</span>
              </div>
            )}

            {r && (
              <div className={`alert ${r.clean ? 'good' : 'warn'}`}>
                <span className="ico">{r.clean ? '✓' : '△'}</span>
                <span>
                  The bank says {money(r.stated)}; Birr works out {money(r.calculated)}.{' '}
                  {r.clean ? 'They agree.' : <strong>Off by {money(Math.abs(r.drift))}.</strong>}
                </span>
              </div>
            )}

            <div className="grid2" style={{ marginTop: 10 }}>
              <Field label="Account">
                <select value={m.accountId ?? ''} onChange={e => patch(m.id, { accountId: e.target.value || null })}>
                  <option value="">— which account? —</option>
                  {engine.activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="What was this for?">
                <select
                  value={m.category ?? ''}
                  disabled={m.looksLikeTransfer}
                  onChange={e => {
                    const category = e.target.value || null;
                    // An account set up for this kind of spending claims it,
                    // unless the message already identified one itself.
                    const routed = engine.accountForCategory(category);
                    patch(m.id, {
                      category,
                      ...(routed && !m.accountId ? { accountId: routed } : {}),
                    });
                  }}
                >
                  <option value="">— category —</option>
                  {data.categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Amount">
                <input
                  type="number" inputMode="decimal" step="any"
                  value={m.amount ?? ''}
                  onChange={e => patch(m.id, { amount: e.target.value === '' ? null : parseFloat(e.target.value) })}
                />
              </Field>
              <Field label="Direction">
                <select value={m.direction ?? ''} onChange={e => patch(m.id, { direction: (e.target.value || null) as 'debit' | 'credit' | null })}>
                  <option value="">— which way? —</option>
                  <option value="debit">Money out</option>
                  <option value="credit">Money in</option>
                </select>
              </Field>
              <Field label="Date">
                <input type="date" value={m.date} onChange={e => patch(m.id, { date: e.target.value })} />
              </Field>
              <Field label="Note">
                <input
                  type="text" value={m.counterparty ?? ''} placeholder="who or what"
                  onChange={e => patch(m.id, { counterparty: e.target.value })}
                />
              </Field>
            </div>

            <div className="btnrow">
              <button className="btn primary" onClick={() => commit(m)}>Log it</button>
              <button className="btn" onClick={() => patch(m.id, { looksLikeTransfer: !m.looksLikeTransfer })}>
                {m.looksLikeTransfer ? 'Not a transfer' : 'This is my own transfer'}
              </button>
              <button className="btn ghost" onClick={() => discard(m.id)}>Discard</button>
            </div>
          </Card>
        );
      })}

      <Card title="Getting messages in without typing">
        <p style={{ fontSize: 14, margin: '0 0 10px', color: 'var(--text-secondary)' }}>
          iPhone does not let any app read your SMS — not this one, and not a native app
          either. The way round it is an iOS Shortcut that forwards the message to Birr.
        </p>
        <ol style={{ fontSize: 13.5, color: 'var(--text-secondary)', paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 5 }}>Shortcuts app → Automation → New → <strong>Message</strong></li>
          <li style={{ marginBottom: 5 }}>Sender contains <strong>127</strong> (one automation per bank)</li>
          <li style={{ marginBottom: 5 }}>Action: <strong>Open URL</strong></li>
          <li style={{ marginBottom: 5 }}>
            URL: this app's address followed by{' '}
            <code style={{ fontSize: 12 }}>?sender=127&amp;sms=</code> then the{' '}
            <strong>Shortcut Input</strong> variable
          </li>
          <li>Turn off “Ask Before Running” if your iOS lets you</li>
        </ol>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          Birr reads those two values the moment it opens and drops the message straight into
          this list. Whether iOS runs it without a tap depends on your version — test it and
          tell me what happens.
        </div>
      </Card>
      {toast}
    </>
  );
}
