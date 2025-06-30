const pool = require("../services/db");
const emailService = require("../services/emailservice");

async function processEmailQueue() {
  const conn = await pool.getConnection();

  try {
    // 1. นับอีเมลที่ส่งไปแล้วใน 1 ชั่วโมงล่าสุด
    const [countResult] = await conn.execute(`
      SELECT COUNT(*) AS sentLastHour FROM sent_emails
      WHERE sent_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
    `);
    const sentLastHour = countResult[0].sentLastHour;

    const limit = 125;
    const quota = parseInt(limit - sentLastHour, 10);

    console.log("📊 limit:", limit);
    console.log("📨 ส่งไปแล้วในชั่วโมงนี้:", sentLastHour);
    console.log("📈 quota ที่เหลือ:", quota);

    if (!Number.isInteger(quota) || quota <= 0) {
      console.log("⚠️ quota ผิด หรือไม่มี quota เหลือ:", quota);
      return;
    }

    // 2. ดึงอีเมลที่ยังไม่ได้ส่งตาม quota (ใช้ string interpolation เพื่อเลี่ยงปัญหา LIMIT ?)
    const [queue] = await conn.query(`
      SELECT * FROM email_queue
      WHERE sent = FALSE
      ORDER BY created_at ASC
      LIMIT ${quota}
    `);

    // 3. ส่งอีเมลทีละฉบับ
    for (const email of queue) {
      let attachments = [];
      if (typeof email.attachments === "string") {
        try {
          attachments = JSON.parse(email.attachments);
        } catch {
          attachments = [];
        }
      } else if (Array.isArray(email.attachments)) {
        attachments = email.attachments;
      }

      // 4. เติม user_id ถ้ายังไม่มี
      if (!email.user_id) {
        const [userRow] = await conn.execute(
          `SELECT user_id FROM email_accounts WHERE email = ? AND protocol = 'smtp' LIMIT 1`,
          [email.sender_email]
        );
        if (userRow.length > 0) {
          email.user_id = userRow[0].user_id;
        } else {
          console.error(`❌ ไม่พบ user_id สำหรับ sender_email=${email.sender_email}, ข้าม email_queue.id=${email.id}`);
          continue;
        }
      }

      // 5. ส่งอีเมล
      try {
        const result = await emailService.sendEmail({
          user: { id: email.user_id, email: email.sender_email },
          to_email: email.recipient_email,
          subject: email.subject,
          message: email.message,
          note: email.note,
          attachments,
        });

        if (result.success) {
          await conn.execute(
            `UPDATE email_queue SET sent = TRUE, sent_at = NOW() WHERE id = ?`,
            [email.id]
          );
        }
      } catch (err) {
        console.error(`❌ ส่งอีเมลล้มเหลว (email_queue.id=${email.id}):`, err.message);
      }
    }

    console.log(`📤 ส่งอีเมลเรียบร้อย ${queue.length} ฉบับ`);
  } catch (error) {
    console.error("❌ Cron ส่งอีเมลล้มเหลว:", error);
  } finally {
    conn.release();
  }
}

module.exports = processEmailQueue;
