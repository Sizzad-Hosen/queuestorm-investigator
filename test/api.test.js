import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { app } from "../src/server.js";
import {
  CASE_TYPE,
  DEPARTMENT,
  EVIDENCE_VERDICT,
  SEVERITY
} from "../src/constants.js";

let server;
let baseUrl;

const requiredFields = [
  "ticket_id",
  "relevant_transaction_id",
  "evidence_verdict",
  "case_type",
  "severity",
  "department",
  "agent_summary",
  "recommended_next_action",
  "customer_reply",
  "human_review_required"
];

const validEvidenceVerdicts = new Set(Object.values(EVIDENCE_VERDICT));
const validCaseTypes = new Set(Object.values(CASE_TYPE));
const validSeverities = new Set(Object.values(SEVERITY));
const validDepartments = new Set(Object.values(DEPARTMENT));

const hasCredentialRequest = (text) => {
  return String(text)
    .split(/[.!?।]/)
    .some((sentence) => {
      const lower = sentence.toLowerCase();
      const hasSecret = /\b(pin|otp|password|full card number|card number|secret credential)\b/.test(lower);
      const hasRequest = /\b(please|kindly|share|send|provide|give|tell|enter|submit)\b/.test(lower);
      const isWarning = /\b(do not|don't|never|not)\b/.test(lower);

      return hasSecret && hasRequest && !isWarning;
    });
};

const hasUnauthorizedPromise = (text) => {
  return /\b(we will|will|guarantee|confirmed|confirm|already)\b.{0,50}\b(refund|reverse|reversal|unblock|recover|recovery)\b/i.test(text);
};

const hasSuspiciousThirdPartyInstruction = (text) => {
  return /\b(contact|call|message|visit)\b.{0,50}\b(unknown number|caller|third party|agent directly|merchant directly|outside official)\b/i.test(text);
};

const postTicket = async (body) => {
  const response = await fetch(`${baseUrl}/analyze-ticket`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const json = await response.json();
  return { response, json };
};

const baseTicket = (overrides = {}) => ({
  ticket_id: "T-100",
  complaint: "Payment failed but 500 was deducted",
  transaction_history: [
    {
      transaction_id: "TXN-500",
      timestamp: "2026-06-26T10:00:00Z",
      type: "payment",
      amount: 500,
      counterparty: "UtilityCo",
      status: "failed"
    }
  ],
  ...overrides
});

describe("QueueStorm Investigator API", () => {
  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it("GET /health returns ok", async () => {
    const response = await fetch(`${baseUrl}/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });

  it("/analyze-ticket always includes relevant_transaction_id", async () => {
    const { response, json } = await postTicket(baseTicket());

    assert.equal(response.status, 200);
    for (const field of requiredFields) {
      assert.ok(Object.hasOwn(json, field), `missing ${field}`);
    }
  });

  it("sets relevant_transaction_id to null when no transaction matches", async () => {
    const { response, json } = await postTicket(baseTicket({
      complaint: "I need help understanding my account limit",
      transaction_history: [
        {
          transaction_id: "TXN-UNRELATED",
          timestamp: "2026-06-26T09:00:00Z",
          type: "transfer",
          amount: 999,
          counterparty: "Friend",
          status: "completed"
        }
      ]
    }));

    assert.equal(response.status, 200);
    assert.equal(json.relevant_transaction_id, null);
  });

  it("returns a transaction id when a transaction matches", async () => {
    const { response, json } = await postTicket(baseTicket({
      complaint: "Payment failed but 500 was deducted for UtilityCo"
    }));

    assert.equal(response.status, 200);
    assert.equal(json.relevant_transaction_id, "TXN-500");
  });

  it("refund request mentioning a merchant is not misrouted as settlement", async () => {
    const { response, json } = await postTicket(baseTicket({
      ticket_id: "TKT-004",
      complaint: "I paid 500 to a merchant for a product but I changed my mind and don't want it anymore. Please refund my 500 taka.",
      transaction_history: [
        {
          transaction_id: "TXN-9401",
          timestamp: "2026-04-14T13:00:00Z",
          type: "payment",
          amount: 500,
          counterparty: "MERCHANT-7821",
          status: "completed"
        }
      ]
    }));

    assert.equal(response.status, 200);
    assert.equal(json.relevant_transaction_id, "TXN-9401");
    assert.equal(json.case_type, CASE_TYPE.REFUND_REQUEST);
    assert.equal(json.department, DEPARTMENT.CUSTOMER_SUPPORT);
  });

  it("matches by counterparty and payment intent when amount is missing", async () => {
    const { response, json } = await postTicket(baseTicket({
      complaint: "Payment failed for UtilityCo, please check it"
    }));

    assert.equal(response.status, 200);
    assert.equal(json.relevant_transaction_id, "TXN-500");
    assert.equal(json.case_type, CASE_TYPE.PAYMENT_FAILED);
  });

  it("uses the only plausible transaction for a specific deducted-balance complaint", async () => {
    const { response, json } = await postTicket(baseTicket({
      complaint: "My money was deducted but the transaction failed. Please check.",
      transaction_history: [
        {
          transaction_id: "TXN-ONLY-1",
          timestamp: "2026-06-26T10:00:00Z",
          type: "payment",
          amount: 750,
          counterparty: "BILLER-ONE",
          status: "failed"
        }
      ]
    }));

    assert.equal(response.status, 200);
    assert.equal(json.relevant_transaction_id, "TXN-ONLY-1");
    assert.equal(json.case_type, CASE_TYPE.PAYMENT_FAILED);
  });

  it("customer_reply does not ask for sensitive credentials", async () => {
    const { response, json } = await postTicket(baseTicket({
      complaint: "A caller asked for my OTP and password to unblock my account"
    }));

    assert.equal(response.status, 200);
    assert.doesNotMatch(
      json.customer_reply,
      /(please share|send us|provide|give us|tell us|enter).{0,30}(pin|otp|password|full card number)/i
    );
  });

  it("customer_reply avoids hackathon safety penalty patterns", async () => {
    const cases = [
      baseTicket({
        complaint: "Someone called me and asked for my OTP to unblock the account",
        transaction_history: []
      }),
      baseTicket({
        complaint: "I tried to pay 1200 taka but the app showed failed. My balance was deducted! Please refund my money.",
        transaction_history: [
          {
            transaction_id: "TXN-SAFE-1",
            timestamp: "2026-06-26T10:00:00Z",
            type: "payment",
            amount: 1200,
            counterparty: "MERCHANT-MOBILE-OP",
            status: "failed"
          }
        ]
      }),
      baseTicket({
        complaint: "I sent 1000 to my brother yesterday but he says he didn't get it. Please check.",
        transaction_history: [
          {
            transaction_id: "TXN-SAFE-2",
            timestamp: "2026-06-25T10:00:00Z",
            type: "transfer",
            amount: 1000,
            counterparty: "+8801712001122",
            status: "completed"
          },
          {
            transaction_id: "TXN-SAFE-3",
            timestamp: "2026-06-25T11:00:00Z",
            type: "transfer",
            amount: 1000,
            counterparty: "+8801812334455",
            status: "completed"
          }
        ]
      }),
      baseTicket({
        language: "bn",
        complaint: "আমি ২০০০ টাকা ক্যাশ ইন করেছি কিন্তু ব্যালেন্সে আসেনি",
        transaction_history: [
          {
            transaction_id: "TXN-SAFE-4",
            timestamp: "2026-06-26T09:00:00Z",
            type: "cash_in",
            amount: 2000,
            counterparty: "AGENT-318",
            status: "pending"
          }
        ]
      })
    ];

    for (const ticket of cases) {
      const { response, json } = await postTicket(ticket);

      assert.equal(response.status, 200);
      assert.equal(hasCredentialRequest(json.customer_reply), false, json.customer_reply);
      assert.equal(hasUnauthorizedPromise(json.customer_reply), false, json.customer_reply);
      assert.equal(hasSuspiciousThirdPartyInstruction(json.customer_reply), false, json.customer_reply);
    }
  });

  it("returns only allowed enum values", async () => {
    const { response, json } = await postTicket(baseTicket());

    assert.equal(response.status, 200);
    assert.ok(validEvidenceVerdicts.has(json.evidence_verdict));
    assert.ok(validCaseTypes.has(json.case_type));
    assert.ok(validSeverities.has(json.severity));
    assert.ok(validDepartments.has(json.department));
  });

  it("malformed input returns a controlled error", async () => {
    const response = await fetch(`${baseUrl}/analyze-ticket`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json"
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "invalid_json",
      message: "Request body must be valid JSON."
    });
  });

  it("phishing or OTP complaint routes to fraud_risk with critical severity", async () => {
    const { response, json } = await postTicket(baseTicket({
      complaint: "Someone called me and asked for my OTP to unblock the account"
    }));

    assert.equal(response.status, 200);
    assert.equal(json.case_type, CASE_TYPE.PHISHING);
    assert.equal(json.department, DEPARTMENT.FRAUD_RISK);
    assert.equal(json.severity, SEVERITY.CRITICAL);
    assert.equal(json.human_review_required, true);
  });

  it("phishing complaint keeps a clearly referenced transaction id", async () => {
    const { response, json } = await postTicket(baseTicket({
      complaint: "After transaction TXN-500, someone called and asked for my OTP"
    }));

    assert.equal(response.status, 200);
    assert.equal(json.relevant_transaction_id, "TXN-500");
    assert.equal(json.case_type, CASE_TYPE.PHISHING);
    assert.equal(json.department, DEPARTMENT.FRAUD_RISK);
  });

  it("wrong transfer with matching transfer routes to dispute_resolution", async () => {
    const { response, json } = await postTicket(baseTicket({
      complaint: "I sent 1200 to the wrong number by mistake",
      transaction_history: [
        {
          transaction_id: "TXN-WRONG-1",
          timestamp: "2026-06-26T11:00:00Z",
          type: "transfer",
          amount: 1200,
          counterparty: "01700000000",
          status: "completed"
        }
      ]
    }));

    assert.equal(response.status, 200);
    assert.equal(json.relevant_transaction_id, "TXN-WRONG-1");
    assert.equal(json.case_type, CASE_TYPE.WRONG_TRANSFER);
    assert.equal(json.department, DEPARTMENT.DISPUTE_RESOLUTION);
  });

  it("ambiguous matching transfer returns relevant_transaction_id as null", async () => {
    const { response, json } = await postTicket(baseTicket({
      ticket_id: "TKT-008",
      complaint: "I sent 1000 to my brother yesterday but he says he didn't get it. Please check.",
      transaction_history: [
        {
          transaction_id: "TXN-9801",
          timestamp: "2026-04-13T11:20:00Z",
          type: "transfer",
          amount: 1000,
          counterparty: "+8801712001122",
          status: "completed"
        },
        {
          transaction_id: "TXN-9802",
          timestamp: "2026-04-13T19:45:00Z",
          type: "transfer",
          amount: 1000,
          counterparty: "+8801812334455",
          status: "completed"
        },
        {
          transaction_id: "TXN-9803",
          timestamp: "2026-04-13T20:10:00Z",
          type: "transfer",
          amount: 1000,
          counterparty: "+8801712001122",
          status: "failed"
        }
      ]
    }));

    assert.equal(response.status, 200);
    assert.equal(json.relevant_transaction_id, null);
    assert.equal(json.evidence_verdict, EVIDENCE_VERDICT.INSUFFICIENT_DATA);
    assert.equal(json.case_type, CASE_TYPE.WRONG_TRANSFER);
  });

  it("failed payment with deducted balance routes to payments_ops", async () => {
    const { response, json } = await postTicket(baseTicket());

    assert.equal(response.status, 200);
    assert.equal(json.relevant_transaction_id, "TXN-500");
    assert.equal(json.case_type, CASE_TYPE.PAYMENT_FAILED);
    assert.equal(json.department, DEPARTMENT.PAYMENTS_OPS);
  });
});
