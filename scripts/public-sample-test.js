import fs from "node:fs";

import { analyzeTicket } from "../src/detector.js";
import { buildResponse } from "../src/responseBuilder.js";

const defaultPath = "C:/Users/AlphaTech/.codex/attachments/60ac2434-c165-45ba-8b23-c31c6729cdac/pasted-text.txt";
const casePackPath = process.argv[2] || process.env.CASE_PACK_PATH || defaultPath;

const comparableFields = [
  "relevant_transaction_id",
  "evidence_verdict",
  "case_type",
  "department"
];

const readCasePack = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
  const jsonStart = raw.indexOf("{");

  if (jsonStart === -1) {
    throw new Error(`No JSON object found in ${filePath}`);
  }

  return JSON.parse(raw.slice(jsonStart));
};

const formatValue = (value) => value === null ? "null" : JSON.stringify(value);

const main = () => {
  const casePack = readCasePack(casePackPath);
  const cases = casePack.cases || [];
  let failures = 0;

  console.log(`Testing ${cases.length} public sample cases from ${casePackPath}`);

  for (const sample of cases) {
    const response = buildResponse(sample.input, analyzeTicket(sample.input));
    const expected = sample.expected_output || {};
    const mismatches = comparableFields.filter((field) => !Object.is(response[field], expected[field]));

    if (mismatches.length > 0) {
      failures += 1;
      console.log(`FAIL ${sample.id} ${sample.label}`);
      for (const field of mismatches) {
        console.log(`  ${field}: expected=${formatValue(expected[field])} actual=${formatValue(response[field])}`);
      }
      continue;
    }

    console.log(
      `OK ${sample.id} relevant_transaction_id=${formatValue(response.relevant_transaction_id)} ` +
      `case_type=${response.case_type} verdict=${response.evidence_verdict}`
    );
  }

  console.log(`\nSummary: ${cases.length - failures}/${cases.length} passed`);

  if (failures > 0) {
    process.exitCode = 1;
  }
};

try {
  main();
} catch (error) {
  console.error(`Sample test failed: ${error.message}`);
  process.exitCode = 1;
}
