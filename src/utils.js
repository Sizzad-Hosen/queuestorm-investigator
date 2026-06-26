function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[।,!?;:()[\]{}"'`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function extractNumbers(text) {
  const englishNumbers = String(text).match(/\d+/g) || [];

  const banglaMap = {
    "০": "0",
    "১": "1",
    "২": "2",
    "৩": "3",
    "৪": "4",
    "৫": "5",
    "৬": "6",
    "৭": "7",
    "৮": "8",
    "৯": "9"
  };

  const converted = String(text).replace(/[০-৯]/g, d => banglaMap[d]);
  const banglaNumbers = converted.match(/\d+/g) || [];

  return [...new Set([...englishNumbers, ...banglaNumbers])]
    .map(Number)
    .filter(n => !Number.isNaN(n));
}

function isBangla(text) {
  return /[\u0980-\u09FF]/.test(text);
}

export const utlis={
      normalizeText,
  includesAny,
  extractNumbers,
  isBangla

}