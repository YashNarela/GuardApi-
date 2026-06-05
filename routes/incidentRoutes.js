const router = require("express").Router();
const auth = require("../middleware/auth");
const { upload } = require("../middleware/multer");
const {
  reportIncident,
  getIncidents,
  updateIncidentStatus,
  getIncidentStats,
} = require("../controllers/incidentController");

router.post("/", auth(["guard"]), upload.array("files", 5), reportIncident);
router.get("/", auth(["guard", "supervisor", "employee"]), getIncidents);
router.put(
  "/:id/status",
  auth(["supervisor", "employee"]),
  updateIncidentStatus
);
router.get("/stats", auth(["supervisor", "employee"]), getIncidentStats);

module.exports = router;
