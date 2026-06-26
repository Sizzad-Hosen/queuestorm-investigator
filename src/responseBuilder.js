import { CASE_TYPE } from "./constants.js";
import { isBangla } from "./utils.js";

function buildAgentSummary(input, analysis) {
  const txnId = analysis.relevant_transaction_id;

  switch (analysis.case_type) {
    case CASE_TYPE.WRONG_TRANSFER:
      return txnId
        ? `Customer reports a wrong transfer related to transaction ${txnId}. Evidence verdict: ${analysis.evidence_verdict}.`
        : `Customer reports a possible wrong transfer, but the relevant transaction could not be determined from the provided history.`;

    case CASE_TYPE.PAYMENT_FAILED:
      return txnId
        ? `Customer reports a failed payment or deducted balance issue related to transaction ${txnId}.`
        : `Customer reports a failed payment issue, but no matching transaction was found.`;

    case CASE_TYPE.REFUND_REQUEST:
      return txnId
        ? `Customer requests a refund review for transaction ${txnId}.`
        : `Customer requests a refund, but no matching transaction was found.`;

    case CASE_TYPE.DUPLICATE_PAYMENT:
      return `Customer reports a possible duplicate payment. Suspected duplicate transaction: ${txnId}.`;

    case CASE_TYPE.MERCHANT_SETTLEMENT_DELAY:
      return txnId
        ? `Merchant reports settlement delay related to transaction ${txnId}.`
        : `Merchant reports settlement delay, but no matching settlement transaction was found.`;

    case CASE_TYPE.AGENT_CASH_IN_ISSUE:
      return txnId
        ? `Customer reports cash-in issue related to transaction ${txnId}.`
        : `Customer reports cash-in issue, but no matching transaction was found.`;

    case CASE_TYPE.PHISHING:
      return `Customer reports a possible phishing or social engineering attempt involving sensitive credentials or suspicious contact.`;

    default:
      return `Customer complaint is vague or does not match a specific supported case type.`;
  }
}

function buildNextAction(analysis) {
  switch (analysis.department) {
    case "dispute_resolution":
      return "Review the relevant transaction and follow the dispute resolution workflow. Do not confirm reversal before verification.";

    case "payments_ops":
      return "Verify transaction ledger status and coordinate with payments operations before taking any reversal action.";

    case "merchant_operations":
      return "Check merchant settlement batch status and provide an official update.";

    case "agent_operations":
      return "Investigate the cash-in status with agent operations and confirm settlement state.";

    case "fraud_risk":
      return "Escalate to fraud risk team immediately and remind the customer never to share credentials.";

    default:
      return "Ask the customer for non-sensitive clarification such as transaction ID, amount, time, and issue description.";
  }
}

function buildCustomerReply(input, analysis) {
  const bangla = input.language === "bn" || isBangla(input.complaint);
  const txnId = analysis.relevant_transaction_id;

  if (bangla) {
    if (analysis.case_type === CASE_TYPE.PHISHING) {
      return "আমরা কখনো আপনার পিন, ওটিপি বা পাসওয়ার্ড চাই না। অনুগ্রহ করে এগুলো কারো সাথে শেয়ার করবেন না। বিষয়টি আমাদের ফ্রড রিস্ক টিমকে জানানো হয়েছে।";
    }

    if (!txnId) {
      return "ধন্যবাদ। বিষয়টি যাচাই করতে অনুগ্রহ করে লেনদেন আইডি, টাকার পরিমাণ এবং কী সমস্যা হয়েছে তা জানান। আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।";
    }

    return `আপনার লেনদেন ${txnId} সম্পর্কে আমরা অবগত হয়েছি। সংশ্লিষ্ট দল বিষয়টি অফিসিয়াল চ্যানেলের মাধ্যমে যাচাই করবে। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।`;
  }

  if (analysis.case_type === CASE_TYPE.PHISHING) {
    return "Thank you for reaching out. We never ask for your PIN, OTP, password, or full card number under any circumstances. Please do not share these with anyone. Our fraud team has been notified of this incident.";
  }

  if (analysis.case_type === CASE_TYPE.REFUND_REQUEST) {
    return txnId
      ? `We have noted your refund-related concern about transaction ${txnId}. Refund eligibility depends on the applicable merchant or service policy. Any eligible amount will be handled through official channels. Please do not share your PIN or OTP with anyone.`
      : "Thank you for reaching out. Please share the transaction ID and amount so we can guide you. Do not share your PIN or OTP with anyone.";
  }

  if (analysis.case_type === CASE_TYPE.PAYMENT_FAILED || analysis.case_type === CASE_TYPE.DUPLICATE_PAYMENT) {
    return txnId
      ? `We have noted your concern about transaction ${txnId}. Our payments team will verify the issue and any eligible amount will be returned through official channels. Please do not share your PIN or OTP with anyone.`
      : "Thank you for reaching out. Please share the transaction ID, amount, and approximate time so we can check the issue. Do not share your PIN or OTP with anyone.";
  }

  if (!txnId) {
    return "Thank you for reaching out. To help you faster, please share the transaction ID, amount, approximate time, and a short description of what went wrong. Please do not share your PIN or OTP with anyone.";
  }

  return `We have noted your concern about transaction ${txnId}. The relevant team will review the case and contact you through official support channels. Please do not share your PIN or OTP with anyone.`;
}

export const buildResponse = (input, analysis) => {
  return {
    ticket_id: input.ticket_id,
    relevant_transaction_id: analysis.relevant_transaction_id,
    evidence_verdict: analysis.evidence_verdict,
    case_type: analysis.case_type,
    severity: analysis.severity,
    department: analysis.department,
    agent_summary: buildAgentSummary(input, analysis),
    recommended_next_action: buildNextAction(analysis),
    customer_reply: buildCustomerReply(input, analysis),
    human_review_required: analysis.human_review_required,
    confidence: analysis.confidence,
    reason_codes: analysis.reason_codes
  };
};
