const router = require("express").Router();
const schedulerAuth = require("../middleware/schedulerAuth");
const { sendPerformanceReportEmail } = require("../controllers/schedulerController");
// Called by AWS EventBridge Scheduler (or any trusted caller with the secret)
// POST /api/scheduler/send-performance-report
// Headers: x-scheduler-secret: <SCHEDULER_SECRET>
// Body: { to, guardId, startDate, endDate, shiftId, timezone }
router.post("/send-", schedulerAuth, sendPerformanceReportEmail);
// router.post("/send-", sendPerformanceReportEmail);

// Test endpoint — sends ONE simple email to verify mail config is working
// GET /api/scheduler/test-email
const sendEmail = require("../utils/sendEmail");
router.get("/test-email", async (req, res) => {
  try {
    await sendEmail({
      to: ["yashnarela01@gmail.com", "skukreja@flair-solution.com"],
      subject: "Test Email — Guard Patrol Mail Config",
      html: "<h2>Test Email</h2><p>If you received this, the mail configuration is working correctly.</p>",
    });
    res.json({ success: true, message: "Test email sent to yashnarela01@gmail.com and skukreja@flair-solution.com. Check your inbox." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
