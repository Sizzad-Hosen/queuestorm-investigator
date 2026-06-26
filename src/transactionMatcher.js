import { extractNumbers } from "./utils.js";

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

  let candidates = findTransactionsByAmount(complaint, transactions);

  if (type) {
    candidates = candidates.filter(txn => txn.type === type);
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  return candidates
    .slice()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
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
