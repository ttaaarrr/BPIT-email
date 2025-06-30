//routes/reports.js
const express = require('express');
const router = express.Router();
const pool = require('../services/db'); 
const authMiddleware = require('../middleware/authMiddleware'); // แก้ชื่อให้ตรงกับที่ export

// ใส่ middleware นี้ให้ router ทุก route ที่ต้องเช็ค login
router.use(authMiddleware);

// 📬 เมลที่ส่ง
router.get('/sent-emails', async (req, res) => {
  try {
    const userEmail = req.user.email;  // ดึงอีเมลผู้ใช้ที่ล็อกอิน
    const [rows] = await pool.query(
      'SELECT * FROM sent_emails WHERE sender_email = ? ORDER BY sent_at DESC',
      [userEmail]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 📥 เมลที่รับ
router.get('/received-emails', async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.query(
      `SELECT sender_email, subject, received_at
       FROM received_emails 
       WHERE user_id = ? 
       ORDER BY received_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching received emails:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 👤 ลูกค้า
router.get('/customers', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT * FROM customers 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Server error' });
  }
});
// GET /api/email/monthly-stats
router.get('/monthly-stats', async (req, res) => {
  try {
    const year = parseInt(req.query.year);  // รับปีจาก query param เช่น /monthly-stats?year=2025

    if (!year || isNaN(year)) {
      return res.status(400).json({ error: 'กรุณาระบุปีที่ถูกต้องใน query parameter เช่น ?year=2025' });
    }

    const [rows] = await pool.query(`
      SELECT
        years.year,
        months.month,
        IFNULL(counts.count, 0) AS count
      FROM
        (SELECT DISTINCT YEAR(sent_at) AS year FROM sent_emails WHERE YEAR(sent_at) = ?) AS years
      CROSS JOIN
        (SELECT 1 AS month UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL
         SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL
         SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12) AS months
      LEFT JOIN
        (
          SELECT YEAR(sent_at) AS year, MONTH(sent_at) AS month, COUNT(*) AS count
          FROM sent_emails
          WHERE YEAR(sent_at) = ?
          GROUP BY YEAR(sent_at), MONTH(sent_at)
        ) AS counts
      ON counts.year = years.year AND counts.month = months.month
      ORDER BY years.year, months.month;
    `, [year, year]);

    res.json(rows);
  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});
router.get('/email-customer-stats', async (req, res) => {
  const { month, year } = req.query;
  if (!year) return res.status(400).json({ error: 'Missing year' });

  // แปลงค่า month และ year เป็นตัวเลข
  const monthNum = parseInt(month) || 0;
  const yearNum = parseInt(year);

  try {
    const [results] = await pool.query(
      `SELECT
         u.full_name AS name,
         u.department,
         COUNT(DISTINCT CASE WHEN r.received_at IS NOT NULL AND ( ? = 0 OR MONTH(r.received_at) = ? ) AND YEAR(r.received_at) = ? THEN r.id END) AS email_month_count,
         COUNT(DISTINCT CASE WHEN YEAR(r.received_at) = ? THEN r.id END) AS email_year_count,
         COUNT(DISTINCT r.id) AS email_total_count,
         COUNT(DISTINCT CASE WHEN c.created_at IS NOT NULL AND ( ? = 0 OR MONTH(c.created_at) = ? ) AND YEAR(c.created_at) = ? THEN c.id END) AS customer_month_count,
         COUNT(DISTINCT CASE WHEN YEAR(c.created_at) = ? THEN c.id END) AS customer_year_count,
         COUNT(DISTINCT c.id) AS customer_total_count
       FROM users u
       LEFT JOIN received_emails r ON r.user_id = u.id
       LEFT JOIN customers c ON c.user_id = u.id
       GROUP BY u.id
       ORDER BY u.full_name`,
      [monthNum, monthNum, yearNum, yearNum, monthNum, monthNum, yearNum, yearNum]
    );

    res.json(results);
  } catch (err) {
    console.error('DB error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


module.exports = router;
