


// controllers/patrolPlanController.js - Updated with proper validation
const PatrolPlan = require("../models/PatrolPlan");
const QR = require("../models/QR");
const User = require("../models/User");
const Shift = require("../models/Shift");
const ApiResponse = require("../utils/apiResponse");
const mongoose = require("mongoose");

// Create Patrol Plan (Supervisor only)
// exports.createPatrolPlan = async (req, res) => {
//   try {
//     const {
//       planName,
//       description,
//       checkpoints,
//       assignedGuards, // Array of { guardId, assignedShifts }
//       frequency,
//       customFrequency,
//       startDate,
//       endDate,
//       rounds = 1,
//     } = req.body;

//     // Validation
//     if (!planName || !checkpoints || checkpoints.length === 0) {
//       return res
//         .status(400)
//         .json(new ApiResponse(false, "Plan name and checkpoints are required"));
//     }

//     if (!assignedGuards || assignedGuards.length === 0) {
//       return res
//         .status(400)
//         .json(new ApiResponse(false, "At least one guard must be assigned"));
//     }

//     if (!startDate) {
//       return res
//         .status(400)
//         .json(new ApiResponse(false, "Start date is required"));
//     }

//     // Extract all guard IDs and shift IDs
//     const guardIds = assignedGuards.map(ag => ag.guardId);
//     const shiftIds = assignedGuards.flatMap(ag => ag.assignedShifts || []);

//     // Verify all guards belong to this supervisor
//     const guards = await User.find({
//       _id: { $in: guardIds },
//       supervisor: req.user.id,
//       role: "guard",
//       isActive: true
//     });

//     if (guards.length !== guardIds.length) {
//       return res
//         .status(400)
//         .json(new ApiResponse(false, "Some guards don't belong to your team or are inactive"));
//     }

//     // Verify all shifts belong to this supervisor and are active
//     if (shiftIds.length > 0) {
//       const shifts = await Shift.find({
//         _id: { $in: shiftIds },
//         createdBy: req.user.id,
//         isActive: true
//       });

//       if (shifts.length !== shiftIds.length) {
//         return res
//           .status(400)
//           .json(new ApiResponse(false, "Some shifts are invalid or inactive"));
//       }

//       // Verify that assigned guards are actually assigned to the specified shifts
//       for (const assignment of assignedGuards) {
//         if (assignment.assignedShifts && assignment.assignedShifts.length > 0) {
//           const guardShifts = await Shift.find({
//             _id: { $in: assignment.assignedShifts },
//             assignedGuards: assignment.guardId,
//             createdBy: req.user.id,
//             isActive: true
//           });

//           if (guardShifts.length !== assignment.assignedShifts.length) {
//             const guard = guards.find(g => g._id.toString() === assignment.guardId);
//             return res
//               .status(400)
//               .json(new ApiResponse(false, `Guard ${guard?.name} is not assigned to all specified shifts`));
//           }
//         }
//       }
//     }

//     // Verify QR codes belong to supervisor's company
//     const qrIds = checkpoints.map(cp => cp.qrId);
//     const qrCodes = await QR.find({
//       _id: { $in: qrIds },
//       createdBy: req.user.id,
//     });

//     if (qrCodes.length !== qrIds.length) {
//       return res
//         .status(400)
//         .json(new ApiResponse(false, "Some QR codes are invalid"));
//     }

//     // Create patrol plan
//     const plan = await PatrolPlan.create({
//       planName,
//       description,
//       checkpoints: checkpoints.map((cp, index) => ({
//         qrId: cp.qrId,
//         siteId: cp.siteId,
//         expectedTime: cp.expectedTime || 5,
//         sequence: cp.sequence || index + 1,
//       })),
//       assignedGuards,
//       frequency,
//       customFrequency,
//       startDate: new Date(startDate),
//       endDate: endDate ? new Date(endDate) : null,
//       rounds,
//       createdBy: req.user.id,
//     });

//     // Populate and return
//     const populatedPlan = await PatrolPlan.findById(plan._id)
//       .populate("assignedGuards.guardId", "name email phone")
//       .populate("assignedGuards.assignedShifts", "shiftName startTime endTime shiftType")
//       .populate("checkpoints.qrId", "siteId description lat lng");

//     return res
//       .status(201)
//       .json(new ApiResponse(true, "Patrol plan created successfully", { plan: populatedPlan }));
      
//   } catch (err) {
//     console.error("Create patrol plan error:", err);
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };


exports.createPatrolPlan = async (req, res) => {
  try {
    const {
      planName,
      description,
      checkpoints,
      assignedGuards, // Array of { guardId, assignedShifts }
      frequency,
      customFrequency,
      startDate,
      endDate,
      rounds = 1,
    } = req.body;


       console.log("plan****req.user****pan", req.user);
    console.log("[CREATE] Received rounds:", rounds);

    console.log('req body of patrol plan', req.body);
    

    // Validation
    if (!planName || !checkpoints || checkpoints.length === 0) {
      return res
        .status(400)
        .json(new ApiResponse(false, "Plan name and checkpoints are required"));
    }

    if (!assignedGuards || assignedGuards.length === 0) {
      return res
        .status(400)
        .json(new ApiResponse(false, "At least one guard must be assigned"));
    }

    if (!startDate) {
      return res
        .status(400)
        .json(new ApiResponse(false, "Start date is required"));
    }

    // Extract all guard IDs and shift IDs
    const guardIds = assignedGuards.map(ag => ag.guardId);
    const shiftIds = assignedGuards.flatMap(ag => ag.assignedShifts || []);

    // Verify all guards belong to this supervisor
    const guards = await User.find({
      _id: { $in: guardIds },
      supervisor: req.user.id,
      role: "guard",
      isActive: true
    });

    console.log(' the guards of supervisor', guards);
    

    if (guards.length !== guardIds.length) {
      return res
        .status(400)
        .json(new ApiResponse(false, "Some guards don't belong to your team or are inactive"));
    }

    // Verify all shifts belong to this supervisor and are active
    if (shiftIds.length > 0) {
      const shifts = await Shift.find({
        _id: { $in: shiftIds },
        createdBy: req.user.id,
        isActive: true
      });

      if (shifts.length !== shiftIds.length) {
        return res
          .status(400)
          .json(new ApiResponse(false, "Some shifts are invalid or inactive"));
      }

      // Verify that assigned guards are actually assigned to the specified shifts
      for (const assignment of assignedGuards) {
        if (assignment.assignedShifts && assignment.assignedShifts.length > 0) {
          const guardShifts = await Shift.find({
            _id: { $in: assignment.assignedShifts },
            assignedGuards: assignment.guardId,
            createdBy: req.user.id,
            isActive: true
          });

          if (guardShifts.length !== assignment.assignedShifts.length) {
            const guard = guards.find(g => g._id.toString() === assignment.guardId);
            return res
              .status(400)
              .json(new ApiResponse(false, `Guard ${guard?.name} is not assigned to all specified shifts`));
          }
        }
      }
    }

    // Verify QR codes belong to supervisor's company
    const qrIds = checkpoints.map(cp => cp.qrId);
    const qrCodes = await QR.find({
      _id: { $in: qrIds },
      companyId: req.user.companyId,
    });

    if (qrCodes.length !== qrIds.length) {
      return res
        .status(400)
        .json(new ApiResponse(false, "Some QR codes are invalid"));
    }

    // Create patrol plan
    const planCreateData = {
      planName,
      description,
      checkpoints: checkpoints.map((cp, index) => ({
        qrId: cp.qrId,
        siteId: cp.siteId,
        expectedTime: cp.expectedTime || 5,
        sequence: cp.sequence || index + 1,
      })),
      assignedGuards,
      frequency,
      customFrequency,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      rounds,
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      createdBy: new mongoose.Types.ObjectId(req.user.id),
    };

    console.log("[CREATE] Plan data to create:", planCreateData);

    const plan = await PatrolPlan.create(planCreateData);

    // Populate and return
    const populatedPlan = await PatrolPlan.findById(plan._id)
      .populate("assignedGuards.guardId", "name email phone")
      .populate("assignedGuards.assignedShifts", "shiftName startTime endTime shiftType")
      .populate("checkpoints.qrId", "siteId description lat lng");

    console.log("[CREATE] Created plan rounds value:", populatedPlan.rounds);

    return res
      .status(201)
      .json(new ApiResponse(true, "Patrol plan created successfully", { plan: populatedPlan }));
      
  } catch (err) {
    console.error("Create patrol plan error:", err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};


exports.updatePatrolPlan = async (req, res) => {
  try {
    const {
      planName,
      description,
      checkpoints,
      assignedGuards,
      frequency,
      customFrequency,
      isActive,
      startDate,
      endDate,
      // DO NOT destructure rounds here; use req.body.rounds directly!
    } = req.body;

    console.log("[UPDATE] Received rounds:", req.body.rounds);

   console.log("User companyId:", req.user.companyId);
    // Find existing plan
    const existingPlan = await PatrolPlan.findOne({
      _id: req.params.id,
      createdBy: req.user.id
    });

    if (!existingPlan) {
      return res.status(404).json(new ApiResponse(false, "Patrol plan not found"));
    }

    // Build update data
    const updateData = {};
    
    if (planName) updateData.planName = planName;
    if (description !== undefined) updateData.description = description;
    if (frequency) updateData.frequency = frequency;
    if (customFrequency) updateData.customFrequency = customFrequency;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (startDate) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (req.body.rounds !== undefined) updateData.rounds = req.body.rounds; // <--- THIS IS CRITICAL

    // Validate checkpoints if provided
    if (checkpoints) {
      const qrIds = checkpoints.map((cp) => cp.qrId);

      const uniqueQrIds = [...new Set(qrIds)]; // Remove duplicates

      console.log("Requested QR IDs:", qrIds);
      console.log("User companyId:", req.user.companyId);

      const qrCodes = await QR.find({
        _id: { $in: qrIds },
        companyId: req.user.companyId,
      });
      const foundIds = qrCodes.map((qr) => qr._id.toString());
    const missing = uniqueQrIds.filter((id) => !foundIds.includes(id.toString()));
      console.log("Found QR IDs:", foundIds);
      console.log("Missing QR IDs:", missing);
   if (missing.length > 0) {
     return res
       .status(400)
       .json(
         new ApiResponse(
           false,
           `Some QR codes are invalid: ${missing.join(", ")}`
         )
       );
   }

      updateData.checkpoints = checkpoints.map((cp, index) => ({
        qrId: cp.qrId,
        siteId: cp.siteId,
        expectedTime: cp.expectedTime || 5,
        sequence: cp.sequence || index + 1,
      }));
    }

    // Validate assigned guards if provided
    if (assignedGuards) {
      const guardIds = assignedGuards.map(ag => ag.guardId);
      const shiftIds = assignedGuards.flatMap(ag => ag.assignedShifts || []);

      // Verify guards
      const guards = await User.find({
        _id: { $in: guardIds },
        supervisor: req.user.id,
        role: "guard",
        isActive: true
      });

      if (guards.length !== guardIds.length) {
        return res.status(400).json(new ApiResponse(false, "Some guards are invalid"));
      }

      // Verify shifts if any
      if (shiftIds.length > 0) {

          console.log("🔍 SHIFT DEBUG:");
          console.log("shiftIds:", shiftIds);
          console.log("shiftIds type:", typeof shiftIds[0]);

  const uniqueShiftIds = [...new Set(shiftIds)];
        const shifts = await Shift.find({
          _id: { $in: uniqueShiftIds },
          createdBy: req.user.id,
          isActive: true,
        });

         console.log("Found shifts:", shifts);
         console.log("Found shifts count:", shifts.length);

        if (shifts.length !== uniqueShiftIds.length) {
          // Debugging: show missing shift ids
          const foundIds = shifts.map((s) => s._id.toString());
          const missing = uniqueShiftIds.filter(
            (id) => !foundIds.includes(id.toString())
          );

          console.log("Missing IDs:", missing);
          console.log("Missing join:", missing.join(", "));
          return res
            .status(400)
            .json(
              new ApiResponse(
                false,
                `Some shifts are invalid: ${missing.join(", ")}`
              )
            );
        }
      }

      updateData.assignedGuards = assignedGuards;
    }

    // Debug log for update data
    console.log('[UPDATE] UpdateData:', updateData);

    // Update the plan
    const plan = await PatrolPlan.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )
      .populate("assignedGuards.guardId", "name email phone")
      .populate("assignedGuards.assignedShifts", "shiftName startTime endTime shiftType")
      .populate("checkpoints.qrId", "siteId description");

    console.log('[UPDATE] Updated plan rounds value:', plan.rounds);

    return res
      .status(200)
      .json(new ApiResponse(true, "Patrol plan updated successfully", { plan }));
      
  } catch (err) {
    console.error("Update patrol plan error:", err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// exports.updatePatrolPlan = async (req, res) => {
//   try {
//     const {
//       planName,
//       description,
//       checkpoints,
//       assignedGuards,
//       frequency,
//       customFrequency,
//       isActive,
//       startDate,
//       endDate,
//       rounds,
//     } = req.body;

//     // Find existing plan
//     const existingPlan = await PatrolPlan.findOne({
//       _id: req.params.id,
//       createdBy: req.user.id
//     });

//     if (!existingPlan) {
//       return res.status(404).json(new ApiResponse(false, "Patrol plan not found"));
//     }

//     // Build update data
//     const updateData = {};
    
//     if (planName) updateData.planName = planName;
//     if (description !== undefined) updateData.description = description;
//     if (frequency) updateData.frequency = frequency;
//     if (customFrequency) updateData.customFrequency = customFrequency;
//     if (isActive !== undefined) updateData.isActive = isActive;
//     if (startDate) updateData.startDate = new Date(startDate);
//     if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
//     if (rounds !== undefined) updateData.rounds = rounds; // <-- Fix: handle rounds update

//     // Validate checkpoints if provided
//     if (checkpoints) {
//       const qrIds = checkpoints.map(cp => cp.qrId);
//       const qrCodes = await QR.find({
//         _id: { $in: qrIds },
//         createdBy: req.user.id,
//       });

//       if (qrCodes.length !== qrIds.length) {
//         return res.status(400).json(new ApiResponse(false, "Some QR codes are invalid"));
//       }

//       updateData.checkpoints = checkpoints.map((cp, index) => ({
//         qrId: cp.qrId,
//         siteId: cp.siteId,
//         expectedTime: cp.expectedTime || 5,
//         sequence: cp.sequence || index + 1
//       }));
//     }

//     // Validate assigned guards if provided
//     if (assignedGuards) {
//       const guardIds = assignedGuards.map(ag => ag.guardId);
//       const shiftIds = assignedGuards.flatMap(ag => ag.assignedShifts || []);

//       // Verify guards
//       const guards = await User.find({
//         _id: { $in: guardIds },
//         supervisor: req.user.id,
//         role: "guard",
//         isActive: true
//       });

//       if (guards.length !== guardIds.length) {
//         return res.status(400).json(new ApiResponse(false, "Some guards are invalid"));
//       }

//       // Verify shifts if any
//       if (shiftIds.length > 0) {
//         const shifts = await Shift.find({
//           _id: { $in: shiftIds },
//           createdBy: req.user.id,
//           isActive: true
//         });

//         if (shifts.length !== shiftIds.length) {
//           // Debugging: show missing shift ids
//           const foundIds = shifts.map(s => s._id.toString());
//           const missing = shiftIds.filter(id => !foundIds.includes(id.toString()));
//           return res.status(400).json(new ApiResponse(false, `Some shifts are invalid: ${missing.join(', ')}`));
//         }
//       }

//       updateData.assignedGuards = assignedGuards;
//     }

//     // Update the plan
//     const plan = await PatrolPlan.findByIdAndUpdate(
//       req.params.id,
//       updateData,
//       { new: true }
//     )
//       .populate("assignedGuards.guardId", "name email phone")
//       .populate("assignedGuards.assignedShifts", "shiftName startTime endTime shiftType")
//       .populate("checkpoints.qrId", "siteId description");

//     return res
//       .status(200)
//       .json(new ApiResponse(true, "Patrol plan updated successfully", { plan }));
      
//   } catch (err) {
//     console.error("Update patrol plan error:", err);
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };
// Get Patrol Plans for Supervisor
// exports.getPatrolPlans = async (req, res) => {
//   try {
//     const { page = 1, limit = 20, isActive, guardId, shiftId } = req.query;

//     // Build filter
//     const filter = { createdBy: req.user.id };
    
//     if (isActive !== undefined) {
//       filter.isActive = isActive === 'true';
//     }
    
//     if (guardId) {
//       filter["assignedGuards.guardId"] = guardId;
//     }
    
//     if (shiftId) {
//       filter["assignedGuards.assignedShifts"] = shiftId;
//     }

//     const plans = await PatrolPlan.find(filter)
//       .populate("assignedGuards.guardId", "name email phone")
//       .populate("assignedGuards.assignedShifts", "shiftName startTime endTime shiftType")
//       .populate("checkpoints.qrId", "siteId description")
//       .sort({ createdAt: -1 })
//       .skip((page - 1) * limit)
//       .limit(Number(limit));

//     const total = await PatrolPlan.countDocuments(filter);

//     return res.status(200).json(
//       new ApiResponse(true, "Patrol plans fetched", {
//         // plans,
//         plans: plans.map((p) => ({
//           ...p.toObject(),
//           rounds: p.rounds || 1, // ✅ Ensure rounds are included
//         })),
//         total,
//         page: Number(page),
//         limit: Number(limit),
//       })
//     );
        
//   } catch (err) {
//     console.error("Get patrol plans error:", err);
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };
exports.getPatrolPlans = async (req, res) => {
  try {
    const { page = 1, limit = 20, isActive, guardId, shiftId } = req.query;

    // const filter = { createdBy: req.user.id };

    // Role-based access

    console.log('*****req.user*******', req.user);
    

    if (req.user.role === "guard") {
      // Guards should only see plans they are assigned to
      filter = { "assignedGuards.guardId": req.user.id };
    } else if (req.user.role === "supervisor") {
      // Supervisors see their own plans + plans from their employee
      filter = {
        $or: [
          { createdBy: req.user.id },
          { createdBy: req.user.parent }, // employee who created supervisor
        ],
      };
    } else if (req.user.role === "employee" || req.user.role === "admin") {
      // Employee/Admin see all plans created in their company
      filter = { companyId: req.user.companyId };
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    if (guardId) {
      filter["assignedGuards.guardId"] = guardId;
    }

    if (shiftId) {
      filter["assignedGuards.assignedShifts"] = shiftId;
    }

    // Use lean() to avoid Mongoose document overhead and duplicates
    const plans = await PatrolPlan.find(filter)
      .populate({
        path: "assignedGuards.guardId",
        select: "name email phone",
      })
      .populate({
        // path: "assignedGuards.assignedShifts",
        path: "assignedGuards.assignedShifts", // ✅ populate shifts
        select: "shiftName  startTime endTime shiftType",
      })
      .populate({
        path: "checkpoints.qrId",
        select: "siteId description",
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean(); // ✅ lean() returns plain JS objects

    const total = await PatrolPlan.countDocuments(filter);

    // Remove duplicates caused by multiple shifts in assignedGuards
    const cleanedPlans = plans.map((plan) => {
      // Remove duplicate shifts inside each guard
      const guards = plan.assignedGuards.map((ag) => ({
        ...ag,
        assignedShifts: [...new Set(ag.assignedShifts.map((s) => s._id))],
      }));
      return {
        ...plan,
        assignedGuards: guards,
        rounds: plan.rounds || 1,
      };
    });

    return res.status(200).json(
      new ApiResponse(true, "Patrol plans fetched", {
        plans: cleanedPlans,
        total,
        page: Number(page),
        limit: Number(limit),
      })
    );
  } catch (err) {
    console.error("Get patrol plans error:", err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// Update Patrol Plan
// exports.updatePatrolPlan = async (req, res) => {
//   try {
//     const {
//       planName,
//       description,
//       checkpoints,
//       assignedGuards,
//       frequency,
//       customFrequency,
//       isActive,
//       startDate,
//       endDate,
//     } = req.body;

//     // Find existing plan
//     const existingPlan = await PatrolPlan.findOne({
//       _id: req.params.id,
//       createdBy: req.user.id
//     });

//     if (!existingPlan) {
//       return res.status(404).json(new ApiResponse(false, "Patrol plan not found"));
//     }

//     // Build update data
//     const updateData = {};
    
//     if (planName) updateData.planName = planName;
//     if (description !== undefined) updateData.description = description;
//     if (frequency) updateData.frequency = frequency;
//     if (customFrequency) updateData.customFrequency = customFrequency;
//     if (isActive !== undefined) updateData.isActive = isActive;
//     if (startDate) updateData.startDate = new Date(startDate);
//     if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;

//     // Validate checkpoints if provided
//     if (checkpoints) {
//       const qrIds = checkpoints.map(cp => cp.qrId);
//       const qrCodes = await QR.find({
//         _id: { $in: qrIds },
//         createdBy: req.user.id,
//       });

//       if (qrCodes.length !== qrIds.length) {
//         return res.status(400).json(new ApiResponse(false, "Some QR codes are invalid"));
//       }

//       updateData.checkpoints = checkpoints.map((cp, index) => ({
//         qrId: cp.qrId,
//         siteId: cp.siteId,
//         expectedTime: cp.expectedTime || 5,
//         sequence: cp.sequence || index + 1
//       }));
//     }

//     // Validate assigned guards if provided
//     if (assignedGuards) {
//       const guardIds = assignedGuards.map(ag => ag.guardId);
//       const shiftIds = assignedGuards.flatMap(ag => ag.assignedShifts || []);

//       // Verify guards
//       const guards = await User.find({
//         _id: { $in: guardIds },
//         supervisor: req.user.id,
//         role: "guard",
//         isActive: true
//       });

//       if (guards.length !== guardIds.length) {
//         return res.status(400).json(new ApiResponse(false, "Some guards are invalid"));
//       }

//       // Verify shifts if any
//       if (shiftIds.length > 0) {
//         const shifts = await Shift.find({
//           _id: { $in: shiftIds },
//           createdBy: req.user.id,
//           isActive: true
//         });

//         if (shifts.length !== shiftIds.length) {
//           return res.status(400).json(new ApiResponse(false, "Some shifts are invalid"));
//         }
//       }

//       updateData.assignedGuards = assignedGuards;
//     }

//     // Update the plan
//     const plan = await PatrolPlan.findByIdAndUpdate(
//       req.params.id,
//       updateData,
//       { new: true }
//     )
//       .populate("assignedGuards.guardId", "name email phone")
//       .populate("assignedGuards.assignedShifts", "shiftName startTime endTime shiftType")
//       .populate("checkpoints.qrId", "siteId description");

//     return res
//       .status(200)
//       .json(new ApiResponse(true, "Patrol plan updated successfully", { plan }));
      
//   } catch (err) {
//     console.error("Update patrol plan error:", err);
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };

// Remove Guard from Patrol Plan
exports.removeGuardFromPlan = async (req, res) => {
  try {
    const { planId, guardId } = req.params;

    const plan = await PatrolPlan.findOneAndUpdate(
      { 
        _id: planId, 
        createdBy: req.user.id,
        "assignedGuards.guardId": guardId
      },
      { 
        $pull: { 
          assignedGuards: { guardId: guardId } 
        } 
      },
      { new: true }
    )
      .populate("assignedGuards.guardId", "name email phone")
      .populate("assignedGuards.assignedShifts", "shiftName startTime endTime shiftType");

    if (!plan) {
      return res.status(404).json(new ApiResponse(false, "Plan not found or guard not assigned"));
    }

    // Check if plan still has guards assigned
    if (plan.assignedGuards.length === 0) {
      // Optionally deactivate the plan
      plan.isActive = false;
      await plan.save();
    }

    return res
      .status(200)
      .json(new ApiResponse(true, "Guard removed from patrol plan", { plan }));
      
  } catch (err) {
    console.error("Remove guard error:", err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// Add Guard to Patrol Plan
exports.addGuardToPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const { guardId, assignedShifts = [] } = req.body;

    if (!guardId) {
      return res.status(400).json(new ApiResponse(false, "Guard ID is required"));
    }

    // Verify guard belongs to supervisor
    const guard = await User.findOne({
      _id: guardId,
      supervisor: req.user.id,
      role: "guard",
      isActive: true
    });

    if (!guard) {
      return res.status(400).json(new ApiResponse(false, "Invalid guard"));
    }

    // Verify shifts if provided
    if (assignedShifts.length > 0) {
      const shifts = await Shift.find({
        _id: { $in: assignedShifts },
        // assignedGuards: guardId,
        createdBy: req.user.id,
        isActive: true
      });

      if (shifts.length !== assignedShifts.length) {
        return res.status(400).json(new ApiResponse(false, "Guard not assigned to all specified shifts"));
      }
    }

    // Add guard to plan (prevent duplicates)
    const plan = await PatrolPlan.findOneAndUpdate(
      { 
        _id: planId, 
        createdBy: req.user.id,
        "assignedGuards.guardId": { $ne: guardId }
      },
      { 
        $addToSet: { 
          assignedGuards: { 
            guardId: guardId,
            assignedShifts: assignedShifts
          } 
        } 
      },
      { new: true }
    )
      .populate("assignedGuards.guardId", "name email phone")
      .populate("assignedGuards.assignedShifts", "shiftName startTime endTime shiftType");

    if (!plan) {
      return res.status(404).json(new ApiResponse(false, "Plan not found or guard already assigned"));
    }

    return res
      .status(200)
      .json(new ApiResponse(true, "Guard added to patrol plan", { plan }));
      
  } catch (err) {
    console.error("Add guard error:", err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// Delete Patrol Plan
exports.deletePatrolPlan = async (req, res) => {
  try {
    const plan = await PatrolPlan.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user.id,
    });

    if (!plan) {
      return res.status(404).json(new ApiResponse(false, "Patrol plan not found"));
    }

    return res.status(200).json(new ApiResponse(true, "Patrol plan deleted"));
    
  } catch (err) {
    console.error("Delete patrol plan error:", err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// Get Patrol Plans for Guard (assigned to them)
exports.getGuardPatrolPlans = async (req, res) => {
  try {
    const guardId = req.user.id;
    const { shiftId, date } = req.query;

    // Build filter
    const filter = {
      "assignedGuards.guardId": guardId,
      isActive: true,
    };

    // Filter by specific shift if provided
    if (shiftId) {
      filter["assignedGuards.assignedShifts"] = shiftId;
    }

    // Filter by date range if provided
    if (date) {
      const queryDate = new Date(date);
      filter.startDate = { $lte: queryDate };
      filter.$or = [
        { endDate: null },
        { endDate: { $gte: queryDate } }
      ];
    }

    const plans = await PatrolPlan.find(filter)
      .populate("checkpoints.qrId", "siteId description lat lng qrImageBase64")
      .populate("assignedGuards.assignedShifts", "shiftName startTime endTime shiftType")
      .sort({ createdAt: -1 });

    // Filter to only show relevant guard assignments
    const filteredPlans = plans.map(plan => {
      const guardAssignment = plan.assignedGuards.find(
        ag => ag.guardId.toString() === guardId
      );
      
      return {
        ...plan.toObject(),
        myAssignment: guardAssignment
      };
    });

    return res
      .status(200)
      .json(new ApiResponse(true, "Your patrol plans", { plans: filteredPlans }));
      
  } catch (err) {
    console.error("Get guard patrol plans error:", err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};
