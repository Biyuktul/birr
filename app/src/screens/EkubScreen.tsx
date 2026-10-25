import { useState } from 'react';
import { useStore } from '../lib/store';
import { money, fmtDate, fmtDateFull, daysBetween } from '../lib/engine';
import {
  payEkubRound, unpayEkubRound, setEkubRoundAmount, setEkubRoundDate,
} from '../lib/actions';
import { Card, Tile, Field, NumberInput, useToast } from '../components/ui';

export default function EkubScreen() {
  const { data, engine, update } = useStore();
  const { toast, show } = useToast();
  const [editing, setEditing] = useState<number | null>(null);

  if (!data.ekub.enabled) {
    return <Card title="Ekub"><div className="empty">No Ekub is switched on. Turn it on in Setup.</div></Card>;
  }

  const k = engine.ekubStatus();
  const E = data.ekub;
  const account = engine.accountById[E.accountId];

  function pay(round: number, date: string, amount?: number) {
    update(d => payEkubRound(d, { round, date, amount }));
    show(`Round ${round} paid — ${money(amount ?? E.contributionAmount)} out of ${account?.name ?? 'the account'}`);
  }

  function unpay(round: number) {
    update(d => unpayEkubRound(d, round));
    show(`Round ${round} undone, money put back`);
  }

  return (
    <>
      <div className="tiles">
        <Tile
          label="Contributed so far"
          value={money(k.contributedSoFar)}
          note={`${k.paidCount} of ${k.totalRounds} rounds · ${money(E.contributionAmount)} each`}
        />
        <Tile
          label="Your payout"
          value={money(k.payoutAmount)}
          note={<>Round {k.payoutRound} · {k.alreadyPaidOut
            ? 'already received'
            : <>{fmtDateFull(k.payoutDate)}, in {daysBetween(engine.asOf, k.payoutDate)} days</>}</>}
        />
      </div>

      <Card title="Cycle progress">
        <div className="bar-row">
          <div className="bar-head">
            <span className="cat">Rounds paid</span>
            <span className="vals">{k.paidCount} / {k.totalRounds} · {Math.round(k.progress * 100)}%</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${k.progress * 100}%` }} />
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 14 }}>
          {k.nextDue ? (
            <>
              Round <strong>{k.nextRound}</strong> of {money(engine.ekubAmountFor(k.nextRound))}{' '}
              {k.overdue
                ? <strong style={{ color: 'var(--critical)' }}>was due {fmtDate(k.nextDue)}</strong>
                : <>is due {fmtDate(k.nextDue)}</>}.
              <div className="btnrow" style={{ marginTop: 10 }}>
                <button
                  className="btn primary"
                  onClick={() => pay(k.nextRound, k.nextDue!)}
                >
                  Mark round {k.nextRound} paid
                </button>
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                This takes {money(engine.ekubAmountFor(k.nextRound))} out of{' '}
                <strong>{account?.name ?? 'the account it is paid from'}</strong> and off your total.
              </div>
            </>
          ) : 'The cycle is finished.'}
        </div>
      </Card>

      <Card title="What Ekub actually does for you">
        <div className="scroll-x">
          <table>
            <tbody>
              <tr><td>You put in, over the whole cycle</td><td className="num">{money(k.totalContribution)}</td></tr>
              <tr><td>You take out</td><td className="num">{money(k.payoutAmount)}</td></tr>
              <tr><td>Net over the cycle</td><td className="num"><strong>{money(k.payoutAmount - k.totalContribution)}</strong></td></tr>
              <tr><td>Paid in by the time you collect (round {k.payoutRound})</td><td className="num">{money(k.contributedByPayout)}</td></tr>
              <tr>
                <td>Cash you receive ahead of your own money</td>
                <td className={`num ${k.netAtPayout >= 0 ? 'pos' : 'neg'}`}>
                  <strong>{money(k.netAtPayout)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          Ekub does not create money — over a full cycle it nets to zero. What it buys is{' '}
          <em>timing</em>: {money(Math.abs(k.netAtPayout))}{' '}
          {k.netAtPayout >= 0
            ? 'arriving earlier than you could have saved it, which is the point of taking an early round.'
            : 'of your money sitting with the group — your round is late in the cycle, so you are effectively lending to it.'}
        </div>
      </Card>

      <Card title="Rounds" sub="tap any round to change what was paid, or when">
        {Array.from({ length: E.totalMembers }, (_, i) => i + 1).map(i => {
          const rec = E.contributionsPaid.find(c => c.round === i);
          const due = engine.ekubRoundDate(i);
          const isOpen = editing === i;
          const amount = rec?.amount ?? E.contributionAmount;
          return (
            <div key={i} className="editrow" style={{ background: isOpen ? 'var(--surface-1)' : undefined }}>
              <div className="head" style={{ marginBottom: isOpen ? 10 : 0 }}>
                <div>
                  <strong>Round {i}</strong>
                  {i === k.payoutRound && <> <span className="pill ok">yours</span></>}
                  {' '}
                  {rec
                    ? <span className="pill ok">paid</span>
                    : i === k.nextRound
                      ? (k.overdue ? <span className="pill bad">overdue</span> : <span className="pill warn">next</span>)
                      : <span className="pill">upcoming</span>}
                  <div className="meta" style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
                    {rec ? <>{money(amount)} on {fmtDate(rec.date)}</> : <>{money(amount)} due {fmtDate(due)}</>}
                  </div>
                </div>
                <button className="btn ghost sm" onClick={() => setEditing(isOpen ? null : i)}>
                  {isOpen ? 'close' : 'change'}
                </button>
              </div>

              {isOpen && (
                <>
                  {rec ? (
                    <>
                      <div className="grid2">
                        <Field label="Amount paid">
                          <NumberInput
                            value={amount}
                            onChange={v => update(d => setEkubRoundAmount(d, i, v))}
                          />
                        </Field>
                        <Field label="Date paid">
                          <input
                            type="date" value={rec.date}
                            onChange={e => update(d => setEkubRoundDate(d, i, e.target.value))}
                          />
                        </Field>
                      </div>
                      <div className="btnrow">
                        <button className="btn danger" onClick={() => { unpay(i); setEditing(null); }}>
                          Mark as not paid
                        </button>
                      </div>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                        Changing these moves the matching payment out of{' '}
                        {account?.name ?? 'the account'} too.
                      </div>
                    </>
                  ) : (
                    <RoundPayForm
                      defaultDate={due}
                      defaultAmount={E.contributionAmount}
                      accountName={account?.name ?? 'the account'}
                      openingDate={account?.openingDate}
                      onPay={(date, amt) => { pay(i, date, amt); setEditing(null); }}
                    />
                  )}
                </>
              )}
            </div>
          );
        })}
      </Card>
      {toast}
    </>
  );
}

/** Paying a round that is not simply "the next one at the usual amount". */
function RoundPayForm({ defaultDate, defaultAmount, accountName, openingDate, onPay }: {
  defaultDate: string;
  defaultAmount: number;
  accountName: string;
  openingDate?: string;
  onPay: (date: string, amount: number) => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [amount, setAmount] = useState(defaultAmount);
  // Anything before the opening balance is already inside that figure, so
  // subtracting it again would count the same money twice.
  const beforeOpening = !!openingDate && date < openingDate;
  return (
    <>
      <div className="grid2">
        <Field label="Amount paid">
          <NumberInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Date paid">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
      </div>
      {beforeOpening && (
        <div className="alert warn">
          <span className="ico">△</span>
          <span>
            That date is before {accountName}'s opening balance. The round will be
            recorded, but the balance will not change — the opening figure already
            accounts for money spent before then.
          </span>
        </div>
      )}
      <button className="btn primary" onClick={() => onPay(date, amount)}>
        Mark paid
      </button>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
        {beforeOpening
          ? 'Recorded for the cycle only.'
          : <>Takes {money(amount)} out of {accountName} and off your total.</>}
      </div>
    </>
  );
}
