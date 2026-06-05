const router = require("express").Router();
const schedulerAuth = require("../middleware/schedulerAuth");
const { sendPerformanceReportEmail } = require("../controllers/schedulerController");

// Called by AWS EventBridge Scheduler (or any trusted caller with the secret)
// POST /api/scheduler/send-performance-report
// Headers: x-scheduler-secret: <SCHEDULER_SECRET>
// Body: { to, guardId, startDate, endDate, shiftId, timezone }
router.post("/send-", schedulerAuth, sendPerformanceReportEmail);
// router.post("/send-", sendPerformanceReportEmail);


module.exports = router;
