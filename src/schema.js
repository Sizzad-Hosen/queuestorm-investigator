import { z } from "zod";

export const transactionSchema = z.object({
  transaction_id: z.string(),
  timestamp: z.string().optional(),
  type: z.enum([
    "transfer",
    "payment",
    "cash_in",
    "cash_out",
    "settlement",
    "refund"
  ]),
  amount: z.number(),
  counterparty: z.string(),
  status: z.enum([
    "completed",
    "failed",
    "pending",
    "reversed"
  ])
});

export const inputSchema = z.object({
  ticket_id: z.string(),
  complaint: z.string(),
  language: z.enum(["en", "bn", "mixed"]).optional(),
  channel: z.enum([
    "in_app_chat",
    "call_center",
    "email",
    "merchant_portal",
    "field_agent"
  ]).optional(),
  user_type: z.enum(["customer", "merchant", "agent", "unknown"]).optional(),
  campaign_context: z.string().optional(),
  transaction_history: z.array(transactionSchema).optional().default([]),
  metadata: z.record(z.any()).optional()
}).passthrough();
