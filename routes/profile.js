const express = require("express");
const router = express.Router();
const db = require("../services/db");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/profile", authMiddleware, async (req, res) => {
  console.log("🧾 [API] /api/profile called");
  console.log("🔐 Session:", req.session);

  try {
    const userId = req.session.user?.id;  // <-- แก้ตรงนี้

    if (!userId) {
      return res.status(403).json({ message: "ยังไม่ได้เข้าสู่ระบบ" });
    }

    const [rows] = await db.query(
      "SELECT full_name, department, email FROM users WHERE id = ?",
      [userId]
    );

    console.log("📄 Rows from DB:", rows);

    if (rows.length === 0) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ เกิดข้อผิดพลาดใน /api/profile:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;
