const { execSync } = require('child_process');

function promptGuiOtp(mobileNo = '7483731338') {
  try {
    const script = `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.Interaction]::InputBox('Enter the 6-digit OTP received on mobile ${mobileNo}:', 'Karnataka One OTP Authentication', '')`;
    const otp = execSync(`powershell -Command "${script}"`, { encoding: 'utf-8' }).trim();
    return otp;
  } catch (e) {
    console.error('GUI Prompt Error:', e.message);
    return '';
  }
}

if (require.main === module) {
  console.log('Testing GUI OTP Prompt...');
  const res = promptGuiOtp('7483731338');
  console.log('Result from GUI prompt:', res);
}

module.exports = { promptGuiOtp };
