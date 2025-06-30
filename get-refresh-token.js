const { google } = require('googleapis');
const readline = require('readline');
require('dotenv').config();

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI 
);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    'https://mail.google.com/',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ]
});

console.log('\n🔗 เปิดลิงก์นี้ในเบราว์เซอร์เพื่ออนุญาต:\n', authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('\n📥 วาง code ที่ได้จาก Google: ', async (code) => {
  rl.close();
  const { tokens } = await oAuth2Client.getToken(code);
  console.log('\n✅ Access Token:', tokens.access_token);
  console.log('🔁 Refresh Token:', tokens.refresh_token);
});
