module.exports = (req, res, next) => {
  const secret = req.headers["x-scheduler-secret"];
  if (!secret || secret !== process.env.SCHEDULER_SECRET) {
    return res.status(401).json({ success: false, msg: "Unauthorized scheduler request" });
  }
  next();
};
