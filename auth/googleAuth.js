// googleAuth.js
const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { OIDCStrategy } = require('passport-azure-ad'); // ใช้ OIDCStrategy สำหรับ Azure AD
require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');  // เพิ่มการใช้ path module

const app = express();

// ใส่ path ของไฟล์ key และ cert สำหรับ HTTPS
const options = {
  key: fs.readFileSync(path.join(__dirname, 'certificates', 'localhost-key.pem')), // ใช้เส้นทางที่ถูกต้อง
  cert: fs.readFileSync(path.join(__dirname, 'certificates', 'localhost.pem')) // ใช้เส้นทางที่ถูกต้อง
};

// ใช้ Google OAuth2
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'https://localhost:5000/auth/google/callback' // เปลี่ยนเป็น https://
}, function (accessToken, refreshToken, profile, done) {
  console.log('Google Profile:', profile);
  return done(null, profile);
}));

// ใช้ Outlook OAuth2
passport.use(new OIDCStrategy({
  clientID: process.env.OUTLOOK_CLIENT_ID,
  clientSecret: process.env.OUTLOOK_CLIENT_SECRET,
  callbackURL: 'https://localhost:5000/auth/outlook/callback',  // ต้องเป็น https://
  identityMetadata: `https://login.microsoftonline.com/${process.env.OUTLOOK_TENANT_ID}/v2.0/.well-known/openid-configuration`,
  responseType: 'code id_token',
  responseMode: 'form_post',
  scope: ['openid', 'profile', 'email']
}, function (issuer, sub, profile, accessToken, refreshToken, done) {
  console.log('Outlook Profile:', profile);
  return done(null, profile);
}));

// กำหนด serialize และ deserialize สำหรับ session
passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (user, done) {
  done(null, user);
});

// กำหนด express-session
app.use(require('express-session')({
  secret: 'yourSecretKey',
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

// Route สำหรับ Google OAuth2
app.get('/auth/google', passport.authenticate('google', {
  scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email']
}));

// Callback Route สำหรับ Google OAuth2
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), function (req, res) {
  res.redirect('/dashboard');
});

// Route สำหรับ Outlook OAuth2
app.get('/auth/outlook', passport.authenticate('azuread-openidconnect', {
  prompt: 'login',
  scope: ['openid', 'profile', 'email']
}));

// Callback Route สำหรับ Outlook OAuth2
app.post('/auth/outlook/callback', passport.authenticate('azuread-openidconnect', { failureRedirect: '/' }), function (req, res) {
  res.redirect('/dashboard');
});

// หน้า Dashboard สำหรับผู้ใช้ที่ล็อกอินแล้ว
app.get('/dashboard', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/');
  }
  res.send(`<h1>Welcome, ${req.user.displayName}</h1>`);
});

// หน้าแรกที่ให้ผู้ใช้สามารถเข้าถึง
app.get('/', (req, res) => {
  res.send('<a href="/auth/google">Login with Google</a><br><a href="/auth/outlook">Login with Outlook</a>');
});

// เริ่มเซิร์ฟเวอร์ HTTPS
https.createServer(options, app).listen(3000, () => {
  console.log('Server running on https://localhost:3000');
});
