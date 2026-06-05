const router = require("express").Router();
const auth = require("../middleware/auth");
const { getSupervisors ,updateSupervisors ,deleteSupervisor ,  getSupervisorDashboard} = require("../controllers/supervisorController");


router.get("/getlist", auth(["employee"]), getSupervisors);
router.put("/:id", auth(["employee"]),updateSupervisors )

router.delete("/:id", auth(["employee"]), deleteSupervisor  );
router.get(
  "/dashboard",
  auth(["supervisor"]),
  getSupervisorDashboard
);
module.exports = router;