# QueueStorm Investigator

Hackathon API for investigating mobile financial service support tickets.

## Setup

```sh
npm install
```

## Run

```sh
npm start
```

Start the API first:

```sh
npm start
```


When no URL is passed, the latency test uses `BASE_URL` if set, otherwise `http://127.0.0.1:${PORT}` with the same `.env`/`PORT` value used by the API, falling back to port `5000`.

You can also pass the base URL explicitly:


The latency tool checks `GET /health`, warms up `POST /analyze-ticket`, then runs 100 requests with moderate concurrency by default. It reports success count, failure count, average latency, p50, p95, p99, max latency, and failure rate. Non-200 responses, invalid JSON, missing schema fields, and missing `relevant_transaction_id` are counted as failures.

## Endpoints

### `GET /health`

Response:

```json
{
  "status": "ok"
}
```

### `POST /analyze-ticket`

Example request:

```json
{
  "ticket_id": "T-100",
  "complaint": "Payment failed but 500 was deducted for UtilityCo",
  "language": "en",
  "channel": "in_app_chat",
  "user_type": "customer",
  "transaction_history": [
    {
      "transaction_id": "TXN-500",
      "timestamp": "2026-06-26T10:00:00Z",
      "type": "payment",
      "amount": 500,
      "counterparty": "UtilityCo",
      "status": "failed"
    }
  ]
}
```

Example response:

```json
{
  "ticket_id": "T-100",
  "relevant_transaction_id": "TXN-500",
  "evidence_verdict": "consistent",
  "case_type": "payment_failed",
  "severity": "high",
  "department": "payments_ops",
  "agent_summary": "Customer reports a failed payment or deducted balance issue related to transaction TXN-500.",
  "recommended_next_action": "Verify transaction ledger status and coordinate with payments operations before taking any reversal action.",
  "customer_reply": "We have noted your concern about transaction TXN-500. Our payments team will verify the issue and any eligible amount will be returned through official channels. Please do not share your PIN or OTP with anyone.",
  "human_review_required": false,
  "confidence": 0.87,
  "reason_codes": ["payment_failed", "consistent"]
}
```

`relevant_transaction_id` is always present. It is a transaction id when the complaint can be tied to a transaction in `transaction_history`; otherwise it is `null`.

## Safety Logic Summary

The API classifies complaints using complaint text plus transaction history. It uses explicit transaction ids, amounts, transaction type, status, counterparty context, and complaint intent to decide whether a transaction is relevant.

Evidence verdicts:

- `consistent`: transaction history supports the complaint.
- `inconsistent`: a related transaction exists, but history contradicts the complaint.
- `insufficient_data`: no enough transaction evidence exists.

Suspicious calls, OTP requests, credential requests, phishing, scam, or social engineering complaints route to `fraud_risk`, use `critical` severity, and require human review. Customer replies must not ask for PIN, OTP, password, full card number, or secret credentials, and must not promise refunds, reversals, unblocks, or recovery without verification.

## Known Limitations

- Matching is deterministic keyword and transaction-history logic, not a trained model.
- Bangla support is keyword-based and depends on correctly encoded input text.
- Approximate time matching is limited; explicit transaction id and amount matches are stronger.
- The service does not perform real ledger, merchant, agent, or fraud-system lookups.
