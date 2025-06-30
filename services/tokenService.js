// services/tokenService.js

const { google } = require("googleapis");
const axios = require("axios");
const db = require("./db");

// Google OAuth2 client
const googleOAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// รีเฟรช Google Access Token
async function refreshGoogleToken(userId) {
  const [rows] = await db.query(
    "SELECT refreshToken FROM user_tokens WHERE user_id = ? AND provider = 'google'",
    [userId]
  );
  const refreshToken = rows[0]?.refreshToken;
  if (!refreshToken) throw new Error("No refresh token for Google");

  googleOAuth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await googleOAuth2Client.refreshAccessToken();
  const newAccessToken = credentials.access_token;

  await db.query(
    "UPDATE user_tokens SET accessToken = ? WHERE user_id = ? AND provider = 'google'",
    [newAccessToken, userId]
  );

  return newAccessToken;
}

// รีเฟรช Outlook Access Token
async function refreshOutlookToken(userId) {
  const [rows] = await db.query(
    "SELECT refreshToken FROM user_tokens WHERE user_id = ? AND provider = 'outlook'",
    [userId]
  );
  const refreshToken = rows[0]?.refreshToken;
  if (!refreshToken) throw new Error("No refresh token for Outlook");

  const tokenResponse = await axios.post(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    new URLSearchParams({
      client_id: process.env.OUTLOOK_CLIENT_ID,
      client_secret: process.env.OUTLOOK_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      redirect_uri: process.env.OUTLOOK_REDIRECT_URI,
    }).toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );

  const newAccessToken = tokenResponse.data.access_token;

  await db.query(
    "UPDATE user_tokens SET accessToken = ? WHERE user_id = ? AND provider = 'outlook'",
    [newAccessToken, userId]
  );

  return newAccessToken;
}

module.exports = {
  refreshGoogleToken,
  refreshOutlookToken,
};
