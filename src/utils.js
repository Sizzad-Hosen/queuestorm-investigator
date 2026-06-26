export const normalizeText = (text) => {
  return String(text || "")
    .toLowerCase()
    .replace(/[\u0964,!?;:()[\]{}"'`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const includesAny = (text, keywords) => {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
};

export const extractNumbers = (text) => {
  const englishNumbers = String(text).match(/\d+/g) || [];

  const banglaMap = {
    "\u09E6": "0",
    "\u09E7": "1",
    "\u09E8": "2",
    "\u09E9": "3",
    "\u09EA": "4",
    "\u09EB": "5",
    "\u09EC": "6",
    "\u09ED": "7",
    "\u09EE": "8",
    "\u09EF": "9"
  };

  const converted = String(text).replace(/[\u09E6-\u09EF]/g, d => banglaMap[d]);
  const banglaNumbers = converted.match(/\d+/g) || [];

  return [...new Set([...englishNumbers, ...banglaNumbers])]
    .map(Number)
    .filter(n => !Number.isNaN(n));
};

export const isBangla = (text) => {
  return /[\u0980-\u09FF]/.test(text);
};
