import { includesAny } from "./utils.js";

export const detectSafetyRisk = (text) => {
  const credentialKeywords = [
    "otp",
    "pin",
    "password",
    "passcode",
    "verification code",
    "security code",
    "à¦“à¦Ÿà¦¿à¦ªà¦¿",
    "à¦ªà¦¿à¦¨",
    "à¦ªà¦¾à¦¸à¦“à¦¯à¦¼à¦¾à¦°à§à¦¡",
    "à¦ªà¦¾à¦¸à¦“à§Ÿà¦¾à¦°à§à¦¡",
    "à¦­à§‡à¦°à¦¿à¦«à¦¿à¦•à§‡à¦¶à¦¨ à¦•à§‹à¦¡"
  ];

  const scamKeywords = [
    "scam",
    "fraud",
    "phishing",
    "fake",
    "unknown number",
    "account block",
    "blocked",
    "link",
    "click",
    "caller",
    "called me",
    "à¦­à§à¦¯à¦¼à¦¾",
    "à¦­à§à§Ÿà¦¾",
    "à¦ªà§à¦°à¦¤à¦¾à¦°à¦•",
    "à¦¸à§à¦•à§à¦¯à¦¾à¦®",
    "à¦²à¦¿à¦‚à¦•",
    "à¦•à§à¦²à¦¿à¦•",
    "à¦…à§à¦¯à¦¾à¦•à¦¾à¦‰à¦¨à§à¦Ÿ à¦¬à¦¨à§à¦§",
    "à¦à¦•à¦¾à¦‰à¦¨à§à¦Ÿ à¦¬à¦¨à§à¦§"
  ];

  const hasCredentialRisk = includesAny(text, credentialKeywords);
  const hasScamRisk = includesAny(text, scamKeywords);

  return {
    isPhishing: hasCredentialRisk || hasScamRisk,
    reasonCodes: [
      ...(hasCredentialRisk ? ["credential_request_detected"] : []),
      ...(hasScamRisk ? ["social_engineering_signal"] : [])
    ]
  };
};
