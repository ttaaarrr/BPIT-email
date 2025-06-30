//service/emailservice.js
const mysql = require('mysql2/promise');
const nodemailer = require("nodemailer");
const db = require("./db");
const path = require("path");

async function sendEmail({ user, to_email, cc_email, bcc_email, subject, message, note, attachments }) {
  // ดึง config SMTP จากฐานข้อมูล
  const [rows] = await db.query(
    `SELECT email, password, host, port, tls FROM email_accounts WHERE user_id = ? AND protocol = 'smtp' LIMIT 1`,
    [user.id]
  );

  if (!rows.length) {
    throw new Error("ไม่พบการตั้งค่า SMTP สำหรับผู้ใช้นี้");
  }

  const smtp = rows[0];

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: parseInt(smtp.port),
    secure: smtp.port === 465,
    auth: {
      user: smtp.email,
      pass: smtp.password,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  // แปลง attachments สำหรับ nodemailer
  const processedAttachments = (attachments || []).map(att => {
    if (att.base64) {
      // base64 file
      return {
        filename: att.filename,
        content: Buffer.from(att.base64, 'base64'),
        contentType: att.contentType || 'application/octet-stream'
      };
    } else if (att.path) {
      // file from disk
      return {
        filename: att.filename,
        path: att.path,
        contentType: att.contentType || 'application/octet-stream'
      };
    }
    // fallback
    return att;
  });

  // เตรียมข้อมูล attachments สำหรับเก็บใน DB (ไม่เก็บ content/base64)
const attachmentsForDb = processedAttachments.map(att => {
  let savedFilename = null;

  if (att.path) {
    // ดึงเฉพาะชื่อไฟล์โดยใช้ path.basename
    savedFilename = path.basename(att.path);
  }

  const url = savedFilename ? `/uploads/${savedFilename}` : null;

  return {
    filename: att.filename,
    contentType: att.contentType,
    savedFilename,
    url
  };
});

  const mailOptions = {
    from: `"${user.email}" <${smtp.email}>`,
    to: to_email,
    cc: cc_email || '',
    bcc: bcc_email || '',
    subject,
    text: message,
    html: `<div>${message}</div>`,
    attachments: processedAttachments
  };

  // ส่งอีเมล
  await transporter.sendMail(mailOptions);

  // บันทึกข้อมูลอีเมลและไฟล์แนบลง DB
  await db.query(
    `INSERT INTO sent_emails (sender_email, recipient_email, subject, message, attachments, note, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [
      smtp.email,
      to_email,
      subject,
      message,
      JSON.stringify(attachmentsForDb),
      note
    ]
  );

  return { success: true, message: "ส่งอีเมลสำเร็จ" };
}

module.exports = { sendEmail };
