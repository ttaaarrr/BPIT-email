require('dotenv').config();
const express = require("express");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const cors = require("cors");
const path = require("path");
const db = require("./services/db");
const { checkSalesAndMarketing } = require('./middleware/Checkrole');
const { router: receivedMailRouter, fetchEmailsForUser } = require('./routes/received_mail');
const { router: imapRouter } = require('./routes/imap');
const processEmailQueue = require("./cron/emailSender");
const cron = require("node-cron");

// Routes
const replyMailRouter = require('./routes/send_reply_mail');
const emailRoutes = require('./routes/emailRoutes');
const resolveRecipientsRoute = require("./routes/resolveRecipients");
const authRoutes = require('./routes/authRoutes');
const registerRoutes = require("./routes/Register");
const customerRoutes = require("./routes/customer");
const inOutRoutes = require("./routes/in-out");
const profileRoutes = require("./routes/profile");
const userRoutes = require("./routes/user");
const sendMailRoutes = require('./routes/sendmail');
const emailHistoryRouter = require('./routes/emailhistory');
const reportRoutes = require('./routes/reports');
const forgotpass = require("./routes/forgotpass");
const connect = require("./api/pop-imap-connect-email");
const signatureRoutes = require('./routes/signatures');

const app = express();
const port = 5000;

// Middleware
app.use(cors({
  origin: ["http://localhost:3000", "https://test99.bpit-staff.com"],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Session store
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "your_db_name"
});

app.use(session({
  secret: process.env.SESSION_SECRET || "some-secret-key",
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: "lax"
  }
}));

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public","pages" ,"login.html"));
});

app.get("/api/check-session", (req, res) => {
    if (req.session.user && req.session.user.id) {
    res.json({ 
      loggedIn: true, 
      email: req.session.user.email,
      department: req.session.user.department,
      fullname: req.session.user.fullname
    });
  } else {
    res.json({ loggedIn: false });
  }
});

// Protect createmail.html
app.get('/createmail.html',  (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'createmail.html'));
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use("/api", registerRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api", inOutRoutes);
app.use("/api", profileRoutes);
app.use("/api/send-email", sendMailRoutes);
app.use("/api/email-history", emailHistoryRouter);
app.use("/api", userRoutes);
app.use("/auth", authRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/resolve-recipients", resolveRecipientsRoute);
app.use("/api/reports", reportRoutes);
app.use("/api/received", receivedMailRouter);
app.use("/api", signatureRoutes);
app.use("/mail", replyMailRouter);
app.use("/", imapRouter);
app.use("/", forgotpass);
app.use("/", connect);

// Error handling
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ success: false, message: 'Something went wrong' });
});

// Auto fetch email by session
const getLoggedInUserIds = async () => {
  const [rows] = await db.query("SELECT data FROM sessions");
  const userIds = [];

  for (const row of rows) {
    try {
      const sessionData = JSON.parse(row.data);
      const userId =
        sessionData.userId ||
        (sessionData.passport && sessionData.passport.user) ||
        (sessionData.user && sessionData.user.id);

      if (userId && !userIds.includes(userId)) {
        userIds.push(userId);
      }
    } catch (err) {
      console.error("❌ Failed to parse session data:", err.message);
    }
  }

  return userIds;
};

setInterval(async () => {
  try {
    const userIdsToFetch = await getLoggedInUserIds();
    for (const userId of userIdsToFetch) {
      try {
        await fetchEmailsForUser(userId);
        console.log(`✅ Auto fetch emails for user ${userId} done.`);
      } catch (err) {
        console.error(`❌ Error auto fetching emails for user ${userId}:`, err.message);
      }
    }
  } catch (err) {
    console.error(`❌ Error getting logged in user IDs:`, err.message);
  }
}, 60 * 1000);

// Cron for sending email queue
console.log("🔧 ตั้งค่า cron job...");
cron.schedule("*/1 * * * *", () => {
  console.log("⏱ เริ่มส่งคิวอีเมล...");
  processEmailQueue();
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${port} is already in use. Try another one.`);
    process.exit(1);
  } else {
    throw err;
  }
});