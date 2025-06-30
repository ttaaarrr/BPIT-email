const express = require('express');
const router = express.Router();
const pool = require('../services/db');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);  // ให้เช็ค session ก่อนทุก route ในนี้

router.get('/', async (req, res) => {
    console.log('req.user:', req.user);
  // หรือถ้าใช้ session
  console.log('req.session:', req.session);
  try {
    let { limit = 10, offset = 0, search = '', startDate = '', endDate = '' } = req.query;

    limit = parseInt(limit);
    offset = parseInt(offset);
    search = `%${search}%`;

    let whereClauses = [];
    let params = [];   // <-- ประกาศตัวแปร params ตรงนี้

    // สมมติกรองอีเมลเฉพาะของผู้ใช้ (จาก req.user.email)
    if (req.user && req.user.email) {
      whereClauses.push(`sender_email = ?`);
      params.push(req.user.email);
    }

    // เงื่อนไข search
    if (search && search !== '%%') {
      whereClauses.push(`(subject LIKE ? OR sender_email LIKE ? OR recipient_email LIKE ?)`);
      params.push(search, search, search);
    }

    // เงื่อนไขวันที่เริ่มต้น
    if (startDate) {
      whereClauses.push(`sent_at >= ?`);
      params.push(startDate);
    }

    // เงื่อนไขวันที่สิ้นสุด
    if (endDate) {
      whereClauses.push(`sent_at <= ?`);
      params.push(endDate);
    }

    let whereSQL = '';
    if (whereClauses.length > 0) {
      whereSQL = 'WHERE ' + whereClauses.join(' AND ');
    }

    // Query นับจำนวน
    const countQuery = `SELECT COUNT(*) AS total FROM sent_emails ${whereSQL}`;
    const [countRows] = await pool.query(countQuery, params);
    const total = countRows[0].total;

    // Query ดึงข้อมูลจริง พร้อม limit offset
    const dataQuery = `
      SELECT id, sender_email, recipient_email, subject, message, attachments, note, sent_at
      FROM sent_emails
      ${whereSQL}
      ORDER BY sent_at DESC
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const [rows] = await pool.query(dataQuery, params);

    // แปลง attachments จาก JSON string เป็น object
    const emails = rows.map(row => {
      let attachments = [];
      if (row.attachments) {
        if (typeof row.attachments === 'string') {
          try {
            attachments = JSON.parse(row.attachments);
          } catch (err) {
            attachments = [];
          }
        } else if (typeof row.attachments === 'object') {
          attachments = row.attachments;
        }
      }
      return {
        id: row.id,
        sender_email: row.sender_email,
        recipient_email: row.recipient_email,
        subject: row.subject,
        message: row.message,
        attachments: attachments,
        note: row.note,
        sent_at: row.sent_at
      };
    });

    res.json({ emails, total });

  } catch (error) {
    console.error('Error fetching email history:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
