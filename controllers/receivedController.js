const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};
const pool = mysql.createPool(dbConfig);

exports.addReceivedEmail = async (req, res) => {
  const { from_email, subject, message, received_at } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO received_emails (sender_email, subject, message, received_at) VALUES (?, ?, ?, ?)',
      [from_email, subject, message, received_at]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('Insert error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};
