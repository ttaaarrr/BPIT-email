const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const db = require("../services/db");

// ฟังก์ชันหลัก ดึงเมลของทุกบัญชี
async function fetchEmailsForAllUsers(config) {
    console.log('>>> เริ่มดึงเมลสำหรับ:', config.imap.user);
  try {
    const connection = await imaps.connect(config);
    await connection.openBox('INBOX');

    const searchCriteria = ['ALL'];
    const fetchOptions = { bodies: [''], markSeen: false };

    const messages = await connection.search(searchCriteria, fetchOptions);

    for (const item of messages) {
      const all = item.parts.find(part => part.which === '');
      const uid = item.attributes.uid;
      const parsed = await simpleParser(all.body);

      const sender_email = parsed.from?.value[0]?.address || '';
      const recipient_email = config.imap.user;
      const subject = parsed.subject || '';
      const message = parsed.text || '';
      const received_at = parsed.date || new Date();
      const is_read = 0; // ยังไม่อ่าน

      // attachments ต้องแปลงให้อยู่ในรูปแบบที่เก็บใน DB ได้ (เช่น JSON string หรือ null)
      let attachments = null;
      if (parsed.attachments && parsed.attachments.length > 0) {
        attachments = JSON.stringify(parsed.attachments.map(att => ({
          filename: att.filename,
          contentType: att.contentType,
          size: att.size
        })));
      }

      console.log('Insert email:', { uid, sender_email, recipient_email, subject, received_at });

      const sql = `
        INSERT IGNORE INTO received_emails
        (id, sender_email, recipient_email, subject, message, attachments, received_at, is_read)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      // id เป็น AUTO_INCREMENT ให้ใส่ NULL
      await db.execute(sql, [
        null,
        sender_email,
        recipient_email,
        subject,
        message,
        attachments,
        received_at,
        is_read
      ]);
    }

    await connection.end();
  } catch (err) {
    console.error('❌ Error fetching emails for', config.imap.user, err);
  }
}

module.exports = {
  fetchEmailsForAllUsers
};
