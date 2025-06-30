//routes//sendmail.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const emailService = require("../services/emailservice");
const pool = require('../services/db'); // สมมติใช้ mysql2/promise connection pool

// ตั้งค่า multer สำหรับเก็บไฟล์แนบ
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const safeName = file.originalname.replace(/\s+/g, "_");
    cb(null, uniqueSuffix + "-" + safeName);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

async function getRecipientsByArea(province, district) {
  // ตัวอย่าง
  const [rows] = await pool.execute(
    "SELECT email FROM customers WHERE province = ? AND (district = ? OR ? = '')",
    [province, district, district]
  );
  return rows.map((row) => row.email);
}

// API ส่งอีเมล พร้อมรองรับไฟล์แนบ
router.post("/", upload.array("attachments"), async (req, res) => {
  try {
    console.log("Session user:", req.session?.user);
    console.log("Request body:", req.body);
    console.log("Files:", req.files);

    const user = req.session?.user;
    if (!user || !user.id) {
      return res.status(401).json({ success: false, message: "ยังไม่ได้เข้าสู่ระบบ" });
    }

    const {
      to_email,
      cc_email,
      bcc_email,
      subject,
      message,
      note,
      sendScope,
      province,
      district,
    } = req.body;

    // ตรวจสอบข้อมูลหัวข้อและข้อความ
    if (!subject || !message) {
      return res.status(400).json({ success: false, message: "กรุณากรอกหัวข้อและข้อความ" });
    }

    // กำหนด recipientList ตาม sendScope
    let recipientList = [];

    if (sendScope === "all") {
      if (!to_email) {
        return res.status(400).json({ success: false, message: "กรุณาเลือกผู้รับอีเมล" });
      }
      recipientList = to_email
        .split(",")
        .map((email) => email.trim())
        .filter((e) => e);
    } else if (sendScope === "area") {
      recipientList = await getRecipientsByArea(province, district);
    }

    if (recipientList.length === 0) {
      return res.status(400).json({ success: false, message: "ไม่พบผู้รับอีเมล" });
    }

    // จัดการ attachments จากไฟล์ที่อัพโหลด
    let attachments = (req.files || []).map((file) => ({
      filename: file.originalname,
      savedFilename: file.filename,
      url: `/uploads/${file.filename}`,
      path: file.path,
    }));

    // รองรับ attachments แบบ base64 จาก req.body.attachments (ถ้ามี)
    if (req.body.attachments && typeof req.body.attachments === "string") {
      try {
        const base64Attachments = JSON.parse(req.body.attachments);
        const decoded = base64Attachments.map((file) => ({
          savedFilename: file.savedFilename || file.filename,
          url: file.url || `/uploads/${file.savedFilename || file.filename}`,
          content: Buffer.from(file.base64, "base64"),
          contentType: file.contentType || "application/octet-stream",
        }));
        attachments = attachments.concat(decoded);
      } catch (e) {
        console.error("แปลง base64 attachment ไม่สำเร็จ:", e);
      }
    }

    // เพิ่มอีเมลลง email_queue ใน DB
    const conn = await pool.getConnection();
    const insertSql = `
      INSERT INTO email_queue
      (sender_email, recipient_email, subject, message, attachments, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    for (const recipient of recipientList) {
      await conn.execute(insertSql, [
        user.email,
        recipient,
        subject,
        message,
        JSON.stringify(attachments),
        note || "",
      ]);
    }
    conn.release();

    res.json({
      success: true,
      message: `เพิ่มอีเมล ${recipientList.length} รายการลงคิวเรียบร้อย`,
      queued_count: recipientList.length,
      uploaded_files: attachments.map((f) => ({
        filename: f.filename,
        savedFilename: f.savedFilename,
        url: f.url,
      })),
    });
  } catch (error) {
    console.error("ส่งอีเมลล้มเหลว:", error);
    res.status(500).json({ success: false, message: "ส่งอีเมลไม่สำเร็จ" });
  }
});

// ตัวอย่าง route สำหรับดึงจำนวนอีเมลที่ส่งไปแล้ว
router.get('/sent/count', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute('SELECT COUNT(*) AS count FROM sent_emails');
    res.json({ count: rows[0].count });
  } catch (error) {
    console.error('Error fetching sent count:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
