const express = require('express');
const router = express.Router();
const Imap = require('imap');
const nodemailer = require('nodemailer');
const db = require('../services/db'); // แก้เป็น path จริงของคุณ
const authMiddleware = require('../middleware/authMiddleware'); // แก้ path

router.post('/connect-email', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const {
    smtp_host, smtp_port, smtp_user, smtp_pass, smtp_tls,
    imap_host, imap_port, imap_user, imap_pass, imap_tls,
  } = req.body;

  try {
    // 1. ทดสอบเชื่อมต่อ SMTP
    const transporter = nodemailer.createTransport({
      host: smtp_host,
      port: parseInt(smtp_port, 10),
      secure: smtp_port === 465, // true ถ้าใช้ port 465
      auth: { user: smtp_user, pass: smtp_pass },
    });
    await transporter.verify();

    // 2. ทดสอบเชื่อมต่อ IMAP
    await new Promise((resolve, reject) => {
      const imap = new Imap({
        user: imap_user,
        password: imap_pass,
        host: imap_host,
        port: parseInt(imap_port, 10),
        tls: imap_tls === true || imap_tls === 'true',
      });

      imap.once('ready', () => {
        imap.end();
        resolve();
      });

      imap.once('error', (err) => reject(err));
      imap.connect();
    });

    // 3. บันทึกข้อมูล SMTP
    await db.query(
      `INSERT INTO email_accounts (user_id, protocol, email, password, host, port, tls)
       VALUES (?, 'smtp', ?, ?, ?, ?, ?)`,
      [userId, smtp_user, smtp_pass, smtp_host, smtp_port, smtp_tls === true || smtp_tls === 'true']
    );

    // 4. บันทึกข้อมูล IMAP
    await db.query(
      `INSERT INTO email_accounts (user_id, protocol, email, password, host, port, tls)
       VALUES (?, 'imap', ?, ?, ?, ?, ?)`,
      [userId, imap_user, imap_pass, imap_host, imap_port, imap_tls === true || imap_tls === 'true']
    );

    res.json({ success: true, message: 'เชื่อมต่อ SMTP และ IMAP สำเร็จ' });
  } catch (err) {
    console.error('Connect error:', err);
    res.status(400).json({ success: false, error: err.message || 'เชื่อมต่อไม่สำเร็จ' });
  }
});

module.exports = router;
