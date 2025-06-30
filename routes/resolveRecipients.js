// routes/resolveRecipients.js
const express = require("express");
const router = express.Router();
const db = require("../services/db");


router.post("/", async (req, res) => {
    const { tags } = req.body;

    if (!tags || !Array.isArray(tags)) {
        return res.status(400).json({ success: false, message: "tags is required." });
    }

    let emails = [];

    try {
        for (let tag of tags) {
            const keyword = tag.replace("@", "").trim();
            const [provinceResults] = await db.query("SELECT email FROM customers WHERE province = ?", [keyword]);
            const [districtResults] = await db.query("SELECT email FROM customers WHERE district = ?", [keyword]);

            provinceResults.forEach(row => emails.push(row.email));
            districtResults.forEach(row => emails.push(row.email));
        }

        // ลบอีเมลซ้ำ
        emails = [...new Set(emails)];

        return res.json({ success: true, emails });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
});

module.exports = router;