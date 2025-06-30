const express = require('express');
const router = express.Router();
const db = require('../services/db');

router.post('/save-signature', async (req, res) => {
  const { user_id, signature_html } = req.body;
  try {
    await db.query(
      'REPLACE INTO signatures (user_id, signature_html) VALUES (?, ?)',
      [user_id, signature_html]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error saving signature:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

router.post('/signature/:user_id', async (req, res) => {
  const { user_id } = req.params;
  try {
    const [rows] = await db.query(
      'SELECT signature_html FROM signatures WHERE user_id = ?',
      [user_id]
    );
    res.json({ signature: rows[0]?.signature_html || '' });
  } catch (error) {
    console.error('❌ Error fetching signature:', error);
    res.status(500).json({ signature: '' });
  }
});

module.exports = router;
