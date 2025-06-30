const cron = require("node-cron");
const { fetchEmailsForAllUsers } = require("./fetchEmails");
const db = require("../services/db");

// 📦 ดึง email accounts จากฐานข้อมูลก่อนใช้งาน
const getEmailAccountsFromDB = async () => {
  const [rows] = await db.execute("SELECT * FROM email_accounts");
  return rows;
};

cron.schedule("*/5 * * * *", async () => {
  console.log("🕒 Scheduled job started...");

  try {
    const accounts = await getEmailAccountsFromDB();

    for (const account of accounts) {
      const config = {
        imap: {
          user: account.email,
          password: account.password,
          host: account.imap_host,
          port: 993,
          tls: true,
          authTimeout: 3000
        }
      };

      await fetchEmailsForAllUsers(config); // ✅ ส่ง config เข้าไป
    }
  } catch (err) {
    console.error("❌ Error in scheduler:", err);
  }
});
