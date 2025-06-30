const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(403).json({ message: 'Token is required' });
  }

  jwt.verify(token, 'your_secret_key', (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'กรุณาล็อคอิน' });
    }

    req.user = decoded; // เพิ่มข้อมูลผู้ใช้ลงใน request
    next(); // ไปยัง middleware ถัดไป
  });
};