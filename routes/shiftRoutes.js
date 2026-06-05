// routes/shiftRoutes.js
const router = require("express").Router();
const auth = require("../middleware/auth");
const {
  createShift,
  getShifts,
  deleteShift,
  updateShift,
} = require("../controllers/shiftController");

router.post("/", auth(["employee", "supervisor"]), createShift); // create shift
router.get("/", auth(["employee", "supervisor"]), getShifts); // list shifts
router.delete("/:id", auth(["employee", "supervisor"]), deleteShift); // delete shift

router.put("/:id", auth(["employee", "supervisor"]), updateShift); 

module.exports = router;
