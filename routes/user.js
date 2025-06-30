const express = require("express");
const router = express.Router();
const db = require("../services/db");

// GET /api/users – รายชื่อผู้ใช้ทั้งหมด
router.get("/users", async (req, res) => {
  try {
    const [users] = await db.query("SELECT id, full_name, email, department, branch FROM users");

    if (users.length === 0) {
      return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้" });
    }

    res.json(users);
  } catch (err) {
    console.error("❌ Error fetching users:", err);
    res.status(500).json({ message: "เกิดข้อผิดพลาด", error: err.message });
  }
});

module.exports = router;
