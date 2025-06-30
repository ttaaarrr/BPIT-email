function checkSalesAndMarketing(req, res, next) {
  console.log('🔐 ตรวจสิทธิ์ user:', req.session.user);

  const user = req.session.user;
  if (user && user.department === 'ฝ่ายขายและการตลาด') {
    return next(); // ✅ ผ่าน
  }
  return res.status(403).send('❌ ไม่สามารถให้เข้าถึงหน้านี้ได้');
}

module.exports = { checkSalesAndMarketing };
