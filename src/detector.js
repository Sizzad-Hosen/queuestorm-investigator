import {
  CASE_TYPE,
  DEPARTMENT,
  SEVERITY,
  EVIDENCE_VERDICT
} from "./constants.js";

import { normalizeText, includesAny } from "./utils.js";
import { detectSafetyRisk } from "./safety.js";

import {
  findTransactionById,
  findTransactionsByAmount,
  findLatestMatchingTransaction,
  detectDuplicatePayment,
  hasEstablishedRecipientPattern
} from "./transactionMatcher.js";

export const analyzeTicket = (input) => {
  const complaint = input.complaint || "";
  const text = normalizeText(complaint);
  const transactions = input.transaction_history || [];
  const transactionIdHint = [
    complaint,
    input.transaction_id,
    input.relevant_transaction_id,
    input.metadata?.transaction_id,
    input.metadata?.relevant_transaction_id,
    input.metadata?.txn_id
  ].filter(Boolean).join(" ");
  const exactTxn = findTransactionById(transactionIdHint, transactions);

  const safety = detectSafetyRisk(text);

  if (safety.isPhishing) {
    const txn = exactTxn || findLatestMatchingTransaction(complaint, transactions);

    return {
      relevant_transaction_id: txn ? txn.transaction_id : null,
      evidence_verdict: txn ? EVIDENCE_VERDICT.CONSISTENT : EVIDENCE_VERDICT.INSUFFICIENT_DATA,
      case_type: CASE_TYPE.PHISHING,
      severity: SEVERITY.CRITICAL,
      department: DEPARTMENT.FRAUD_RISK,
      human_review_required: true,
      confidence: txn ? 0.96 : 0.95,
      reason_codes: ["phishing", "critical_escalation", ...safety.reasonCodes]
    };
  }

  const duplicateTxn = detectDuplicatePayment(transactions);
  const duplicateClaim = includesAny(text, [
    "deducted twice",
    "charged twice",
    "paid twice",
    "duplicate",
    "দুইবার",
    "দুই বার",
    "ডাবল",
    "দ্বিগুণ"
  ]);

  if (duplicateClaim && duplicateTxn) {
    return {
      relevant_transaction_id: duplicateTxn.transaction_id,
      evidence_verdict: EVIDENCE_VERDICT.CONSISTENT,
      case_type: CASE_TYPE.DUPLICATE_PAYMENT,
      severity: SEVERITY.HIGH,
      department: DEPARTMENT.PAYMENTS_OPS,
      human_review_required: true,
      confidence: 0.93,
      reason_codes: ["duplicate_payment", "biller_verification_required"]
    };
  }

  const merchantSettlementClaim =
    input.user_type === "merchant" ||
    input.channel === "merchant_portal" ||
    includesAny(text, ["settlement", "settled", "sales", "সেটেলমেন্ট"]);

  if (merchantSettlementClaim) {
    const txn = exactTxn
      || findLatestMatchingTransaction(complaint, transactions, "settlement");

    return {
      relevant_transaction_id: txn ? txn.transaction_id : null,
      evidence_verdict: txn ? EVIDENCE_VERDICT.CONSISTENT : EVIDENCE_VERDICT.INSUFFICIENT_DATA,
      case_type: CASE_TYPE.MERCHANT_SETTLEMENT_DELAY,
      severity: txn && txn.amount >= 10000 ? SEVERITY.MEDIUM : SEVERITY.LOW,
      department: DEPARTMENT.MERCHANT_OPERATIONS,
      human_review_required: false,
      confidence: txn ? 0.9 : 0.65,
      reason_codes: txn ? ["merchant_settlement", "pending"] : ["merchant_settlement", "insufficient_data"]
    };
  }

  const agentCashInClaim = includesAny(text, [
    "cash in",
    "cash-in",
    "agent",
    "balance not added",
    "ক্যাশ ইন",
    "ক্যাশইন",
    "এজেন্ট",
    "ব্যালেন্সে টাকা আসেনি",
    "টাকা আসেনি"
  ]);

  if (agentCashInClaim) {
    const txn = exactTxn
      || findLatestMatchingTransaction(complaint, transactions, "cash_in");

    return {
      relevant_transaction_id: txn ? txn.transaction_id : null,
      evidence_verdict: txn ? EVIDENCE_VERDICT.CONSISTENT : EVIDENCE_VERDICT.INSUFFICIENT_DATA,
      case_type: CASE_TYPE.AGENT_CASH_IN_ISSUE,
      severity: SEVERITY.HIGH,
      department: DEPARTMENT.AGENT_OPERATIONS,
      human_review_required: true,
      confidence: txn ? 0.88 : 0.65,
      reason_codes: txn ? ["agent_cash_in", "agent_ops"] : ["agent_cash_in", "insufficient_data"]
    };
  }

  const paymentFailedClaim = includesAny(text, [
    "payment failed",
    "transaction failed",
    "failed",
    "balance deducted",
    "deducted",
    "পেমেন্ট ফেইল",
    "পেমেন্ট ফেল",
    "লেনদেন ব্যর্থ",
    "টাকা কেটে গেছে",
    "টাকা কাটা গেছে"
  ]);

  if (paymentFailedClaim) {
    const txn = exactTxn
      || findLatestMatchingTransaction(complaint, transactions, "payment");

    let verdict = EVIDENCE_VERDICT.INSUFFICIENT_DATA;

    if (txn) {
      verdict = ["failed", "pending"].includes(txn.status)
        ? EVIDENCE_VERDICT.CONSISTENT
        : EVIDENCE_VERDICT.INCONSISTENT;
    }

    return {
      relevant_transaction_id: txn ? txn.transaction_id : null,
      evidence_verdict: verdict,
      case_type: CASE_TYPE.PAYMENT_FAILED,
      severity: SEVERITY.HIGH,
      department: DEPARTMENT.PAYMENTS_OPS,
      human_review_required: verdict !== EVIDENCE_VERDICT.CONSISTENT,
      confidence: txn ? 0.87 : 0.62,
      reason_codes: ["payment_failed", verdict]
    };
  }

  const wrongTransferClaim = includesAny(text, [
    "wrong number",
    "wrong person",
    "wrong recipient",
    "wrong transfer",
    "sent to wrong",
    "mistake",
    "mistakenly",
    "brother",
    "didn't get",
    "did not get",
    "ভুল নম্বর",
    "ভুল করে",
    "অন্য নম্বরে",
    "পায়নি",
    "পায়নি"
  ]);

  if (wrongTransferClaim) {
    const amountMatches = findTransactionsByAmount(complaint, transactions)
      .filter(t => t.type === "transfer");

    if (!exactTxn && amountMatches.length > 1) {
      return {
        relevant_transaction_id: null,
        evidence_verdict: EVIDENCE_VERDICT.INSUFFICIENT_DATA,
        case_type: CASE_TYPE.WRONG_TRANSFER,
        severity: SEVERITY.MEDIUM,
        department: DEPARTMENT.DISPUTE_RESOLUTION,
        human_review_required: false,
        confidence: 0.65,
        reason_codes: ["ambiguous_match", "needs_clarification"]
      };
    }

    const txn = exactTxn || amountMatches[0] || findLatestMatchingTransaction(complaint, transactions, "transfer");

    const establishedPattern = hasEstablishedRecipientPattern(txn, transactions);

    return {
      relevant_transaction_id: txn ? txn.transaction_id : null,
      evidence_verdict: txn
        ? establishedPattern
          ? EVIDENCE_VERDICT.INCONSISTENT
          : EVIDENCE_VERDICT.CONSISTENT
        : EVIDENCE_VERDICT.INSUFFICIENT_DATA,
      case_type: CASE_TYPE.WRONG_TRANSFER,
      severity: establishedPattern ? SEVERITY.MEDIUM : SEVERITY.HIGH,
      department: DEPARTMENT.DISPUTE_RESOLUTION,
      human_review_required: true,
      confidence: txn ? 0.8 : 0.6,
      reason_codes: establishedPattern
        ? ["wrong_transfer_claim", "established_recipient_pattern", "evidence_inconsistent"]
        : ["wrong_transfer", txn ? "transaction_match" : "insufficient_data"]
    };
  }

  const refundClaim = includesAny(text, [
    "refund",
    "money back",
    "return my money",
    "changed my mind",
    "রিফান্ড",
    "টাকা ফেরত",
    "ফেরত চাই"
  ]);

  if (refundClaim) {
    const txn = exactTxn
      || findLatestMatchingTransaction(complaint, transactions, "payment");

    return {
      relevant_transaction_id: txn ? txn.transaction_id : null,
      evidence_verdict: txn ? EVIDENCE_VERDICT.CONSISTENT : EVIDENCE_VERDICT.INSUFFICIENT_DATA,
      case_type: CASE_TYPE.REFUND_REQUEST,
      severity: SEVERITY.LOW,
      department: DEPARTMENT.CUSTOMER_SUPPORT,
      human_review_required: false,
      confidence: txn ? 0.85 : 0.6,
      reason_codes: ["refund_request", "merchant_policy_dependent"]
    };
  }

  return {
    relevant_transaction_id: exactTxn ? exactTxn.transaction_id : null,
    evidence_verdict: exactTxn ? EVIDENCE_VERDICT.CONSISTENT : EVIDENCE_VERDICT.INSUFFICIENT_DATA,
    case_type: CASE_TYPE.OTHER,
    severity: SEVERITY.LOW,
    department: DEPARTMENT.CUSTOMER_SUPPORT,
    human_review_required: false,
    confidence: exactTxn ? 0.7 : 0.6,
    reason_codes: exactTxn
      ? ["transaction_id_match", "needs_clarification"]
      : ["vague_complaint", "needs_clarification"]
  };
};
