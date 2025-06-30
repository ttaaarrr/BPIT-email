// db.js
const mysql = require("mysql2/promise"); // ใช้ mysql2/promise เพื่อใช้งาน async/await
require("dotenv").config(); // โหลดค่าตัวแปร environment จาก .env

// สร้างการเชื่อมต่อฐานข้อมูลด้วย connection pool
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ทดสอบการเชื่อมต่อฐานข้อมูล
db.getConnection()
  .then(connection => {
    console.log("✅ Connected to the database!");
    connection.release(); // ปล่อยการเชื่อมต่อกลับมา
  })
  .catch(err => {
    console.error("❌ Database connection failed:", err);
  });

module.exports = db; // ส่งออกตัวแปร db ให้สามารถใช้งานในไฟล์อื่น
