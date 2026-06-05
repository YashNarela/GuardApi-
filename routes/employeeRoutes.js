// routes/employeeRoutes.js
const router = require("express").Router();
const auth = require("../middleware/auth");
const {
  createEmployee,
  getEmployees,
  updateEmployee,
  deleteEmployee,
  getEmployeeDashboard,
  getMasterData,
  getCompanyReports,
} = require("../controllers/employeeController");

// Admin routes for managing employees
router.get("/", auth(["admin"]), getEmployees);
router.post("/", auth(["admin"]), createEmployee);
router.put("/:id", auth(["admin"]), updateEmployee);
router.delete("/:id", auth(["admin"]), deleteEmployee);

// Employee dashboard and management routes
router.get("/dashboard", auth(["employee"]), getEmployeeDashboard);
router.get("/master", auth(["employee"]), getMasterData);
router.get("/reports", auth(["employee"]), getCompanyReports);

module.exports = router;
