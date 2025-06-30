const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const pool = require('../services/db'); // ใช้ mysql2 promise pool
require('dotenv').config();

const router = express.Router();

// ✅ ส่งลิงก์รีเซ็ตรหัสผ่าน
router.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    console.log('Forgot password request for email:', email);

    if (!email) return res.status(400).json({ message: 'Email is required' });

    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    console.log('User query result:', users);

    if (users.length === 0) {
      return res.json({ message: 'If this email is registered, you will receive a reset link.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    await pool.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)',
      [users[0].id, token, expiresAt]
    );
    console.log('Inserted password reset token');

    // ส่งเมล (ปรับ smtp ของคุณ)
    const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
   user: process.env.EMAIL_USER,
   pass: process.env.EMAIL_PASS,
  },
});

   const resetLink = `http://localhost:5000/pages/reset-password.html?token=${token}`;

    await transporter.sendMail({
      from: '"Support BPIT" <no-reply@yourdomain.com>',
      to: email,
      subject: 'Password Reset Request',
      html: `คลิก <a href="${resetLink}">ตั้งรหัสผ่านใหม่</a> เพื่อรีเซ็ตรหัสผ่านของคุณ ลิงก์นี้จะหมดอายุใน 1 ชั่วโมง`,
    });
    console.log('Sent reset email');

    res.json({ message: 'ทำการส่งลิงก์รีเซ็ตรหัสผ่านทางเมลแล้ว' });
  } catch (error) {
    console.error('Error in forgot-password:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ รีเซ็ตรหัสผ่าน
router.post('/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Token and new password are required' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW() AND used = 0',
      [token]
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    const resetEntry = rows[0];
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query('UPDATE users SET password = ? WHERE id = ?', [
      hashedPassword,
      resetEntry.user_id,
    ]);

    await pool.query('UPDATE password_resets SET used = 1 WHERE id = ?', [resetEntry.id]);

    res.json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
