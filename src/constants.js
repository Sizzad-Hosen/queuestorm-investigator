const CASE_TYPE = Object.freeze({
  WRONG_TRANSFER: "wrong_transfer",
  PAYMENT_FAILED: "payment_failed",
  REFUND_REQUEST: "refund_request",
  DUPLICATE_PAYMENT: "duplicate_payment",
  MERCHANT_SETTLEMENT_DELAY: "merchant_settlement_delay",
  AGENT_CASH_IN_ISSUE: "agent_cash_in_issue",
  PHISHING: "phishing_or_social_engineering",
  OTHER: "other"
});

const DEPARTMENT = Object.freeze({
  CUSTOMER_SUPPORT: "customer_support",
  DISPUTE_RESOLUTION: "dispute_resolution",
  PAYMENTS_OPS: "payments_ops",
  MERCHANT_OPERATIONS: "merchant_operations",
  AGENT_OPERATIONS: "agent_operations",
  FRAUD_RISK: "fraud_risk"
});

const SEVERITY = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical"
});

const EVIDENCE_VERDICT = Object.freeze({
  CONSISTENT: "consistent",
  INCONSISTENT: "inconsistent",
  INSUFFICIENT_DATA: "insufficient_data"
});

module.exports = {
  CASE_TYPE,
  DEPARTMENT,
  SEVERITY,
  EVIDENCE_VERDICT
};