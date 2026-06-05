const User = require("../models/User");
const bcrypt = require("bcryptjs");
const ApiResponse = require("../utils/apiResponse");

const QR = require("../models/QR");

const Shift = require("../models/Shift");

const PatrolPlan = require("../models/PatrolPlan");

const Incident = require("../models/Incident");
const Patrol = require("../models/Patrol");
// Create Employee (Admin only)
exports.createEmployee = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json(new ApiResponse(false, "All fields required"));
    }

    const exists = await User.findOne({ email: email });
    if (exists) {
      return res
        .status(400)
        .json(new ApiResponse(false, "Email already exists"));
    }

    const hash = await bcrypt.hash(password, 12);

    const employee = await User.create({
      name: name.trim(),
      email: email,
      password: hash,
      role: "employee",
      createdBy: req.user.id, // admin who created
    });

    const { password: _, ...employeeData } = employee.toObject();

    return res
      .status(201)
      .json(
        new ApiResponse(true, "Employee created successfully", employeeData),
      );
  } catch (err) {
    console.error(err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// Get Employees
exports.getEmployees = async (req, res) => {
  try {
    const employees = await User.find({ role: "employee" })
      .select("-password")
      .populate("createdBy", "name email password phone");

    return res
      .status(200)
      .json(new ApiResponse(true, "Employees fetched successfully", employees));
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;

    if (password) {
      const salt = await bcrypt.genSalt(12);
      updateData.password = await bcrypt.hash(password, salt);
    }

    const updated = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    }).select("-password");

    if (!updated) {
      return res.status(404).json(new ApiResponse(false, "Employee not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(true, "Employee updated successfully", updated));
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};
exports.updateGuard = async (req, res) => {
  try {
    const updateData = { ...req.body };

    // ✅ If password is provided, hash it
    if (updateData.password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(updateData.password, salt);
    } else {
      delete updateData.password; // avoid overwriting with empty string
    }

    const guard = await User.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.id },
      updateData, // ✅ now using hashed data
      { new: true },
    ).select("-password"); // don’t expose password in response

    if (!guard) {
      return res.status(404).json(new ApiResponse(false, "Guard not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(true, "Guard updated successfully", { guard }));
  } catch (err) {
    return res
      .status(500)
      .json(new ApiResponse(false, "Server error: " + err.message));
  }
};

// Delete Employee
exports.deleteEmployee = async (req, res) => {
  try {
    console.log("req from the admin", req.params.id);

    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json(new ApiResponse(false, "Employee not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(true, "Employee deleted successfully"));
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

exports.getEmployeeDashboard = async (req, res) => {
  try {
    const employeeId = req.user.id;

    console.log("req---->", employeeId);

    // Get all supervisors and guards under this employee
    const supervisors = await User.find({
      createdBy: employeeId,
      role: "supervisor",
      isActive: true,
    });

    console.log("supervisor-->", supervisors);

    const guards = await User.find({
      createdBy: employeeId,
      role: "guard",
      isActive: true,
    });

    console.log("guards-->", guards);

    // Get QR codes created by this employee
    const qrCodes = await QR.find({ createdBy: employeeId });

    console.log("qrcodes--->", qrCodes);

    // Get patrol plans from supervisors
    const supervisorIds = supervisors.map((s) => s._id);
    const patrolPlans = await PatrolPlan.find({
      createdBy: { $in: supervisorIds },
      isActive: true,
    });

    console.log("supervisors Id-->", supervisorIds);

    console.log("petrol plans-->", patrolPlans);

    // Calculate date ranges
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    // Get patrol statistics
    const guardIds = guards.map((g) => g._id);

    const [todayPatrols, monthlyPatrols, totalIncidents, pendingIncidents] =
      await Promise.all([
        Patrol.countDocuments({
          guard: { $in: guardIds },
          createdAt: { $gte: today, $lt: tomorrow },
        }),
        Patrol.countDocuments({
          guard: { $in: guardIds },
          createdAt: { $gte: monthStart },
        }),
        Incident.countDocuments({
          reportedBy: { $in: guardIds },
        }),
        Incident.countDocuments({
          reportedBy: { $in: guardIds },
          status: { $in: ["reported", "investigating"] },
        }),
      ]);

    // Active shifts
    const activeShifts = await Shift.find({
      guard: { $in: guardIds },
      startTime: { $lte: new Date() },
      endTime: { $gte: new Date() },
    }).populate("guard", "name email");

    // Guard performance summary
    const guardPerformance = await Promise.all(
      guards.slice(0, 10).map(async (guard) => {
        const totalPatrols = await Patrol.countDocuments({
          guard: guard._id,
          createdAt: { $gte: monthStart },
        });
        const completedPatrols = await Patrol.countDocuments({
          guard: guard._id,
          isVerified: true,
          createdAt: { $gte: monthStart },
        });

        const percentage =
          totalPatrols > 0
            ? Math.round((completedPatrols / totalPatrols) * 100)
            : 0;

        return {
          guardId: guard._id,
          guardName: guard.name,
          totalPatrols,
          completedPatrols,
          percentage,
        };
      }),
    );

    const dashboardData = {
      stats: {
        totalSupervisors: supervisors.length,
        totalGuards: guards.length,
        totalQRCodes: qrCodes.length,
        totalPatrolPlans: patrolPlans.length,
        activeShifts: activeShifts.length,
        todayPatrols,
        monthlyPatrols,
        totalIncidents,
        pendingIncidents,
      },
      guardPerformance: guardPerformance.sort(
        (a, b) => b.percentage - a.percentage,
      ),
      activeShifts,
      recentActivity: {
        supervisors: supervisors.slice(0, 5),
        guards: guards.slice(0, 5),
        patrolPlans: patrolPlans.slice(0, 5),
      },
    };

    return res
      .status(200)
      .json(new ApiResponse(true, "Employee dashboard", dashboardData));
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// Get Master Data for Employee
exports.getMasterData = async (req, res) => {
  try {
    const employeeId = req.user.id;
    const { type } = req.query; // 'guards', 'patrol-plans', 'checkpoints'

    let data = {};

    if (!type || type === "guards") {
      const guards = await User.find({
        createdBy: employeeId,
        role: "guard",
      })
        .select("name email isActive createdAt")
        .sort({ createdAt: -1 });
      data.guards = guards;
    }

    if (!type || type === "patrol-plans") {
      const supervisors = await User.find({
        createdBy: employeeId,
        role: "supervisor",
      });
      const supervisorIds = supervisors.map((s) => s._id);

      const patrolPlans = await PatrolPlan.find({
        createdBy: { $in: supervisorIds },
      })
        .populate("createdBy", "name email")
        .populate("assignedGuards", "name email")
        .populate("shift", "startTime endTime shiftType")
        .sort({ createdAt: -1 });

      data.patrolPlans = patrolPlans;
    }

    if (!type || type === "checkpoints") {
      const qrCodes = await QR.find({
        createdBy: employeeId,
      }).sort({ createdAt: -1 });
      data.checkpoints = qrCodes;
    }

    if (!type || type === "supervisors") {
      const supervisors = await User.find({
        createdBy: employeeId,
        role: "supervisor",
      })
        .populate("guards", "name email")
        .sort({ createdAt: -1 });
      data.supervisors = supervisors;
    }

    return res
      .status(200)
      .json(new ApiResponse(true, "Master data fetched", data));
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// Get Company Reports
exports.getCompanyReports = async (req, res) => {
  try {
    const employeeId = req.user.id;
    const { reportType = "patrol", period = "month" } = req.query;

    // Date range calculation
    let startDate;
    const now = new Date();

    switch (period) {
      case "week":
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case "month":
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case "year":
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        startDate = new Date(now.setMonth(now.getMonth() - 1));
    }

    const guards = await User.find({
      createdBy: employeeId,
      role: "guard",
    });
    const guardIds = guards.map((g) => g._id);

    let reportData = {};

    if (reportType === "patrol") {
      // Patrol Report
      const patrols = await Patrol.find({
        guard: { $in: guardIds },
        createdAt: { $gte: startDate },
      }).populate("guard", "name email");

      const patrolsByGuard = {};
      patrols.forEach((patrol) => {
        const guardKey = patrol.guard._id.toString();
        if (!patrolsByGuard[guardKey]) {
          patrolsByGuard[guardKey] = {
            guard: patrol.guard,
            total: 0,
            verified: 0,
            patrols: [],
          };
        }
        patrolsByGuard[guardKey].total++;
        if (patrol.isVerified) patrolsByGuard[guardKey].verified++;
        patrolsByGuard[guardKey].patrols.push(patrol);
      });

      reportData = {
        type: "patrol",
        period,
        summary: {
          totalPatrols: patrols.length,
          totalGuards: Object.keys(patrolsByGuard).length,
          averageVerificationRate:
            Object.values(patrolsByGuard).length > 0
              ? Math.round(
                  Object.values(patrolsByGuard).reduce(
                    (sum, g) => sum + (g.verified / g.total) * 100,
                    0,
                  ) / Object.values(patrolsByGuard).length,
                )
              : 0,
        },
        guardData: Object.values(patrolsByGuard).map((g) => ({
          guard: g.guard,
          totalPatrols: g.total,
          verifiedPatrols: g.verified,
          verificationRate: Math.round((g.verified / g.total) * 100),
        })),
      };
    } else if (reportType === "incident") {
      // Incident Report
      const incidents = await Incident.find({
        reportedBy: { $in: guardIds },
        createdAt: { $gte: startDate },
      }).populate("reportedBy", "name email");

      const incidentStats = {
        total: incidents.length,
        byStatus: {},
        bySeverity: {},
        byType: {},
      };

      incidents.forEach((incident) => {
        // By status
        incidentStats.byStatus[incident.status] =
          (incidentStats.byStatus[incident.status] || 0) + 1;
        // By severity
        incidentStats.bySeverity[incident.severity] =
          (incidentStats.bySeverity[incident.severity] || 0) + 1;
        // By type
        incidentStats.byType[incident.type] =
          (incidentStats.byType[incident.type] || 0) + 1;
      });

      reportData = {
        type: "incident",
        period,
        summary: incidentStats,
        incidents: incidents.slice(0, 50), // Latest 50 incidents
      };
    }

    return res
      .status(200)
      .json(new ApiResponse(true, "Report generated", reportData));
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};
