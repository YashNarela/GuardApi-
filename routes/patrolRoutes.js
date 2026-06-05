// routes/patrolRoutes.js
const router = require("express").Router();
const auth = require("../middleware/auth");
const { upload } = require("../middleware/multer");
const {
  scanQR,
  getPatrolLogs,
  getPatrolSummary,
  getGuardDashboard,
  getGuardPerformanceReport,
  getShiftQRCodes,
  completeCheckpoint,
} = require("../controllers/patrolController");

// Guard routes
router.post("/scan", auth(["guard"]), upload.single("photo"), scanQR);
router.get("/dashboard", auth(["guard"]), getGuardDashboard);
router.get("/shift-qr", auth(["guard"]), getShiftQRCodes);
router.post("/complete-checkpoint", auth(["guard"]), completeCheckpoint);

// Supervisor/Employee routes
router.post("/logs", auth(["employee", "supervisor"]), getPatrolLogs);
router.get("/summary", auth(["employee", "supervisor"]), getPatrolSummary);

router.post(
  "/performance-report",
  auth(["employee", "supervisor"]),
  getGuardPerformanceReport
);

module.exports = router;
