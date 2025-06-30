const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const mysql = require('mysql2/promise');
require('dotenv').config();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() }); // เก็บไฟล์ไว้ใน memory

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user && req.session.user.id) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

router.post('/reply', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { originalEmailId, replyText, attachments } = req.body;

    if (!originalEmailId || !replyText) {
      return res.status(400).json({ error: 'Missing originalEmailId or replyText' });
    }

    const [rows] = await pool.query(
      'SELECT sender_email, subject FROM received_emails WHERE id = ? AND user_id = ?',
      [originalEmailId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Original email not found' });
    }

    const recipientEmail = rows[0].sender_email;
    const originalSubject = rows[0].subject;

    if (!validateEmail(recipientEmail)) {
      return res.status(400).json({ error: 'Invalid recipient email' });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: process.env.EMAIL_USER,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
        accessToken: process.env.GOOGLE_ACCESS_TOKEN,
      },
    });

    const subject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`;

    const mailAttachments = Array.isArray(attachments)
      ? attachments.map(att => ({
          filename: att.filename,
          content: Buffer.from(att.base64, 'base64'),
          contentType: att.contentType || 'application/octet-stream',
        }))
      : [];

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: recipientEmail,
      subject,
      text: replyText,
      attachments: mailAttachments,
    };

    await transporter.sendMail(mailOptions);

    res.json({ success: true, message: 'ส่งอีเมลตอบกลับพร้อมไฟล์แนบเรียบร้อยแล้ว' });
  } catch (error) {
    console.error('Error sending reply mail:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการส่งอีเมล' });
  }
});

module.exports = router;
