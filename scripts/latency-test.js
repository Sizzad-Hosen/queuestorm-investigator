import "dotenv/config";

const defaultPort = process.env.PORT || 5000;
const baseUrl = process.argv[2] || process.env.BASE_URL || `http://127.0.0.1:${defaultPort}`;
const totalRequests = Number(process.env.REQUESTS || 100);
const concurrency = Number(process.env.CONCURRENCY || 10);
const timeoutMs = Number(process.env.TIMEOUT_MS || 30000);

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

const samples = [
  {
    ticket_id: "LAT-1",
    complaint: "Payment failed but 500 was deducted for UtilityCo",
    transaction_history: [
      {
        transaction_id: "TXN-LAT-500",
        timestamp: "2026-06-26T10:00:00Z",
        type: "payment",
        amount: 500,
        counterparty: "UtilityCo",
        status: "failed"
      }
    ]
  },
  {
    ticket_id: "LAT-2",
    complaint: "I sent 1200 to the wrong number by mistake",
    transaction_history: [
      {
        transaction_id: "TXN-LAT-1200",
        timestamp: "2026-06-26T11:00:00Z",
        type: "transfer",
        amount: 1200,
        counterparty: "01700000000",
        status: "completed"
      }
    ]
  },
  {
    ticket_id: "LAT-3",
    complaint: "Someone called and asked for my OTP to unblock my account",
    transaction_history: []
  },
  {
    ticket_id: "LAT-4",
    complaint: "I need help understanding my account limit",
    transaction_history: []
  }
];

const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const index = Math.ceil((p / 100) * values.length) - 1;
  return values[Math.max(0, Math.min(index, values.length - 1))];
};

const postAnalyzeTicket = async (payload) => {
  const started = performance.now();

  try {
    const response = await fetch(`${baseUrl}/analyze-ticket`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs)
    });

    const elapsed = performance.now() - started;

    if (!response.ok) {
      return { ok: false, elapsed, error: `HTTP ${response.status}` };
    }

    let json;
    try {
      json = await response.json();
    } catch {
      return { ok: false, elapsed, error: "invalid_json" };
    }

    const missingField = requiredFields.find((field) => !Object.hasOwn(json, field));
    if (missingField) {
      return { ok: false, elapsed, error: `missing_${missingField}` };
    }

    return { ok: true, elapsed };
  } catch (error) {
    return {
      ok: false,
      elapsed: performance.now() - started,
      error: error.name === "TimeoutError" ? "timeout" : error.message
    };
  }
};

const runPool = async () => {
  const results = [];
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < totalRequests) {
      const index = nextIndex;
      nextIndex += 1;

      const sample = samples[index % samples.length];
      results.push(await postAnalyzeTicket({
        ...sample,
        ticket_id: `${sample.ticket_id}-${index + 1}`
      }));
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, totalRequests) }, () => worker())
  );

  return results;
};

const main = async () => {
  console.log(`QueueStorm latency test target: ${baseUrl}`);

  let health;
  try {
    health = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new Error(
      `Could not reach ${baseUrl}/health. Start the API with "npm start", ` +
      `or pass the running API URL with "npm run latency:test -- <BASE_URL>". ` +
      `Original error: ${error.message}`
    );
  }

  if (!health.ok) {
    throw new Error(`Health check failed with HTTP ${health.status}`);
  }

  console.log("Health check passed. Warming up...");
  for (let index = 0; index < 5; index += 1) {
    await postAnalyzeTicket({
      ...samples[index % samples.length],
      ticket_id: `WARM-${index + 1}`
    });
  }

  console.log(`Running ${totalRequests} requests with concurrency ${concurrency}...`);
  const results = await runPool();
  const successes = results.filter((result) => result.ok);
  const failures = results.filter((result) => !result.ok);
  const latencies = successes.map((result) => result.elapsed).sort((a, b) => a - b);
  const totalLatency = latencies.reduce((sum, value) => sum + value, 0);
  const average = latencies.length ? totalLatency / latencies.length : 0;
  const max = latencies.length ? latencies[latencies.length - 1] : 0;
  const failureRate = (failures.length / results.length) * 100;

  console.log("\nFinal summary");
  console.log(`Total requests: ${results.length}`);
  console.log(`Success count: ${successes.length}`);
  console.log(`Failure count: ${failures.length}`);
  console.log(`Average latency: ${average.toFixed(2)} ms`);
  console.log(`p50 latency: ${percentile(latencies, 50).toFixed(2)} ms`);
  console.log(`p95 latency: ${percentile(latencies, 95).toFixed(2)} ms`);
  console.log(`p99 latency: ${percentile(latencies, 99).toFixed(2)} ms`);
  console.log(`Max latency: ${max.toFixed(2)} ms`);
  console.log(`Failure rate: ${failureRate.toFixed(2)}%`);

  if (failures.length > 0) {
    const failureCounts = failures.reduce((counts, failure) => {
      counts[failure.error] = (counts[failure.error] || 0) + 1;
      return counts;
    }, {});
    console.log(`Failure reasons: ${JSON.stringify(failureCounts)}`);
  }

  if (percentile(latencies, 95) > 5000) {
    console.log("Warning: p95 latency is above the 5 second target.");
  }

  if (max > timeoutMs) {
    console.log(`Warning: at least one request exceeded ${timeoutMs} ms.`);
  }
};

main().catch((error) => {
  console.error(`Latency test failed: ${error.message}`);
  process.exitCode = 1;
});
