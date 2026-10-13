/* ============================================================
   BIRR — BANK MESSAGE PARSER

   WARNING: the per-provider patterns are reconstructions. Real
   wording from CBE / Berhan / Dashen / Bunna / telebirr / M-Pesa
   must be pasted in and the patterns tuned against it. Until then
   the generic extractor carries the load and every result gets a
   confidence score, so nothing is ever silently trusted.
   ============================================================ */

import type { Account, ParsedMessage, ISODate } from './types';

const AMOUNT = '([0-9][0-9,\\s]*(?:\\.[0-9]{1,2})?)';
const CCY = '(?:ETB|Br\\.?|Birr)';

function num(s: string | undefined | null): number | null {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[,\s]/g, ''));
  return isNaN(n) ? null : n;
}

const DEBIT_WORDS = /\b(debited|debit|withdrawn|withdrawal|paid|payment of|transferred|sent|purchase|deducted|charged)\b/i;
const CREDIT_WORDS = /\b(credited|credit|deposited|deposit|received|has received|refund|transferred to your)\b/i;

/** Moving money between your own accounts is not spending. */
const TRANSFER_HINTS = /\b(transfer(?:red)?\s+(?:to|from)\s+(?:your\s+)?(?:own|account)|to your (?:CBE|Dashen|Berhan|Bunna|telebirr)|wallet to bank|bank to wallet|self)\b/i;

export interface Provider {
  id: string;
  label: string;
  senders: string[];
  hints: RegExp;
  patterns: RegExp[];
  refPattern: RegExp;
}

export const PROVIDERS: Provider[] = [
  {
    id: 'telebirr', label: 'telebirr', senders: ['127', 'telebirr', 'ethiotelecom'],
    hints: /telebirr|ethio\s?telecom|127/i,
    patterns: [
      new RegExp(`transferred\\s+${CCY}\\s*${AMOUNT}\\s+to\\s+([^.,]+)`, 'i'),
      new RegExp(`received\\s+${CCY}\\s*${AMOUNT}\\s+from\\s+([^.,]+)`, 'i'),
    ],
    refPattern: /\b(?:transaction\s+number|trans(?:action)?\s*id|receipt)\s*[:\s]*([A-Z0-9]{6,})/i,
  },
  {
    id: 'CBE', label: 'Commercial Bank of Ethiopia', senders: ['CBE', 'CBEBirr', 'CBE-Birr'],
    hints: /commercial bank of ethiopia|\bCBE\b/i,
    patterns: [
      new RegExp(`account\\s+([0-9*xX]{4,})\\s+has been\\s+(debited|credited)\\s+with\\s+${CCY}\\s*${AMOUNT}`, 'i'),
    ],
    refPattern: /\b(?:ref|reference)\s*[:\s]*([A-Z0-9]{6,})/i,
  },
  { id: 'Berhan', label: 'Berhan Bank', senders: ['Berhan', 'BerhanBank'], hints: /berhan/i, patterns: [], refPattern: /\bref\s*[:\s]*([A-Z0-9]{6,})/i },
  { id: 'Dashen', label: 'Dashen Bank', senders: ['Dashen', 'DashenBank'], hints: /dashen|amole/i, patterns: [], refPattern: /\bref\s*[:\s]*([A-Z0-9]{6,})/i },
  { id: 'Bunna', label: 'Bunna Bank', senders: ['Bunna', 'BunnaBank'], hints: /bunna/i, patterns: [], refPattern: /\bref\s*[:\s]*([A-Z0-9]{6,})/i },
  { id: 'M-Pesa', label: 'M-Pesa', senders: ['M-PESA', 'MPESA', 'Safaricom'], hints: /m-?pesa/i, patterns: [], refPattern: /\b([A-Z0-9]{10})\b/ },
];

const BALANCE_PATTERNS = [
  new RegExp(`(?:current|available|new|your)?\\s*balance\\s*(?:is|of|:)?\\s*${CCY}?\\s*${AMOUNT}`, 'i'),
  new RegExp(`balance\\s*[:\\s]\\s*${CCY}\\s*${AMOUNT}`, 'i'),
];

const AMOUNT_PATTERNS = [
  new RegExp(`${CCY}\\s*${AMOUNT}`, 'i'),
  new RegExp(`${AMOUNT}\\s*${CCY}`, 'i'),
];

const COUNTERPARTY_PATTERNS = [
  /\b(?:to|from)\s+([A-Z][A-Za-z.\s]{2,30}?)(?=\s*(?:on|at|\.|,|$))/,
  /\b(?:at|merchant)\s+([A-Z][A-Za-z0-9.\s]{2,30}?)(?=\s*(?:on|\.|,|$))/,
];

export function detectProvider(sender: string | null, body: string): Provider | null {
  const s = (sender || '').trim();
  for (const p of PROVIDERS) {
    if (p.senders.some(x => x.toLowerCase() === s.toLowerCase())) return p;
  }
  for (const p of PROVIDERS) if (p.hints.test(body)) return p;
  return null;
}

export function parseMessage(
  sender: string | null,
  body: string,
  accounts: Account[],
  today: ISODate,
): ParsedMessage {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  const missing: string[] = [];
  let confidence = 0;

  const provider = detectProvider(sender, text);
  if (provider) confidence += 0.3; else missing.push('provider');

  /* direction */
  const isDebit = DEBIT_WORDS.test(text);
  const isCredit = CREDIT_WORDS.test(text);
  let direction: 'debit' | 'credit' | null = null;
  if (isDebit && !isCredit) { direction = 'debit'; confidence += 0.25; }
  else if (isCredit && !isDebit) { direction = 'credit'; confidence += 0.25; }
  else if (isDebit && isCredit) {
    direction = text.search(DEBIT_WORDS) < text.search(CREDIT_WORDS) ? 'debit' : 'credit';
    confidence += 0.1;
    missing.push('direction (ambiguous wording)');
  } else missing.push('direction');

  /* provider-specific extraction */
  let amount: number | null = null;
  let counterparty: string | null = null;
  let accountDigits: string | null = null;

  if (provider) {
    for (const re of provider.patterns) {
      const m = text.match(re);
      if (!m) continue;
      for (const g of m.slice(1)) {
        if (g == null) continue;
        const raw = String(g).trim();
        if (/^[0-9*xX]{4,}$/.test(raw) && !accountDigits) { accountDigits = raw; continue; }
        if (/debited|credited/i.test(raw)) { direction = /credited/i.test(raw) ? 'credit' : 'debit'; continue; }
        const n = num(raw);
        if (n !== null && amount === null && /[0-9]/.test(raw) && raw.length < 20) { amount = n; continue; }
        if (!counterparty && /[A-Za-z]{3}/.test(raw)) counterparty = raw;
      }
      if (amount !== null) { confidence += 0.2; break; }
    }
  }

  /* the balance the bank itself stated */
  let statedBalance: number | null = null;
  for (const re of BALANCE_PATTERNS) {
    const m = text.match(re);
    if (m) { statedBalance = num(m[1]); confidence += 0.15; break; }
  }
  if (statedBalance === null) missing.push('stated balance');

  /* generic amount fallback — never pick up the balance figure */
  if (amount === null) {
    const all: number[] = [];
    const re = new RegExp(`${CCY}\\s*${AMOUNT}`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) { const n = num(m[1]); if (n !== null) all.push(n); }
    const candidates = all.filter(a => a !== statedBalance);
    if (candidates.length) { amount = candidates[0]; confidence += 0.15; }
    else if (all.length) { amount = all[0]; confidence += 0.05; }
    else {
      for (const p of AMOUNT_PATTERNS) {
        const mm = text.match(p);
        if (mm) { amount = num(mm[1]); confidence += 0.05; break; }
      }
    }
  }
  if (amount === null) missing.push('amount');

  if (!accountDigits) {
    const m = text.match(/\b([0-9]?[*x]{2,}[0-9]{3,}|[0-9]{4,}[*x]{2,})\b/i);
    if (m) accountDigits = m[1];
  }

  if (!counterparty) {
    for (const p of COUNTERPARTY_PATTERNS) {
      const m = text.match(p);
      if (m) { counterparty = m[1].trim(); confidence += 0.05; break; }
    }
  }

  /* which of my accounts is this? */
  let accountId: string | null = null;
  if (accounts.length) {
    const match = accounts.find(a =>
      (provider && a.provider === provider.id) ||
      (a.senderIds || []).some(s => s.toLowerCase() === String(sender || '').toLowerCase()));
    if (match) { accountId = match.id; confidence += 0.1; }
  }
  if (!accountId) missing.push('which account');

  let ref: string | null = null;
  if (provider) {
    const m = text.match(provider.refPattern);
    if (m) ref = m[1];
  }

  const conf = Math.min(1, Math.round(confidence * 100) / 100);

  return {
    id: 'm' + Math.random().toString(36).slice(2, 10),
    raw: body,
    sender: sender || null,
    provider: provider ? provider.id : null,
    providerLabel: provider ? provider.label : 'Unknown sender',
    direction,
    amount,
    signedAmount: amount === null || !direction ? null : (direction === 'debit' ? -amount : amount),
    statedBalance,
    counterparty,
    accountDigits,
    accountId,
    category: null,
    date: today,
    ref,
    looksLikeTransfer: TRANSFER_HINTS.test(text),
    confidence: conf,
    missing,
    needsReview: conf < 0.7 || missing.length > 0,
  };
}
