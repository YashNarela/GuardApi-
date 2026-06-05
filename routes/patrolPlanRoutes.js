// const router = require("express").Router();
// const auth = require("../middleware/auth");
// const {
//   createPatrolPlan,
//   getPatrolPlans,
//   updatePatrolPlan,
//   deletePatrolPlan,
//   getGuardPatrolPlans,
// } = require("../controllers/patrolPlanController");

// // Supervisor routes
// router.post("/", auth(["supervisor"]), createPatrolPlan);
// router.get("/", auth(["supervisor"]), getPatrolPlans);
// router.put("/:id", auth(["supervisor"]), updatePatrolPlan);
// router.delete("/:id", auth(["supervisor"]), deletePatrolPlan);

// // Guard routes
// router.get("/my-plans", auth(["guard"]), getGuardPatrolPlans);

// module.exports = router;


// routes/patrolPlan.js - Updated routes
const router = require("express").Router();
const auth = require("../middleware/auth");
const {
  createPatrolPlan,
  getPatrolPlans,
  updatePatrolPlan,
  deletePatrolPlan,
  getGuardPatrolPlans,
  removeGuardFromPlan,
  addGuardToPlan,
} = require("../controllers/patrolPlanController");

// Supervisor routes
router.post("/", auth(["supervisor"]), createPatrolPlan);
router.get("/", auth(["employee", "supervisor"]), getPatrolPlans);
router.put("/:id", auth(["supervisor"]), updatePatrolPlan);
router.delete("/:id", auth(["supervisor"]), deletePatrolPlan);

// Guard management routes
router.post("/:planId/guards", auth(["supervisor"]), addGuardToPlan);
router.delete("/:planId/guards/:guardId", auth(["supervisor"]), removeGuardFromPlan);

// Guard routes
router.get("/my-plans", auth(["guard"]), getGuardPatrolPlans);


module.exports = router;