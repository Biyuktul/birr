/* ============================================================
   BIRR — BANK MESSAGE PARSER
   ------------------------------------------------------------
   WARNING: the per-provider patterns below are reconstructions.
   The real wording from CBE / Berhan / Dashen / Bunna / telebirr /
   M-Pesa must be pasted in and the patterns tuned against it.
   Until then the GENERIC extractor does the work and every result
   is marked with a confidence score so nothing is silently trusted.
   ============================================================ */

const AMOUNT = '([0-9][0-9,\\s]*(?:\\.[0-9]{1,2})?)';
const CCY = '(?:ETB|Br\\.?|Birr)';

function num(s) { return s ? parseFloat(String(s).replace(/[,\s]/g, '')) : null; }

/* Words that tell us which way the money went. */
const DEBIT_WORDS = /\b(debited|debit|withdrawn|withdrawal|paid|payment of|transferred|sent|purchase|deducted|charged)\b/i;
const CREDIT_WORDS = /\b(credited|credit|deposited|deposit|received|has received|refund|transferred to your)\b/i;

/* Messages that move money between your own accounts, not spending. */
const TRANSFER_HINTS = /\b(transfer(?:red)?\s+(?:to|from)\s+(?:your\s+)?(?:own|account)|to your (?:CBE|Dashen|Berhan|Bunna|telebirr)|wallet to bank|bank to wallet|self)\b/i;

const PROVIDERS = [
  {
    id: 'telebirr', label: 'telebirr', senders: ['127', 'telebirr', 'ethiotelecom'],
    hints: /telebirr|ethio\s?telecom|127/i,
    patterns: [
      // "You have transferred ETB 100.00 to ABEBE K. ... your current balance is ETB 250.00. transaction number CAB1234567"
      new RegExp(`transferred\\s+${CCY}\\s*${AMOUNT}\\s+to\\s+([^.,]+)`, 'i'),
      new RegExp(`received\\s+${CCY}\\s*${AMOUNT}\\s+from\\s+([^.,]+)`, 'i'),
    ],
    refPattern: /\b(?:transaction\s+number|trans(?:action)?\s*id|receipt)\s*[:\s]*([A-Z0-9]{6,})/i,
  },
  {
    id: 'CBE', label: 'Commercial Bank of Ethiopia', senders: ['CBE', 'CBEBirr', 'CBE-Birr'],
    hints: /commercial bank of ethiopia|\bCBE\b/i,
    patterns: [
      // "Dear customer your account 1****5678 has been debited with ETB 500.00 ... current balance ETB 1,200.00"
      new RegExp(`account\\s+([0-9*xX]{4,})\\s+has been\\s+(debited|credited)\\s+with\\s+${CCY}\\s*${AMOUNT}`, 'i'),
    ],
    refPattern: /\b(?:ref|reference)\s*[:\s]*([A-Z0-9]{6,})/i,
  },
  { id: 'Berhan', label: 'Berhan Bank', senders: ['Berhan', 'BerhanBank'], hints: /berhan/i, patterns: [], refPattern: /\bref\s*[:\s]*([A-Z0-9]{6,})/i },
  { id: 'Dashen', label: 'Dashen Bank', senders: ['Dashen', 'DashenBank'], hints: /dashen|amole/i, patterns: [], refPattern: /\bref\s*[:\s]*([A-Z0-9]{6,})/i },
  { id: 'Bunna', label: 'Bunna Bank', senders: ['Bunna', 'BunnaBank'], hints: /bunna/i, patterns: [], refPattern: /\bref\s*[:\s]*([A-Z0-9]{6,})/i },
  { id: 'M-Pesa', label: 'M-Pesa', senders: ['M-PESA', 'MPESA', 'Safaricom'], hints: /m-?pesa/i, patterns: [], refPattern: /\b([A-Z0-9]{10})\b/ },
];

/* ---------- balance stated by the bank itself ---------- */
const BALANCE_PATTERNS = [
  new RegExp(`(?:current|available|new|your)?\\s*balance\\s*(?:is|of|:)?\\s*${CCY}?\\s*${AMOUNT}`, 'i'),
  new RegExp(`balance\\s*[:\\s]\\s*${CCY}\\s*${AMOUNT}`, 'i'),
];

/* ---------- the main amount, when no provider pattern matched ---------- */
const AMOUNT_PATTERNS = [
  new RegExp(`${CCY}\\s*${AMOUNT}`, 'i'),
  new RegExp(`${AMOUNT}\\s*${CCY}`, 'i'),
];

const COUNTERPARTY_PATTERNS = [
  /\b(?:to|from)\s+([A-Z][A-Za-z.\s]{2,30}?)(?=\s*(?:on|at|\.|,|$))/,
  /\b(?:at|merchant)\s+([A-Z][A-Za-z0-9.\s]{2,30}?)(?=\s*(?:on|\.|,|$))/,
];

function detectProvider(sender, body) {
  const s = (sender || '').trim();
  for (const p of PROVIDERS) {
    if (p.senders.some(x => x.toLowerCase() === s.toLowerCase())) return p;
  }
  for (const p of PROVIDERS) {
    if (p.hints.test(body)) return p;
  }
  return null;
}

/* ============================================================
   parseMessage(sender, body, accounts)
   Returns a candidate transaction with a confidence score and a
   list of what it could NOT work out, so the UI can ask.
   ============================================================ */
function parseMessage(sender, body, accounts) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  const missing = [];
  let confidence = 0;

  const provider = detectProvider(sender, text);
  if (provider) confidence += 0.3; else missing.push('provider');

  /* direction */
  const isDebit = DEBIT_WORDS.test(text);
  const isCredit = CREDIT_WORDS.test(text);
  let direction = null;
  if (isDebit && !isCredit) { direction = 'debit'; confidence += 0.25; }
  else if (isCredit && !isDebit) { direction = 'credit'; confidence += 0.25; }
  else if (isDebit && isCredit) {
    // both present — trust whichever appears first
    direction = text.search(DEBIT_WORDS) < text.search(CREDIT_WORDS) ? 'debit' : 'credit';
    confidence += 0.1;
    missing.push('direction (ambiguous wording)');
  } else missing.push('direction');

  /* amount + counterparty via provider pattern first */
  let amount = null, counterparty = null, accountDigits = null;
  if (provider) {
    for (const re of provider.patterns) {
      const m = text.match(re);
      if (!m) continue;
      const groups = m.slice(1);
      // find the first group that parses as a number
      for (const g of groups) {
        const n = num(g);
        if (n !== null && !isNaN(n) && /[0-9]/.test(g) && g.length < 20 && amount === null && !/^[0-9*xX]{4,}$/.test(g.trim())) {
          amount = n;
        } else if (/^[0-9*xX]{4,}$/.test(String(g).trim()) && !accountDigits) {
          accountDigits = String(g).trim();
        } else if (/debited|credited/i.test(g)) {
          direction = /credited/i.test(g) ? 'credit' : 'debit';
        } else if (!counterparty && /[A-Za-z]{3}/.test(g)) {
          counterparty = String(g).trim();
        }
      }
      if (amount !== null) { confidence += 0.2; break; }
    }
  }

  /* generic amount fallback — exclude the balance figure */
  let statedBalance = null;
  for (const re of BALANCE_PATTERNS) {
    const m = text.match(re);
    if (m) { statedBalance = num(m[1]); confidence += 0.15; break; }
  }
  if (statedBalance === null) missing.push('stated balance');

  if (amount === null) {
    const all = [];
    const re = new RegExp(`${CCY}\\s*${AMOUNT}`, 'gi');
    let m;
    while ((m = re.exec(text)) !== null) all.push(num(m[1]));
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
  let accountId = null;
  if (provider && accounts) {
    const match = accounts.find(a =>
      a.provider === provider.id ||
      (a.senderIds || []).some(s => s.toLowerCase() === String(sender || '').toLowerCase()));
    if (match) { accountId = match.id; confidence += 0.1; }
  }
  if (!accountId) missing.push('which account');

  const looksLikeTransfer = TRANSFER_HINTS.test(text);

  let ref = null;
  if (provider && provider.refPattern) {
    const m = text.match(provider.refPattern);
    if (m) ref = m[1];
  }

  return {
    raw: body, sender: sender || null,
    provider: provider ? provider.id : null,
    providerLabel: provider ? provider.label : 'Unknown',
    direction,
    amount,
    signedAmount: amount === null || !direction ? null : (direction === 'debit' ? -amount : amount),
    statedBalance,
    counterparty,
    accountDigits,
    accountId,
    ref,
    looksLikeTransfer,
    confidence: Math.min(1, Math.round(confidence * 100) / 100),
    missing,
    needsReview: confidence < 0.7 || missing.length > 0,
  };
}

if (typeof module !== 'undefined') {
  module.exports = { parseMessage, PROVIDERS, detectProvider };
}
