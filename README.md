# QueueStorm Investigator

QueueStorm Investigator is a hackathon API for analyzing mobile financial service support tickets. It classifies complaints, checks the complaint against transaction history, identifies the relevant transaction when possible, and returns a safe structured response for support operations.

## Tech Stack

- Node.js
- Express
- Zod
- Helmet
- CORS

## Setup

```sh
npm install
```

## Run Locally

```sh
npm start
```

The API uses `PORT` from the environment when available. If `PORT` is not set, it runs on port `5000`.

Example:

```sh
PORT=8000 | 5000 npm start
```

## Vercel Deployment

This project includes a Vercel serverless entrypoint:

```text
api/index.js
```

The `vercel.json` file routes all requests to the Express app, so both required endpoints work after deployment:

```text
GET /health
POST /analyze-ticket
```

Deploy with:

```sh
npx vercel --prod
```

## Endpoints

### `GET /health`

Returns service readiness.

Response:

```json
{
  "status": "ok"
}
```

### `POST /analyze-ticket`

Analyzes one support ticket and returns a structured investigation response.

Example request:

```json
{
  "ticket_id": "TKT-003",
  "complaint": "I tried to pay 1200 taka for my mobile recharge but the app showed failed. My balance was deducted.",
  "language": "en",
  "channel": "in_app_chat",
  "user_type": "customer",
  "transaction_history": [
    {
      "transaction_id": "TXN-9301",
      "timestamp": "2026-04-14T16:00:00Z",
      "type": "payment",
      "amount": 1200,
      "counterparty": "MERCHANT-MOBILE-OP",
      "status": "failed"
    }
  ]
}
```

Example response:

```json
{
  "ticket_id": "TKT-003",
  "relevant_transaction_id": "TXN-9301",
  "evidence_verdict": "consistent",
  "case_type": "payment_failed",
  "severity": "high",
  "department": "payments_ops",
  "agent_summary": "Customer reports a failed payment or deducted balance issue related to transaction TXN-9301.",
  "recommended_next_action": "Verify transaction ledger status and coordinate with payments operations before taking any reversal action.",
  "customer_reply": "We have noted your concern about transaction TXN-9301. Our payments team will verify the issue and any eligible amount will be returned through official channels. Please do not share your PIN or OTP with anyone.",
  "human_review_required": false,
  "confidence": 0.87,
  "reason_codes": ["payment_failed", "consistent"]
}
```

## Response Schema

Every successful `POST /analyze-ticket` response includes:

- `ticket_id`
- `relevant_transaction_id`
- `evidence_verdict`
- `case_type`
- `severity`
- `department`
- `agent_summary`
- `recommended_next_action`
- `customer_reply`
- `human_review_required`

Optional fields:

- `confidence`
- `reason_codes`

`relevant_transaction_id` is always present. It contains a transaction id when the complaint can be matched to a transaction in `transaction_history`. It is `null` when no single relevant transaction can be safely identified.

## Allowed Output Values

`evidence_verdict`:

- `consistent`
- `inconsistent`
- `insufficient_data`

`case_type`:

- `wrong_transfer`
- `payment_failed`
- `refund_request`
- `duplicate_payment`
- `merchant_settlement_delay`
- `agent_cash_in_issue`
- `phishing_or_social_engineering`
- `other`

`severity`:

- `low`
- `medium`
- `high`
- `critical`

`department`:

- `customer_support`
- `dispute_resolution`
- `payments_ops`
- `merchant_operations`
- `agent_operations`
- `fraud_risk`

## Investigation Logic

The API uses both complaint text and `transaction_history`. It looks for signals such as:

- transaction id
- amount
- transaction type
- transaction status
- counterparty
- complaint intent
- duplicate payment patterns
- suspicious credential or phishing language

If the complaint clearly matches a transaction, the response includes that transaction id. If multiple transactions are plausible and choosing one would be a guess, `relevant_transaction_id` is `null` and the case is marked as insufficient data.

## Safety Logic

The API is designed to avoid critical safety violations:

- It never asks for PIN, OTP, password, full card number, or secret credentials.
- It does not promise refunds, reversals, account unblocks, or money recovery without verification.
- It guides users through official support channels only.
- Phishing, OTP, suspicious caller, scam, or social engineering complaints are routed to `fraud_risk`.
- High-risk phishing cases are marked `critical` and require human review.

Safe refund wording uses phrases such as:

```text
Any eligible amount will be returned through official channels.
```

## Error Handling

Malformed JSON returns a controlled error response instead of crashing the server.

Invalid request bodies return a safe validation error.

The API does not expose stack traces, tokens, secrets, or internal error details in responses.

## Known Limitations

- Matching is deterministic rule-based logic, not a trained model.
- Bangla and Banglish handling is keyword-based.
- Approximate time matching is limited.
- The API does not connect to a real ledger, payment gateway, merchant system, agent system, or fraud database.
