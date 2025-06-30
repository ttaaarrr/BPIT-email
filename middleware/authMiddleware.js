const authMiddleware = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(403).json({ message: "กรุณาล็อคอิน" });
  }

  // กำหนด req.user จาก session.user
  req.user = {
    id: req.session.user.id,
    email: req.session.user.email,
    fullname: req.session.user.fullname
  };

  next();
};

module.exports = authMiddleware;
