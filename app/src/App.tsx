import { useEffect, useState, useCallback } from 'react';
import { useStore } from './lib/store';
import { fmtDateFull } from './lib/engine';
import { parseMessage } from './lib/parser';

import Home from './screens/Home';
import CalendarScreen from './screens/CalendarScreen';
import Inbox from './screens/Inbox';
import ForecastScreen from './screens/ForecastScreen';
import More from './screens/More';
import Accounts from './screens/Accounts';
import LoanScreen from './screens/LoanScreen';
import EkubScreen from './screens/EkubScreen';
import RelocationScreen from './screens/RelocationScreen';
import Budget from './screens/Budget';
import Setup from './screens/Setup';
import Checks from './screens/Checks';

export type Route =
  | 'home' | 'calendar' | 'inbox' | 'forecast' | 'more'
  | 'accounts' | 'loan' | 'ekub' | 'relocation' | 'budget' | 'setup' | 'checks';

const TITLES: Record<Route, string> = {
  home: 'Birr',
  calendar: 'What is coming',
  inbox: 'Messages',
  forecast: 'Forecast',
  more: 'More',
  accounts: 'Accounts',
  loan: 'Loan',
  ekub: 'Ekub',
  relocation: 'Relocation',
  budget: 'Budget',
  setup: 'Setup',
  checks: 'Checks',
};

/** Screens reached from More — they get a back arrow instead of a tab. */
const SUB: Route[] = ['accounts', 'loan', 'ekub', 'relocation', 'budget', 'setup', 'checks'];

const TABS: { route: Route; label: string; icon: JSX.Element }[] = [
  {
    route: 'home', label: 'Home',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5" /></svg>,
  },
  {
    route: 'calendar', label: 'Coming',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  },
  {
    route: 'inbox', label: 'Messages',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-8 8H7l-4 2 1.2-3.6A8 8 0 1 1 21 12z" /></svg>,
  },
  {
    route: 'forecast', label: 'Forecast',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l5-6 4 3.5L21 6" /><path d="M16 6h5v5" /></svg>,
  },
  {
    route: 'more', label: 'More',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  },
];

function readHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '') as Route;
  return (h && TITLES[h]) ? h : 'home';
}

export default function App() {
  const { data, engine, update } = useStore();
  const [route, setRoute] = useState<Route>(readHash);

  useEffect(() => {
    const on = () => setRoute(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  /* An iOS Shortcut can forward a bank SMS by opening
     …/?sender=127&sms=<message>. Read it once, file it in the inbox,
     then scrub the URL so a refresh cannot double-book the same message. */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const sms = q.get('sms');
    if (!sms || !sms.trim()) return;
    const sender = q.get('sender');
    update(d => {
      const already = d.inbox.some(m => m.raw === sms && m.sender === sender);
      if (already) return d;
      return { ...d, inbox: [parseMessage(sender, sms, d.accounts, d.meta.asOf), ...d.inbox] };
    });
    const clean = window.location.pathname + window.location.hash;
    window.history.replaceState(null, '', clean);
    window.location.hash = '/inbox';
    setRoute('inbox');
  }, [update]);

  const go = useCallback((r: Route) => {
    window.location.hash = '/' + r;
    setRoute(r);
    window.scrollTo(0, 0);
  }, []);

  /* On a phone the keyboard slides up over the bottom of the screen, and a
     fixed nav bar ends up sitting on top of the field being typed into. Step
     it out of the way while a text field has focus. (Selects are left alone —
     their picker does not need the room.) */
  useEffect(() => {
    const isTyping = (el: EventTarget | null) => {
      const t = el as HTMLElement | null;
      if (!t) return false;
      const tag = t.tagName;
      return tag === 'TEXTAREA' || (tag === 'INPUT' && (t as HTMLInputElement).type !== 'checkbox');
    };
    const on = (e: FocusEvent) => {
      document.body.classList.toggle('typing', isTyping(e.target));
    };
    const off = () => document.body.classList.remove('typing');
    document.addEventListener('focusin', on);
    document.addEventListener('focusout', off);
    return () => {
      document.removeEventListener('focusin', on);
      document.removeEventListener('focusout', off);
    };
  }, []);

  const pendingCount = data.inbox.length;
  const unconfirmed = Object.values(data.confirmed).filter(v => !v).length;

  const screen = (() => {
    switch (route) {
      case 'home': return <Home go={go} />;
      case 'calendar': return <CalendarScreen />;
      case 'inbox': return <Inbox />;
      case 'forecast': return <ForecastScreen />;
      case 'more': return <More go={go} />;
      case 'accounts': return <Accounts />;
      case 'loan': return <LoanScreen />;
      case 'ekub': return <EkubScreen />;
      case 'relocation': return <RelocationScreen />;
      case 'budget': return <Budget />;
      case 'setup': return <Setup />;
      case 'checks': return <Checks />;
    }
  })();

  const isSub = SUB.includes(route);

  return (
    <div className="app">
      <header className="top">
        <div className="row">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isSub && (
              <button className="back" onClick={() => go('more')} aria-label="Back to More">‹</button>
            )}
            {TITLES[route]}
          </h1>
          <span className="sub">
            {route === 'setup' && unconfirmed > 0
              ? `${unconfirmed} section${unconfirmed === 1 ? '' : 's'} to confirm`
              : fmtDateFull(engine.asOf)}
          </span>
        </div>
      </header>

      <main>{screen}</main>

      <nav className="bottom">
        {TABS.map(t => (
          <button
            key={t.route}
            aria-current={route === t.route || (t.route === 'more' && isSub) ? 'page' : undefined}
            onClick={() => go(t.route)}
          >
            <span style={{ position: 'relative' }}>
              {t.icon}
              {t.route === 'inbox' && pendingCount > 0 && (
                <span style={{
                  position: 'absolute', top: -3, right: -7,
                  background: 'var(--critical)', color: '#fff',
                  borderRadius: 999, fontSize: 9.5, fontWeight: 700,
                  minWidth: 15, height: 15, lineHeight: '15px', padding: '0 3px',
                }}>{pendingCount}</span>
              )}
              {t.route === 'more' && unconfirmed > 0 && (
                <span style={{
                  position: 'absolute', top: -1, right: -5,
                  background: 'var(--serious)', borderRadius: 999,
                  width: 8, height: 8,
                }} />
              )}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
