// routes/imap.js
const express = require('express');
const router = express.Router();
const Imap = require('imap-simple');
const { simpleParser } = require('mailparser');
const mysql = require('mysql2/promise');
require('dotenv').config();

// สร้าง pool สำหรับฐานข้อมูล
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// ฟังก์ชันหลักสำหรับดึงเมลจาก IMAP
async function fetchCompanyEmails({ userId, email, password, imapHost, imapPort = 993, imapTls = true }) {
  const configImap = {
  imap: {
    user: email,
    password,
    host: imapHost,
    port: imapPort,
    tls: imapPort === 993, // true ถ้า 993
    autotls: imapPort === 143 ? 'always' : 'never', // ใช้ starttls ถ้า 143
    tlsOptions: { rejectUnauthorized: false }, // ปิด verify certificate ชั่วคราว
    authTimeout: 10000, // กำหนด timeout ถ้าช้าเกินไป
  }
};

  // ถ้าใช้พอร์ต 143 แสดงว่าอาจเป็น STARTTLS
  if (imapPort === 143) {
    configImap.imap.tls = false;
    configImap.imap.autotls = 'always';
  }

  console.log('IMAP config:', configImap);

  let connection;
  try {
    connection = await Imap.connect(configImap);
    connection.on('error', err => {
  console.error('IMAP connection error:', err);
});
    await connection.openBox('INBOX');

    const messages = await connection.search(['ALL'], { bodies: [''], struct: true, markSeen: false });

    for (const item of messages) {
      const all = item.parts.find(p => p.which === '');
      if (!all || !all.body) continue;

      const raw = Buffer.isBuffer(all.body) ? all.body.toString('utf8') : all.body;
      let parsed;
      try {
        parsed = await simpleParser(raw);
      } catch (e) {
        console.error('Parse error:', e.message);
        continue;
      }

      const senderEmail = parsed.from?.value?.[0]?.address || '(ไม่ทราบผู้ส่ง)';
      const subject = parsed.subject || '(ไม่มีหัวข้อ)';
      const textBody = parsed.text || '';
      const receivedDate = parsed.date || new Date();

      await pool.query(
        `INSERT INTO received_emails (user_id, sender_email, subject, body_text, received_date)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, senderEmail, subject, textBody, receivedDate]
      );
    }

    await connection.end();
    return { success: true, message: 'ดึงเมลบริษัทสำเร็จ' };
  } catch (error) {
    if (connection) {
      try { await connection.end(); } catch {}
    }
    throw error;
  }
}

// Route: POST /fetch-company-emails
router.post('/fetch-company-emails', async (req, res) => {
  try {
    const { userId = 1, email, password, imapHost, imapPort = 993, imapTls = true } = req.body;

    if (!email || !password || !imapHost) {
      return res.status(400).json({ error: 'กรุณาระบุ email, password และ imapHost' });
    }

    const result = await fetchCompanyEmails({ userId, email, password, imapHost, imapPort, imapTls });
    res.json(result);
  } catch (error) {
    console.error('Fetch email error:', error);
    res.status(500).json({ error: 'ไม่สามารถดึงเมลได้', details: error.message });
  }
});

module.exports = {
  router,
  fetchCompanyEmails,
};
