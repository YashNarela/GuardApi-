// Updated guardRoutes.js
const router = require("express").Router();
const auth = require("../middleware/auth");
const { upload } = require("../middleware/multer");
const {
  createGuard,
  getGuards,
  updateGuard,
  deleteGuard,
} = require("../controllers/guardController");

// Remove the incident route from here since it has its own file now
router.post("/", auth(["supervisor"]), createGuard);
router.get("/", auth(["supervisor", "employee"]), getGuards);
router.put("/:id", auth(["supervisor", "employee"]), updateGuard);
router.delete("/:id", auth(["supervisor", "employee"]), deleteGuard);

module.exports = router;
