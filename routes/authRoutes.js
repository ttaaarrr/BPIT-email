// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const { google } = require("googleapis");
const axios = require("axios");
const crypto = require("crypto");
const db = require("../services/db");
const dayjs = require("dayjs");

// Google OAuth2 setup
const googleOAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Outlook OAuth2 config
const outlookClientId = process.env.OUTLOOK_CLIENT_ID;
const outlookClientSecret = process.env.OUTLOOK_CLIENT_SECRET;
const outlookRedirectUri = process.env.OUTLOOK_REDIRECT_URI;

// Helper: calculate expiry_date from expires_in (seconds)
function calcExpiry(expiresInSec) {
  return dayjs()
    .add(expiresInSec, "second")
    .format("YYYY-MM-DD HH:mm:ss"); // Local time
}
/** ---------- Google OAuth2 ---------- */

// 1) Redirect to Google
router.get("/google", (req, res) => {
  const scopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://mail.google.com/",
    "openid",
  ];
  const url = googleOAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
  });
  res.redirect(url);
});

// 2) Google callback
router.get("/google/callback", async (req, res) => {
  try {
    const code = req.query.code;
    const { tokens } = await googleOAuth2Client.getToken(code);
    googleOAuth2Client.setCredentials(tokens);

    // Fetch user info
    const oauth2 = google.oauth2({ auth: googleOAuth2Client, version: "v2" });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;
    const fullName = userInfo.data.name;

    // Upsert into users
    await db.query(
      `INSERT INTO users (email, password, full_name, nickname, department, branch)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         full_name = VALUES(full_name)`,
      [email, "oauth", fullName, "", "", ""]
    );

    // Get user_id
    const [rows] = await db.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );
    const userId = rows[0].id;

    // Upsert tokens
    const expiryDate = calcExpiry(tokens.expires_in || 3600);
    if (tokens.refresh_token) {
      await db.query(
        `INSERT INTO user_tokens 
           (user_id, email, provider, accessToken, refreshToken, expiry_date)
         VALUES (?, ?, 'google', ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           accessToken = VALUES(accessToken),
           refreshToken = VALUES(refreshToken),
           expiry_date = VALUES(expiry_date)`,
        [userId, email, tokens.access_token, tokens.refresh_token, expiryDate]
      );
    } else {
      await db.query(
        `UPDATE user_tokens
         SET accessToken = ?, expiry_date = ?
         WHERE user_id = ? AND provider = 'google'`,
        [tokens.access_token, expiryDate, userId]
      );
    }

    // Session
    req.session.user = {
      id: userId,
      email,
      full_name: fullName,
      provider: "google",
    };

    res.redirect("http://localhost:5000");
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res.status(500).send("Login failed");
  }
});

/** ---------- Outlook OAuth2 ---------- */

// 1) Redirect to Microsoft login
router.get("/outlook", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: outlookClientId,
    response_type: "code",
    redirect_uri: outlookRedirectUri,
    response_mode: "query",
    scope: "offline_access openid email profile https://outlook.office.com/SMTP.Send",
    state,
  });
  res.redirect(
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`
  );
});

// 2) Outlook callback
router.get("/outlook/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!state || state !== req.session.oauthState) {
      return res.status(400).send("Invalid state parameter");
    }
    if (!code) {
      return res.status(400).send("No code received");
    }

    // Exchange code for tokens
    const tokenRes = await axios.post(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      new URLSearchParams({
        client_id: outlookClientId,
        client_secret: outlookClientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: outlookRedirectUri,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    const tokens = tokenRes.data;

    // Fetch profile
    const profileRes = await axios.get("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const email = profileRes.data.mail || profileRes.data.userPrincipalName;
    const fullName = profileRes.data.displayName;

    // Upsert into users
    await db.query(
      `INSERT INTO users (email, password, full_name, nickname, department, branch)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         full_name = VALUES(full_name)`,
      [email, "oauth", fullName, "", "", ""]
    );

    // Get user_id
    const [rows] = await db.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );
    const userId = rows[0].id;

    // Upsert tokens
    const expiryDate = calcExpiry(tokens.expires_in || 3600);
    if (tokens.refresh_token) {
      await db.query(
        `INSERT INTO user_tokens
           (user_id, email, provider, accessToken, refreshToken, expiry_date)
         VALUES (?, ?, 'outlook', ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           accessToken = VALUES(accessToken),
           refreshToken = VALUES(refreshToken),
           expiry_date = VALUES(expiry_date)`,
        [userId, email, tokens.access_token, tokens.refresh_token, expiryDate]
      );
    } else {
      await db.query(
        `UPDATE user_tokens
         SET accessToken = ?, expiry_date = ?
         WHERE user_id = ? AND provider = 'outlook'`,
        [tokens.access_token, expiryDate, userId]
      );
    }

    delete req.session.oauthState;
    req.session.user = {
      id: userId,
      email,
      full_name: fullName,
      provider: "outlook",
    };

    res.redirect("http://localhost:5000");
  } catch (err) {
    console.error("Outlook OAuth callback error:", err.response?.data || err);
    res.status(500).send("Login failed");
  }
});

module.exports = router;
