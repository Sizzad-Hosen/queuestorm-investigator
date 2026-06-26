import {
  CASE_TYPE,
  DEPARTMENT,
  EVIDENCE_VERDICT,
  SEVERITY
} from "./constants.js";
import { isBangla } from "./utils.js";

const validValues = (source) => new Set(Object.values(source));

const VALID_CASE_TYPES = validValues(CASE_TYPE);
const VALID_DEPARTMENTS = validValues(DEPARTMENT);
const VALID_EVIDENCE_VERDICTS = validValues(EVIDENCE_VERDICT);
const VALID_SEVERITIES = validValues(SEVERITY);

const normalizeRelevantTransactionId = (value) => {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim();
  if (!normalized || normalized.toLowerCase() === "null") return null;

  return normalized;
};

const withValidEnum = (value, allowed, fallback) => {
  return allowed.has(value) ? value : fallback;
};

const normalizeAnalysis = (analysis = {}) => ({
  relevant_transaction_id: normalizeRelevantTransactionId(analysis.relevant_transaction_id),
  evidence_verdict: withValidEnum(
    analysis.evidence_verdict,
    VALID_EVIDENCE_VERDICTS,
    EVIDENCE_VERDICT.INSUFFICIENT_DATA
  ),
  case_type: withValidEnum(analysis.case_type, VALID_CASE_TYPES, CASE_TYPE.OTHER),
  severity: withValidEnum(analysis.severity, VALID_SEVERITIES, SEVERITY.LOW),
  department: withValidEnum(analysis.department, VALID_DEPARTMENTS, DEPARTMENT.CUSTOMER_SUPPORT),
  human_review_required: Boolean(analysis.human_review_required),
  confidence: typeof analysis.confidence === "number" ? analysis.confidence : 0.5,
  reason_codes: Array.isArray(analysis.reason_codes) ? analysis.reason_codes : ["fallback_schema"]
});

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
      return "Amra kokhono apnar PIN, OTP, password, full card number ba secret credential chai na. Ei gopon tottho nijer kache rakhun. Bishoyti fraud risk team ke janano hoyeche.";
    }

    if (!txnId) {
      return "Dhonnobad. Bishoyti jachai korte transaction ID, amount, approximate time ebong issue details janan. PIN, OTP, password ba secret credential gopon rakhun.";
    }

    return `Apnar transaction ${txnId} niye amra note niyechi. Relevant team official channel er maddhome bishoyti verify korbe. PIN, OTP, password ba secret credential gopon rakhun.`;
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
  const normalized = normalizeAnalysis(analysis);

  return {
    ticket_id: input.ticket_id,
    relevant_transaction_id: normalized.relevant_transaction_id,
    evidence_verdict: normalized.evidence_verdict,
    case_type: normalized.case_type,
    severity: normalized.severity,
    department: normalized.department,
    agent_summary: buildAgentSummary(input, normalized),
    recommended_next_action: buildNextAction(normalized),
    customer_reply: buildCustomerReply(input, normalized),
    human_review_required: normalized.human_review_required,
    confidence: normalized.confidence,
    reason_codes: normalized.reason_codes
  };
};
