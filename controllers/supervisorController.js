const ApiResponse=require("../utils/apiResponse")
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/keys");
const Incident = require("../models/Incident");
const Shift=require("../models/Shift")
const Patrol = require("../models/Patrol");
const PatrolPlan=require("../models/PatrolPlan")

exports.getSupervisors = async (req, res) => {
  try {
    const supervisors = await User.find({ 
      role: "supervisor", 
      createdBy: req.user.id 
    }).select("+password  ").populate("guards");

    return res.status(200).json(
      new ApiResponse(true, "Supervisors fetched successfully", supervisors)
    );
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};




exports.updateSupervisors = async (req, res) => {
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
      updateData,
      { new: true, runValidators: true }
    ).select("-password"); // don’t expose password

    if (!guard) {
      return res
        .status(404)
        .json(new ApiResponse(false, "Supervisor not found"));
    }

    return res
      .status(200)
      .json(
        new ApiResponse(true, "Supervisor updated successfully", { guard })
      );
  } catch (err) {
    console.error("Update supervisor error:", err);

    // ✅ Handle Mongo duplicate key error (E11000)
    if (err.code === 11000) {
      const duplicateField = Object.keys(err.keyValue)[0]; // e.g., "phone" or "email"
      return res
        .status(400)
        .json(
          new ApiResponse(
            false,
            `The ${duplicateField} "${err.keyValue[duplicateField]}" is already in use`
          )
        );
    }

    // ✅ Handle validation errors (like schema rules)
    if (err.name === "ValidationError") {
      return res.status(400).json(
        new ApiResponse(
          false,
          Object.values(err.errors)
            .map((e) => e.message)
            .join(", ")
        )
      );
    }

    // Generic fallback
    return res
      .status(500)
      .json(new ApiResponse(false, "Server error: " + err.message));
  }
};

// exports.deleteSupervisor = async (req, res) => {

//   try {
//     const supervisorId = req.params.id;

//     // Find supervisor
//     const supervisor = await User.findById(supervisorId);
//     if (!supervisor || supervisor.role !== "supervisor") {
//       return res.status(404).json(new ApiResponse(false, "Supervisor not found"));
//     }

//     // Reassign guards to company (employee)
//     await User.updateMany(
//       { supervisor: supervisorId },
//       {
//         supervisor: null,
//         parent: supervisor.companyId
//       }
//     );

//     // Remove supervisor from employee's supervisors array
//     await User.findByIdAndUpdate(
//       supervisor.companyId,
//       { $pull: { supervisors: supervisorId } }
//     );

//     // Delete supervisor
//     await User.findByIdAndDelete(supervisorId);

//     return res.status(200).json(new ApiResponse(true, "Supervisor deleted and guards reassigned"));
//   } catch (err) {
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };



// exports.deleteSupervisor = async (req, res) => {
//   try {
//     const supervisorId = req.params.id;
//     const { reassignToSupervisorId } = req.body;

//     // Find the supervisor being deleted
//     const supervisor = await User.findById(supervisorId);
//     if (!supervisor || supervisor.role !== "supervisor") {
//       return res
//         .status(404)
//         .json(new ApiResponse(false, "Supervisor not found"));
//     }

//     // Validate the new supervisor (must be in same company)
//     const newSupervisor = await User.findOne({
//       _id: reassignToSupervisorId,
//       companyId: supervisor.companyId,
//       role: "supervisor",
//       isActive: true,
//     });

//     if (!newSupervisor) {
//       return res
//         .status(400)
//         .json(
//           new ApiResponse(false, "Valid replacement supervisor is required")
//         );
//     }

//     // Reassign all guards from old supervisor to new supervisor
//     const updatedGuards = await User.updateMany(
//       { supervisor: supervisorId, role: "guard" },
//       {
//         supervisor: newSupervisor._id,
//         parent: newSupervisor._id,
//       }
//     );

//     // Add those guards to the new supervisor's guards array
//     const guardIds = await User.find({
//       supervisor: newSupervisor._id,
//       role: "guard",
//     }).distinct("_id");
//     await User.findByIdAndUpdate(newSupervisor._id, {
//       $addToSet: { guards: { $each: guardIds } },
//     });

//     // Remove supervisor from company’s supervisor list
//     await User.findByIdAndUpdate(supervisor.companyId, {
//       $pull: { supervisors: supervisorId },
//     });

//     // Finally, delete the supervisor
//     await User.findByIdAndDelete(supervisorId);

//     return res
//       .status(200)
//       .json(
//         new ApiResponse(
//           true,
//           `Supervisor deleted and ${updatedGuards.modifiedCount} guards reassigned to ${newSupervisor.name}`,
//           { reassignedTo: newSupervisor._id }
//         )
//       );
//   } catch (err) {
//     console.error("Delete supervisor error:", err);
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };




// exports.getSupervisorDashboard = async (req, res) => {
//   try {
//     const supervisorId = req.user.id;

//     // Get supervisor's team (guards)
//     const team = await User.find({
//       supervisor: supervisorId,
//       role: "guard",
//       isActive: true
//     });

//     // Today range
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);
//     const tomorrow = new Date(today);
//     tomorrow.setDate(tomorrow.getDate() + 1);

//     // Patrols for today
//     const todayPatrols = await Patrol.find({
//       guard: { $in: team.map(g => g._id) },
//       createdAt: { $gte: today, $lt: tomorrow }
//     }).populate("guard", "name email");

//     // Active shifts
//     const activeShifts = await Shift.find({
//       guard: { $in: team.map(g => g._id) },
//       startTime: { $lte: new Date() },
//       endTime: { $gte: new Date() }
//     }).populate("guard", "name email");

//     // Pending incidents assigned to this supervisor
//     const pendingIncidents = await Incident.find({
//       assignedTo: supervisorId,
//       status: { $in: ["reported", "investigating"] }
//     });

//     const dashboardData = {
//       teamStats: {
//         totalGuards: team.length,
//         onDuty: activeShifts.length,
//         onPatrol: todayPatrols.length
//       },
//       todayPatrols,
//       activeShifts,
//       pendingIncidents,
//       teamMembers: team
//     };

//     return res
//       .status(200)
//       .json(new ApiResponse(true, "Supervisor dashboard", dashboardData));
//   } catch (err) {
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };

// Assign guard to supervisor


exports.deleteSupervisor = async (req, res) => {
  try {
    const supervisorId = req.params.id;
    const { reassignToSupervisorId } = req.body;

    // Find the supervisor being deleted
    const supervisor = await User.findById(supervisorId);
    if (!supervisor || supervisor.role !== "supervisor") {
      return res
        .status(404)
        .json(new ApiResponse(false, "Supervisor not found"));
    }

    // Check if supervisor has any guards
    const guardCount = await User.countDocuments({
      supervisor: supervisorId,
      role: "guard",
    });

    if (guardCount > 0) {
      // Guards exist → require valid replacement supervisor
      const newSupervisor = await User.findOne({
        _id: reassignToSupervisorId,
        companyId: supervisor.companyId,
        role: "supervisor",
        isActive: true,
      });

      if (!newSupervisor) {
        return res
          .status(400)
          .json(
            new ApiResponse(false, "Valid replacement supervisor is required")
          );
      }

      // Reassign all guards to new supervisor
      const updatedGuards = await User.updateMany(
        { supervisor: supervisorId, role: "guard" },
        {
          supervisor: newSupervisor._id,
          parent: newSupervisor._id,
        }
      );

      // Add guards to new supervisor's list
      const guardIds = await User.find({
        supervisor: newSupervisor._id,
        role: "guard",
      }).distinct("_id");

      await User.findByIdAndUpdate(newSupervisor._id, {
        $addToSet: { guards: { $each: guardIds } },
      });

      // Remove supervisor from company
      await User.findByIdAndUpdate(supervisor.companyId, {
        $pull: { supervisors: supervisorId },
      });

      // Delete supervisor
      await User.findByIdAndDelete(supervisorId);

      return res
        .status(200)
        .json(
          new ApiResponse(
            true,
            `Supervisor deleted and ${updatedGuards.modifiedCount} guards reassigned to ${newSupervisor.name}`,
            { reassignedTo: newSupervisor._id }
          )
        );
    } else {
      // ✅ No guards → just delete supervisor directly
      await User.findByIdAndUpdate(supervisor.companyId, {
        $pull: { supervisors: supervisorId },
      });

      await User.findByIdAndDelete(supervisorId);

      return res
        .status(200)
        .json(
          new ApiResponse(true, "Supervisor deleted successfully (no guards)")
        );
    }
  } catch (err) {
    console.error("Delete supervisor error:", err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};


exports.assignGuardToSupervisor = async (req, res) => {
  try {
    const { guardId, supervisorId } = req.body;

    // Verify supervisor belongs to same company
    const supervisor = await User.findOne({
      _id: supervisorId,
      companyId: req.user.companyId,
      role: "supervisor"
    });

    if (!supervisor) {
      return res
        .status(404)
        .json(new ApiResponse(false, "Supervisor not found"));
    }

    // Update guard with supervisor info
    const guard = await User.findOneAndUpdate(
      {
        _id: guardId,
        companyId: req.user.companyId,
        role: "guard"
      },
      {
        supervisor: supervisorId,
        parent: supervisorId
      },
      { new: true }
    );

    if (!guard) {
      return res
        .status(404)
        .json(new ApiResponse(false, "Guard not found"));
    }

    // Add guard to supervisor's guards array
    await User.findByIdAndUpdate(supervisorId, {
      $addToSet: { guards: guardId }
    });

    return res.status(200).json(
      new ApiResponse(true, "Guard assigned to supervisor successfully", {
        guard
      })
    );
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// Team performance report
exports.getTeamPerformance = async (req, res) => {
  try {
    const { period = "week" } = req.query;
    const supervisorId = req.user.id;

    const team = await User.find({
      supervisor: supervisorId,
      role: "guard"
    });

    const teamPerformance = await Promise.all(
      team.map(async guard => {
        const patrols = await Patrol.find({
          guard: guard._id,
          createdAt: { $gte: getDateRange(period) }
        });

        const completed = patrols.filter(p => p.isVerified).length;
        const total = patrols.length;
        const efficiency = total > 0 ? (completed / total) * 100 : 0;

        return {
          guard: {
            id: guard._id,
            name: guard.name,
            email: guard.email
          },
          stats: {
            totalPatrols: total,
            completedPatrols: completed,
            efficiency: Math.round(efficiency),
            avgScanTime: calculateAverageScanTime(patrols)
          }
        };
      })
    );

    return res.status(200).json(
      new ApiResponse(true, "Team performance report", teamPerformance)
    );
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// Helpers
function getDateRange(period) {
  const now = new Date();
  switch (period) {
    case "week":
      return new Date(now.setDate(now.getDate() - 7));
    case "month":
      return new Date(now.setMonth(now.getMonth() - 1));
    default:
      return new Date(now.setDate(now.getDate() - 7));
  }
}

function calculateAverageScanTime(patrols) {
  if (patrols.length === 0) return 0;
  const total = patrols.reduce(
    (sum, patrol) => sum + (patrol.scanDuration || 0),
    0
  );
  return Math.round(total / patrols.length);
}


exports.createPatrolPlan = async (req, res) => {
  try {
    const { planName, description, checkpoints, assignedGuards, frequency, shiftId } = req.body;

    if (!planName || !shiftId) {
      return res.status(400).json(new ApiResponse(false, "Plan name and shift are required"));
    }

    const plan = await PatrolPlan.create({
      planName,
      description,
      checkpoints,
      assignedGuards,
      frequency,
      shift: shiftId,
      createdBy: req.user.id
    });

    return res
      .status(201)
      .json(new ApiResponse(true, "Patrol plan created successfully", { plan }));
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};


// Enhanced Supervisor Dashboard
exports.getSupervisorDashboard = async (req, res) => {
  try {
    const supervisorId = req.user.id;

    // Get supervisor's team (guards)
    const team = await User.find({
      supervisor: supervisorId,
      role: "guard",
      isActive: true
    });

    // Date ranges
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    // Patrol Plans vs Actual
    const patrolPlansVsActual = await this.getPatrolPlansVsActual(supervisorId, team);

    // Incident Reports by period
    const incidentReports = await this.getIncidentReports(supervisorId, team);

    // Guard Performance
    const guardPerformance = await this.getGuardPerformance(team);

    // Incomplete Patrolling Plans
    const incompletePatrolPlans = await this.getIncompletePatrolPlans(supervisorId, team);

    // Active shifts
    const activeShifts = await Shift.find({
      guard: { $in: team.map(g => g._id) },
      startTime: { $lte: new Date() },
      endTime: { $gte: new Date() }
    }).populate("guard", "name email");

    const dashboardData = {
      teamStats: {
        totalGuards: team.length,
        onDuty: activeShifts.length,
        onPatrol: patrolPlansVsActual.todayPatrols || 0
      },
      patrolPlansVsActual,
      incidentReports,
      guardPerformance,
      incompletePatrolPlans,
      activeShifts,
      teamMembers: team
    };

    return res.status(200).json(
      new ApiResponse(true, "Supervisor dashboard", dashboardData)
    );
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// Helper: Patrol Plans vs Actual
exports.getPatrolPlansVsActual = async (supervisorId, team) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const guardIds = team.map(g => g._id);

  // Get planned vs actual patrols
  const [weeklyPlans, monthlyPlans, yearlyPlans] = await Promise.all([
    PatrolPlan.countDocuments({ 
      createdBy: supervisorId, 
      frequency: "weekly",
      isActive: true,
      createdAt: { $gte: weekStart }
    }),
    PatrolPlan.countDocuments({ 
      createdBy: supervisorId, 
      frequency: "monthly",
      isActive: true,
      createdAt: { $gte: monthStart }
    }),
    PatrolPlan.countDocuments({ 
      createdBy: supervisorId, 
      frequency: "yearly",
      isActive: true,
      createdAt: { $gte: new Date(today.getFullYear(), 0, 1) }
    })
  ]);

  const [weeklyActual, monthlyActual, yearlyActual] = await Promise.all([
    Patrol.countDocuments({ 
      guard: { $in: guardIds },
      createdAt: { $gte: weekStart }
    }),
    Patrol.countDocuments({ 
      guard: { $in: guardIds },
      createdAt: { $gte: monthStart }
    }),
    Patrol.countDocuments({ 
      guard: { $in: guardIds },
      createdAt: { $gte: new Date(today.getFullYear(), 0, 1) }
    })
  ]);

  return {
    weekly: { planned: weeklyPlans, actual: weeklyActual },
    monthly: { planned: monthlyPlans, actual: monthlyActual },
    yearly: { planned: yearlyPlans, actual: yearlyActual },
    todayPatrols: await Patrol.countDocuments({ 
      guard: { $in: guardIds },
      createdAt: { $gte: today, $lt: tomorrow }
    })
  };
};

// Helper: Incident Reports
exports.getIncidentReports = async (supervisorId, team) => {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const guardIds = team.map(g => g._id);

  const [weeklyIncidents, monthlyIncidents, yearlyIncidents] = await Promise.all([
    Incident.countDocuments({ 
      reportedBy: { $in: guardIds },
      createdAt: { $gte: weekStart }
    }),
    Incident.countDocuments({ 
      reportedBy: { $in: guardIds },
      createdAt: { $gte: monthStart }
    }),
    Incident.countDocuments({ 
      reportedBy: { $in: guardIds },
      createdAt: { $gte: new Date(today.getFullYear(), 0, 1) }
    })
  ]);

  return {
    weekly: weeklyIncidents,
    monthly: monthlyIncidents,
    yearly: yearlyIncidents
  };
};

// Helper: Guard Performance
exports.getGuardPerformance = async (team) => {
  const performance = await Promise.all(
    team.map(async (guard) => {
      const totalPatrols = await Patrol.countDocuments({ guard: guard._id });
      const completedPatrols = await Patrol.countDocuments({ 
        guard: guard._id,
        isVerified: true 
      });
      
      const percentage = totalPatrols > 0 ? Math.round((completedPatrols / totalPatrols) * 100) : 0;
      
      return {
        guardId: guard._id,
        guardName: guard.name,
        percentage,
        totalPatrols,
        completedPatrols
      };
    })
  );

  return performance.sort((a, b) => b.percentage - a.percentage);
};

// Helper: Incomplete Patrolling Plans
exports.getIncompletePatrolPlans = async (supervisorId, team) => {
  const guardIds = team.map(g => g._id);

  const incompleteData = await Promise.all(
    team.map(async (guard) => {
      // Get assigned patrol plans
      const assignedPlans = await PatrolPlan.countDocuments({
        assignedGuards: guard._id,
        isActive: true
      });

      // Get completed checkpoints for this guard
      const completedCheckpoints = await Patrol.countDocuments({
        guard: guard._id,
        isVerified: true
      });

      // Calculate total expected checkpoints
      const plans = await PatrolPlan.find({
        assignedGuards: guard._id,
        isActive: true
      });
      
      const totalExpectedCheckpoints = plans.reduce((total, plan) => {
        return total + plan.checkpoints.length;
      }, 0);

      const completionPercentage = totalExpectedCheckpoints > 0 
        ? Math.round((completedCheckpoints / totalExpectedCheckpoints) * 100) 
        : 0;

      return {
        guardId: guard._id,
        guardName: guard.name,
        completionPercentage,
        assignedPlans,
        completedCheckpoints,
        totalExpectedCheckpoints
      };
    })
  );

  return incompleteData
    .filter(data => data.completionPercentage < 100)
    .sort((a, b) => a.completionPercentage - b.completionPercentage);
};