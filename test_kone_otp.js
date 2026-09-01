const testMessages = [
  "Your OTP to Validate Mobile No. is 5871 And the OTP is valid for 15 minutes only. From KARONE,JX-KARONE-S,September 1 2026 at 12:11PM",
  "Your OTP to Validate Mobile No. is 9365 And the OTP is valid for 15 minutes only. From KARONE",
  "<#> DO NOT SHARE: 276663 is your 6 digit OTP to LOGIN to the OLA Operator App.",
  "Your OTP for Karnataka One guest traffic fine login is 583920. Valid for 10 minutes.",
  "Use 491028 as your OTP for Karnataka One portal login.",
  "482910 is your OTP for Karnataka One. Do not share."
];

function extractOtp(text) {
  if (!text) return null;
  
  // Strategy 1: Look for number right after "is", "OTP is", "is: ", etc.
  const keywordMatch = text.match(/(?:is|OTP|code|no\.?\s*is)\s*[:\s]?\s*(\b\d{4,6}\b)/i);
  if (keywordMatch && !['2024', '2025', '2026', '2027'].includes(keywordMatch[1])) {
    return keywordMatch[1];
  }

  // Strategy 2: Look for 6-digit or 4-digit standalone number
  const matches = text.match(/\b\d{6}\b/g) || text.match(/\b\d{4}\b/g);
  if (matches) {
    for (const code of matches) {
      if (!['2024', '2025', '2026', '2027'].includes(code)) {
        return code;
      }
    }
  }

  return null;
}

for (const msg of testMessages) {
  console.log(`Input: "${msg.substring(0, 60)}..." => Extracted OTP: ${extractOtp(msg)}`);
}
