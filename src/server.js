import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { analyzeTicket } from "./detector.js";
import { buildResponse } from "./responseBuilder.js";
import { inputSchema } from "./schema.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "64kb" }));

app.get("/health", (req, res) => {
  return res.status(200).json({ status: "ok" });
});

app.post("/analyze-ticket", (req, res) => {
  try {
    const parsed = inputSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "invalid_request",
        message: "Missing or invalid required fields."
      });
    }

    const input = parsed.data;

    if (!input.complaint.trim()) {
      return res.status(422).json({
        error: "empty_complaint",
        message: "Complaint cannot be empty."
      });
    }

    const analysis = analyzeTicket(input);
    const response = buildResponse(input, analysis);

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      error: "internal_error",
      message: "The service could not analyze this ticket safely."
    });
  }
});

app.use((req, res) => {
  return res.status(404).json({
    error: "not_found",
    message: "Endpoint not found."
  });
});

app.listen(PORT, () => {
  console.log(`QueueStorm Investigator API running on port ${PORT}`);
});
