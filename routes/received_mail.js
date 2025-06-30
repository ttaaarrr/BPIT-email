// routes/received_mail.js
const express = require('express');
const router = express.Router();
const Imap = require('imap-simple');
const mysql = require('mysql2/promise');
const axios = require('axios');
require('dotenv').config();
const { simpleParser } = require('mailparser');
const db = require('../services/db');
// DB config
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};
const pool = mysql.createPool(dbConfig);

function isAuthenticated(req, res, next) {
  if (req.session.user && req.session.user.id) {
    next();
  } else if (req.session.userId) {
    req.session.user = { id: req.session.userId };
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
}
// ฟังก์ชัน truncateText
function truncateText(text, maxLength = 1000) {
  if (!text) return '';
  text = text.trim();
  if (text.length <= maxLength) return text;

  const trimmed = text.slice(0, maxLength);
  const lastSpace = trimmed.lastIndexOf(' ');
  return (lastSpace > 0 ? trimmed.slice(0, lastSpace) : trimmed) + '...';
}

// ฟังก์ชัน sanitize ข้อความจากอีเมล
function sanitizeMessage(parsed) {
  const rawText = parsed.text?.trim() || '';
  const rawHtml = parsed.html?.trim() || '';
  const attachments = parsed.attachments || [];

  if (rawText) {
    return escapeHtml(truncateText(rawText, 500));
  }

  if (rawHtml) {
    const cleaned = rawHtml
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<img[^>]*>/gi, '')
      .replace(/<\/?[^>]+(>|$)/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned
      ? escapeHtml(truncateText(cleaned, 500))
      : '(อีเมลนี้มีแค่รูปภาพ ไม่มีข้อความ)';
  }

  if (attachments.length > 0) {
    return '(อีเมลนี้มีเฉพาะไฟล์แนบ ไม่มีข้อความ)';
  }

  return '(ไม่มีข้อความในอีเมล)';
}
function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/[&<>"']/g, function(m) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
  });
}

async function refreshAccessToken(provider, refreshToken) {
  const params = new URLSearchParams();
  if (provider === 'google') {
    params.append('client_id', process.env.GOOGLE_CLIENT_ID);
    params.append('client_secret', process.env.GOOGLE_CLIENT_SECRET);
    params.append('refresh_token', refreshToken);
    params.append('grant_type', 'refresh_token');
    const response = await axios.post('https://oauth2.googleapis.com/token', params);
    return { accessToken: response.data.access_token, expiresIn: response.data.expires_in };
  } else if (provider === 'outlook') {
    params.append('client_id', process.env.OUTLOOK_CLIENT_ID);
    params.append('client_secret', process.env.OUTLOOK_CLIENT_SECRET);
    params.append('refresh_token', refreshToken);
    params.append('grant_type', 'refresh_token');
    params.append('scope', 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access');
    const response = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', params);
    return { accessToken: response.data.access_token, expiresIn: response.data.expires_in };
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

function buildXOAuth2Token(userEmail, accessToken) {
  const authString = `user=${userEmail}\x01auth=Bearer ${accessToken}\x01\x01`;
  return Buffer.from(authString).toString('base64');
}

async function fetchEmailsForUser(userId) {
  let connection;
  try {
    const [rows] = await pool.query(
      `SELECT protocol, email, password, host, port, tls FROM email_accounts WHERE user_id = ? LIMIT 1`,
      [userId]
    );

    if (!rows.length) throw new Error('ไม่พบการตั้งค่าอีเมลของผู้ใช้');

    const { protocol, email: userEmail, password: userPassword, host, port, tls } = rows[0];

    if (protocol !== 'imap') {
      throw new Error(`โปรโตคอล ${protocol} ยังไม่รองรับใน fetchEmailsForUser`);
    }

    const config = {
      imap: {
        user: userEmail,
        password: userPassword,
        host,
        port,
        tls,
        authTimeout: 10000,
        tlsOptions: { rejectUnauthorized: false },
      }
    };

    connection = await Imap.connect(config);
    await connection.openBox('INBOX');

    const messages = await connection.search(['ALL'], {
      bodies: [''],
      struct: true,
      markSeen: false,
    });

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

      const from = parsed.from?.value?.[0] || {};
      const senderDisplay = from.name || from.address || '';
      const cleanSender = escapeHtml(senderDisplay);
      const recipient = escapeHtml(parsed.to?.text || '');
      const senderName = from.name || '';

      let htmlContent = parsed.html || '';
      if (parsed.attachments?.length) {
        parsed.attachments.forEach(att => {
          if (att.cid) {
            const base64 = att.content.toString('base64');
            const mimeType = att.contentType;
            const dataUri = `data:${mimeType};base64,${base64}`;
            htmlContent = htmlContent.replace(new RegExp(`cid:${att.cid}`, 'g'), dataUri);
          }
        });
      }

      const subject = escapeHtml(truncateText(parsed.subject || '(No Subject)', 100));

      let message;
      const rawText = parsed.text?.trim() || '';
      const rawHtml = htmlContent?.trim() || '';

      if (rawText) {
        message = escapeHtml(rawText);
      } else if (rawHtml) {
        const cleaned = rawHtml
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<img[^>]*>/gi, '')
          .replace(/<\/?[^>]+(>|$)/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        message = cleaned ? escapeHtml(cleaned) : '(อีเมลนี้มีแค่รูปภาพ ไม่มีข้อความ)';
      } else if (parsed.attachments?.length > 0) {
        message = '(อีเมลนี้มีเฉพาะไฟล์แนบ ไม่มีข้อความ)';
      } else {
        message = '(ไม่มีข้อความในอีเมล)';
      }

      const date = parsed.date || new Date();
      const messageId = parsed.messageId || `uid-${item.attributes.uid}-${date.getTime()}`;

      const [existing] = await pool.query(
        `SELECT id FROM received_emails WHERE user_id = ? AND message_id = ?`,
        [userId, messageId]
      );
      if (existing.length > 0) continue;

      const processedAttachments = (parsed.attachments || []).map(att => ({
        filename: att.filename,
        contentType: att.contentType,
        base64: att.content.toString('base64'),
      }));

      await pool.query(
        `INSERT INTO received_emails 
         (user_id, sender_email, recipient_email, subject, message, html_message, attachments, received_at, is_read, provider, message_id, sender_username)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          cleanSender,
          recipient,
          subject,
          message,
          htmlContent,
          JSON.stringify(processedAttachments),
          date,
          false,
          protocol,
          messageId,
          senderName
        ]
      );
    }

    await connection.end();
    return { success: true, message: 'ดึงอีเมลสำเร็จ' };
  } catch (error) {
    if (connection) try { await connection.end(); } catch {}
    console.error('Fetch error:', error.message);
    throw error;
  }
}


router.get('/fetch', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const result = await fetchEmailsForUser(userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'ไม่สามารถดึงอีเมลได้' });
  }
});

router.get('/list', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search.trim()}%` : null;
    const fromDate = req.query.fromDate || null;  // เปลี่ยนจาก 'from-date' เป็น 'fromDate'
    const toDateRaw = req.query.toDate || null;   // เปลี่ยนจาก 'to-date' เป็น 'toDate'

    let query = `SELECT id, subject, sender_email, received_at, is_read FROM received_emails WHERE user_id = ?`;
    let countQuery = `SELECT COUNT(*) as total FROM received_emails WHERE user_id = ?`;
    const queryParams = [userId];
    const countParams = [userId];

    if (search) {
      query += ` AND (subject LIKE ? OR sender_email LIKE ? OR message LIKE ?)`;
      countQuery += ` AND (subject LIKE ? OR sender_email LIKE ? OR message LIKE ?)`;
      queryParams.push(search, search, search);
      countParams.push(search, search, search);
    }

    if (fromDate) {
      query += ` AND received_at >= ?`;
      countQuery += ` AND received_at >= ?`;
      queryParams.push(fromDate);
      countParams.push(fromDate);
    }

    if (toDateRaw) {
      const toDateObj = new Date(toDateRaw);
      toDateObj.setHours(23, 59, 59, 999);
      const toDate = toDateObj.toISOString().slice(0, 19).replace('T', ' ');

      query += ` AND received_at <= ?`;
      countQuery += ` AND received_at <= ?`;
      queryParams.push(toDate);
      countParams.push(toDate);
    }

    query += ` ORDER BY received_at DESC LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    // ปิด cache ฝั่ง client
    res.set('Cache-Control', 'no-store');

    const [emails] = await pool.query(query, queryParams);
    const [countRows] = await pool.query(countQuery, countParams);
    const total = countRows[0].total;

    res.json({ page, limit, total, emails });
  } catch (error) {
    console.error('Error fetching emails list:', error);
    res.status(500).json({ error: 'Failed to fetch emails list.' });
  }
});


router.get('/count', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS count FROM received_emails');
    res.json({ count: rows[0].count });
  } catch (error) {
    console.error('SQL ERROR:', error);
    res.status(500).json({ error: error.message || 'Failed to get received emails count' });
  }
});

router.get('/:id', isAuthenticated, async (req, res) => {
  const userId = req.session.user.id;
  const emailId = req.params.id;
  try {
    const [rows] = await db.query("SELECT * FROM received_emails WHERE id = ?", [emailId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Email not found" });
    }

    const email = rows[0];

    let attachments = [];
    try {
      attachments = JSON.parse(email.attachments || '[]');
    } catch (err) {
      console.error("Error parsing attachments:", err);
    }

    res.json({
      id: email.id,
      subject: email.subject,
      message: email.message,
      html_content: email.html_message, // ✅ แก้ตรงนี้
      sender_email: email.sender_email,
      recipient_email: email.recipient_email,
      received_at: email.received_at,
      attachments,
    });
  } catch (err) {
    console.error("Error fetching email:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = {
  router,
  fetchEmailsForUser
};