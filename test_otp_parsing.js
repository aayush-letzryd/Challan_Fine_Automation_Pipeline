const { extractOtpFromMessage } = require('./otp_fetcher');

const testCases = [
  { input: '<#> DO NOT SHARE: 276663 is your 6 digit OTP to LOGIN to the OLA Operator App.', expected: '276663' },
  { input: 'Your OTP for Karnataka One guest traffic fine login is 583920. Valid for 10 minutes.', expected: '583920' },
  { input: 'Use 491028 as your OTP for Karnataka One portal login.', expected: '491028' },
  { input: '482910 is your OTP for Karnataka One. Do not share.', expected: '482910' },
  { input: 'Ola! Your Device Sim is successfully verified on August 31 2026 at 06:05PM', expected: null },
];

let allPassed = true;
for (const tc of testCases) {
  const actual = extractOtpFromMessage(tc.input);
  const pass = actual === tc.expected;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] Input: "${tc.input.substring(0, 45)}..." => Got: ${actual} | Expected: ${tc.expected}`);
  if (!pass) allPassed = false;
}

console.log(`\nOverall Test: ${allPassed ? 'ALL TESTS PASSED!' : 'SOME TESTS FAILED'}`);
