import { extractNumbers, includesAny, normalizeText } from "./utils.js";

const TYPE_KEYWORDS = {
  transfer: ["transfer", "sent", "send", "wrong number", "wrong person", "wrong recipient"],
  payment: ["payment", "paid", "merchant", "bill", "checkout", "deducted", "charged"],
  cash_in: ["cash in", "cash-in", "cashin", "agent", "balance not added"],
  cash_out: ["cash out", "cash-out", "cashout", "withdraw"],
  settlement: ["settlement", "merchant", "sales"],
  refund: ["refund", "money back", "return my money"]
};

const STATUS_KEYWORDS = {
  completed: ["completed", "success", "successful", "sent", "paid", "deducted", "charged"],
  failed: ["failed", "failure", "unsuccessful", "did not go through"],
  pending: ["pending", "processing", "stuck"],
  reversed: ["reversed", "returned", "refunded"]
};

const ISSUE_KEYWORDS = [
  "failed",
  "deducted",
  "charged",
  "not received",
  "didn't get",
  "did not get",
  "not added",
  "missing",
  "pending",
  "stuck",
  "wrong",
  "mistake",
  "refund",
  "money back",
  "settlement",
  "settled",
  "cash in",
  "cash-in",
  "payment",
  "paid",
  "sent"
];

const isCounterpartyMentioned = (text, counterparty) => {
  const normalized = normalizeText(counterparty);

  return normalized.length >= 3 && text.includes(normalized);
};

const hasAmountMatch = (amounts, txn) => amounts.includes(Number(txn.amount));

const hasStatusMatch = (text, txn) => {
  const keywords = STATUS_KEYWORDS[txn.status] || [];

  return includesAny(text, keywords);
};

const hasTypeMatch = (text, txn) => {
  const keywords = TYPE_KEYWORDS[txn.type] || [];

  return includesAny(text, keywords);
};

const hasTransactionIssueSignal = (text) => includesAny(text, ISSUE_KEYWORDS);

const timestampValue = (txn) => {
  const value = new Date(txn.timestamp).getTime();

  return Number.isNaN(value) ? 0 : value;
};

const scoreTransaction = (text, amounts, txn) => {
  let score = 0;

  if (hasAmountMatch(amounts, txn)) score += 6;
  if (isCounterpartyMentioned(text, txn.counterparty)) score += 5;
  if (hasStatusMatch(text, txn)) score += 3;
  if (hasTypeMatch(text, txn)) score += 2;

  return score;
};

export const findTransactionById = (complaint, transactions) => {
  const text = String(complaint || "").toLowerCase();

  return transactions.find(txn =>
    txn.transaction_id &&
    text.includes(String(txn.transaction_id).toLowerCase())
  ) || null;
};

export const findTransactionsByAmount = (complaint, transactions) => {
  const amounts = extractNumbers(complaint);

  if (amounts.length === 0) return [];

  return transactions.filter(txn => amounts.includes(Number(txn.amount)));
};

export const findLatestMatchingTransaction = (complaint, transactions, type = null) => {
  const exactMatch = findTransactionById(complaint, transactions);

  if (exactMatch && (!type || exactMatch.type === type)) {
    return exactMatch;
  }

  const text = normalizeText(complaint);
  const amounts = extractNumbers(complaint);
  let candidates = type
    ? transactions.filter(txn => txn.type === type)
    : transactions.slice();

  if (candidates.length === 0) return null;

  const amountMatches = candidates.filter(txn => hasAmountMatch(amounts, txn));
  if (amountMatches.length === 1) return amountMatches[0];

  const scored = candidates
    .map(txn => ({ txn, score: scoreTransaction(text, amounts, txn) }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score || timestampValue(b.txn) - timestampValue(a.txn));

  if (scored.length > 0 && scored[0].score >= 5) {
    return scored[0].txn;
  }

  if (
    type &&
    candidates.length === 1 &&
    (hasTypeMatch(text, candidates[0]) || hasStatusMatch(text, candidates[0]) || hasTransactionIssueSignal(text))
  ) {
    return candidates[0];
  }

  return null;
};

export const detectDuplicatePayment = (transactions) => {
  const payments = transactions.filter(txn => txn.type === "payment");

  for (let i = 0; i < payments.length; i++) {
    for (let j = i + 1; j < payments.length; j++) {
      const a = payments[i];
      const b = payments[j];

      const sameAmount = a.amount === b.amount;
      const sameCounterparty = a.counterparty === b.counterparty;
      const bothCompleted = a.status === "completed" && b.status === "completed";

      const timeDiff = Math.abs(new Date(a.timestamp) - new Date(b.timestamp));
      const withinTwoMinutes = timeDiff <= 2 * 60 * 1000;

      if (sameAmount && sameCounterparty && bothCompleted && withinTwoMinutes) {
        return new Date(a.timestamp) > new Date(b.timestamp) ? a : b;
      }
    }
  }

  return null;
};

export const hasEstablishedRecipientPattern = (targetTxn, transactions) => {
  if (!targetTxn) return false;

  const sameCounterpartyTransfers = transactions.filter(txn =>
    txn.type === "transfer" &&
    txn.counterparty === targetTxn.counterparty &&
    txn.status === "completed"
  );

  return sameCounterpartyTransfers.length >= 3;
};
