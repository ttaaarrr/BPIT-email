//routes/in-out.js
const express = require("express");
const router = express.Router();
const db = require("../services/db");
const bcrypt = require("bcryptjs");

// ตรวจสอบอีเมลเบื้องต้น
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// 👉 Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !validateEmail(email)) {
    return res.status(400).json({ message: "อีเมลไม่ถูกต้อง" });
  }

  if (!password || password.length < 8) {
    return res.status(400).json({ message: "กรุณากรอกรหัสผ่านที่มีความยาวอย่างน้อย 8 ตัวอักษร" });
  }

  try {
    const [results] = await db.query("SELECT * FROM users WHERE email = ?", [email]);

    if (results.length === 0) {
      return res.status(404).json({ message: "ไม่พบผู้ใช้นี้ในระบบ" });
    }

    const user = results[0];

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "E-mail หรือ รหัสผ่านไม่ถูกต้อง" });
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      fullname: user.fullname,
       department: user.department,
    };

    return res.status(200).json({ message: "เข้าสู่ระบบสำเร็จ", user: req.session.user });

  } catch (err) {
    console.error("❌ Login error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดภายในระบบ", error: err.message });
  }
});

// 👉 Logout
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("❌ Logout failed:", err);
      return res.status(500).json({ message: "ออกจากระบบไม่สำเร็จ" });
    }
    res.clearCookie("connect.sid");
    res.status(200).json({ message: "ออกจากระบบสำเร็จ" });
  });
});

module.exports = router;
