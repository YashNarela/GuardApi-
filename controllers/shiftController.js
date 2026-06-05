// controllers/shiftController.js
const Shift = require("../models/Shift");
const ApiResponse = require("../utils/apiResponse");
const PatrolPlan = require("../models/PatrolPlan");

const moment = require("moment-timezone");

const mongoose = require("mongoose");





const getActiveShifts = async (req, res) => {
  try {
    const activeShifts = await Shift.findActiveShifts()
      .populate("assignedGuards", "name email phone")
      .populate("createdBy", "name");

    res.json({
      success: true,
      data: activeShifts,
      message: "Active shifts retrieved successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching active shifts",
      error: error.message,
    });
  }
};

// Create shift with validation
//  exports.createShift = async (req, res) => {
//   try {
//     const {
//       shiftName,
//       startTime,
//       endTime,
//       shiftType,
//       assignedGuards,
//       timezone = "UTC",
//     } = req.body;


//     // console.log('req.user***** shift', req.user);
//     // console.log(' the time coming', sta);
    
    
//     let companyId=  new mongoose.Types.ObjectId(req.user.companyId)


//     // Validate required fields
//     if (!shiftName || !startTime || !endTime) {
//       return res
//         .status(400)
//         .json(
//           new ApiResponse(
//             false,
//             "Shift name, start time, and end time are required"
//           )
//         );
//     }

//     // Validate time format and logic
//     const startMoment = moment(startTime);
//     const endMoment = moment(endTime);

//     if (!startMoment.isValid() || !endMoment.isValid()) {
//   return res.status(400).json(new ApiResponse(false, "Invalid date format"));
//     }

//     if (endMoment.isBefore(startMoment)) {
//         return res
//           .status(400)
//           .json(new ApiResponse(false, "End time cannot be before start time"));
//     }

//          const overlappingShift = await Shift.findOne({
//            assignedGuards: { $in: assignedGuards },
//            startTime: { $lt: endTime },
//            endTime: { $gt: startTime },
//            isActive: true,
//          });


//     if (overlappingShift) {
//       return res
//         .status(400)
//         .json(new ApiResponse(false, "Shift overlaps with existing shift"));
//     }

//     const shift = new Shift({
//       shiftName,
//       startTime: startMoment.toDate(),
//       endTime: endMoment.toDate(),
//       shiftType,
//       assignedGuards,
//       timezone,
//       companyId:companyId,
//       createdBy: req.user.id,
//     });

//     await shift.save();
//     await shift.populate("assignedGuards", "name email");

//     return res
//       .status(201)
//       .json(new ApiResponse(true, "Shift created  successfully", { shift }));
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: "Error creating shift",
//       error: error.message,
//     });
//   }
// };

exports.createShift = async (req, res) => {
  try {
    const {
      shiftName,
      startTime,
      endTime,
      shiftType,
      assignedGuards,
      timezone = "UTC",
      recurrence, // ADD THIS - get recurrence from request body
    } = req.body;

    console.log("=== SHIFT CREATION DEBUG ===");
    console.log("Recurrence data received:", recurrence);
    console.log("Recurrence enabled:", recurrence?.enabled);

    let companyId = new mongoose.Types.ObjectId(req.user.companyId);

    // Validate required fields
    if (!shiftName || !startTime || !endTime) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            false,
            "Shift name, start time, and end time are required"
          )
        );
    }

    // Validate time format and logic
    const startMoment = moment(startTime);
    const endMoment = moment(endTime);

    if (!startMoment.isValid() || !endMoment.isValid()) {
      return res
        .status(400)
        .json(new ApiResponse(false, "Invalid date format"));
    }

    if (endMoment.isBefore(startMoment)) {
      return res
        .status(400)
        .json(new ApiResponse(false, "End time cannot be before start time"));
    }

    const overlappingShift = await Shift.findOne({
      assignedGuards: { $in: assignedGuards },
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
      isActive: true,
    });

    if (overlappingShift) {
      return res
        .status(400)
        .json(new ApiResponse(false, "Shift overlaps with existing shift"));
    }

    // Build shift data with recurrence
    const shiftData = {
      shiftName,
      startTime: startMoment.toDate(),
      endTime: endMoment.toDate(),
      shiftType,
      assignedGuards,
      timezone,
      companyId: companyId,
      createdBy: req.user.id,
    };

    // Handle recurrence data - ADD THIS SECTION
    if (recurrence && recurrence.enabled === true) {
      console.log("Creating RECURRING shift with data:", recurrence);

      shiftData.recurrence = {
        enabled: true,
        frequency: recurrence.frequency || "daily",
        daysOfWeek: recurrence.daysOfWeek || [],
        datesOfMonth: recurrence.datesOfMonth || [],
        customInterval: recurrence.customInterval || 1,
        endDate: recurrence.endDate ? new Date(recurrence.endDate) : null,
        endAfterOccurrences: recurrence.endAfterOccurrences || null,
      };

      // For recurring shifts, we might want to adjust the dates to be template dates
      // while keeping the time components
      if (recurrence.enabled) {
        const templateDate = moment().startOf("day");

        // Keep the time from the original but use today's date as template
        shiftData.startTime = templateDate
          .clone()
          .hour(startMoment.hour())
          .minute(startMoment.minute())
          .toDate();

        shiftData.endTime = templateDate
          .clone()
          .hour(endMoment.hour())
          .minute(endMoment.minute())
          .toDate();

        // Handle overnight shifts
        if (endMoment.isBefore(startMoment)) {
          shiftData.endTime = moment(shiftData.endTime).add(1, "day").toDate();
        }
      }
    } else {
      // For one-time shifts, explicitly set recurrence to disabled
      shiftData.recurrence = {
        enabled: false,
        frequency: "daily",
        daysOfWeek: [],
        datesOfMonth: [],
        customInterval: 1,
      };
    }

    console.log("Final shift data to save:", shiftData);

    const shift = new Shift(shiftData);
    await shift.save();
    await shift.populate("assignedGuards", "name email");

    return res
      .status(201)
      .json(new ApiResponse(true, "Shift created successfully", { shift }));
  } catch (error) {
    console.error("Shift creation error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating shift",
      error: error.message,
    });
  }
};

exports.getShifts = async (req, res) => {
  try {
    let filter = {};

    console.log('req.user.id',req.user);
    

    if (req.user.role === "supervisor") {
         filter = {
           createdBy: new mongoose.Types.ObjectId(req.user.id),
         };
    }

    const shifts = await Shift.find(filter).populate(
      "assignedGuards",
      "name email"
    );

    return res
      .status(200)
      .json(new ApiResponse(true, "Shifts fetched", shifts));
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};


exports.deleteShift = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role === "supervisor") {
      filter.createdBy = req.user.id;
    }

    const deleted = await Shift.findOneAndDelete(filter);

    if (!deleted) {
      return res.status(404).json(new ApiResponse(false, "Shift not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(true, "Shift deleted successfully"));
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};



// exports.updateShift = async (req, res) => {
//   try {
//     const {
//       shiftName,
//       startTime,
//       endTime,
//       shiftType,
//       assignedGuards,
//       timezone,
//     } = req.body;

//     const filter = { _id: req.params.id };
//     if (req.user.role === "supervisor") filter.createdBy = req.user.id;

//     const updateData = {};
//     let startMoment, endMoment;

//     // Get current shift data for reference
//     const currentShift = await Shift.findById(req.params.id);
//     if (!currentShift) {
//       return res.status(404).json(new ApiResponse(false, "Shift not found"));
//     }

//     const now = moment();
//     const isShiftCompleted = moment(currentShift.endTime).isBefore(now);
//     const isShiftInProgress =
//       moment(currentShift.startTime).isBefore(now) &&
//       moment(currentShift.endTime).isAfter(now);

//     // Validate time formats
//     if (startTime) {
//       startMoment = moment(startTime);
//       if (!startMoment.isValid()) {
//         return res
//           .status(400)
//           .json(new ApiResponse(false, "Invalid start time format"));
//       }
//       updateData.startTime = startMoment.toDate();
//     }

//     if (endTime) {
//       endMoment = moment(endTime);
//       if (!endMoment.isValid()) {
//         return res
//           .status(400)
//           .json(new ApiResponse(false, "Invalid end time format"));
//       }
//       updateData.endTime = endMoment.toDate();
//     }

//     // Use provided times or fall back to current shift times for validation
//     const validationStart = startMoment || moment(currentShift.startTime);
//     const validationEnd = endMoment || moment(currentShift.endTime);

//     // Basic time validation - end must be after start
//     if (validationEnd.isSameOrBefore(validationStart)) {
//       return res
//         .status(400)
//         .json(new ApiResponse(false, "End time must be after start time"));
//     }

//     // More flexible past time validation
//     if (startTime && !isShiftCompleted && !isShiftInProgress) {
//       // Only prevent moving start time to past for future shifts
//       if (validationStart.isBefore(now)) {
//         return res
//           .status(400)
//           .json(
//             new ApiResponse(false, "Cannot move shift start time to the past")
//           );
//       }
//     }

//     // Handle other fields
//     if (shiftName) updateData.shiftName = shiftName;
//     if (shiftType) updateData.shiftType = shiftType;
//     if (timezone) updateData.timezone = timezone;

//     // Handle assignedGuards with special logic for completed/in-progress shifts
//   if (assignedGuards) {
//     updateData.assignedGuards = assignedGuards;
//   }
//     // Overlap check - only for future time periods and active guards
//     if (assignedGuards?.length) {
//       const overlapStart = startMoment
//         ? startMoment.toDate()
//         : currentShift.startTime;
//       const overlapEnd = endMoment ? endMoment.toDate() : currentShift.endTime;

//       // Only check overlap for future time periods
//       if (moment(overlapStart).isAfter(now)) {
//         const overlap = await Shift.findOne({
//           _id: { $ne: req.params.id },
//           assignedGuards: { $in: assignedGuards },
//           isActive: true,
//           startTime: { $lt: overlapEnd },
//           endTime: { $gt: overlapStart },
//         });

//         if (overlap) {
//           return res
//             .status(400)
//             .json(
//               new ApiResponse(
//                 false,
//                 "One or more guards already have an overlapping shift"
//               )
//             );
//         }
//       }
//     }

//     // Add update timestamp and updatedBy info
//     updateData.updatedAt = new Date();
//     updateData.updatedBy = req.user.id;

//     const updated = await Shift.findOneAndUpdate(filter, updateData, {
//       new: true,
//     }).populate("assignedGuards", "name email role");

//     if (!updated) {
//       return res.status(404).json(new ApiResponse(false, "Shift not found"));
//     }

//     return res
//       .status(200)
//       .json(new ApiResponse(true, "Shift updated successfully", updated));
//   } catch (err) {
//     console.error("Error updating shift:", err);
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };


exports.updateShift = async (req, res) => {
  try {
    const {
      shiftName,
      startTime,
      endTime,
      shiftType,
      assignedGuards,
      timezone,
      recurrence, // ADD THIS
    } = req.body;

    console.log("=== SHIFT UPDATE DEBUG ===");
    console.log("Recurrence data received:", recurrence);

    const filter = { _id: req.params.id };
    if (req.user.role === "supervisor") filter.createdBy = req.user.id;

    const updateData = {};
    let startMoment, endMoment;

    // Get current shift data for reference
    const currentShift = await Shift.findById(req.params.id);
    if (!currentShift) {
      return res.status(404).json(new ApiResponse(false, "Shift not found"));
    }

    const now = moment();
    const isShiftCompleted = moment(currentShift.endTime).isBefore(now);
    const isShiftInProgress =
      moment(currentShift.startTime).isBefore(now) &&
      moment(currentShift.endTime).isAfter(now);

    // Validate time formats
    if (startTime) {
      startMoment = moment(startTime);
      if (!startMoment.isValid()) {
        return res
          .status(400)
          .json(new ApiResponse(false, "Invalid start time format"));
      }
      updateData.startTime = startMoment.toDate();
    }

    if (endTime) {
      endMoment = moment(endTime);
      if (!endMoment.isValid()) {
        return res
          .status(400)
          .json(new ApiResponse(false, "Invalid end time format"));
      }
      updateData.endTime = endMoment.toDate();
    }

    // Use provided times or fall back to current shift times for validation
    const validationStart = startMoment || moment(currentShift.startTime);
    const validationEnd = endMoment || moment(currentShift.endTime);

    // Basic time validation - end must be after start
    if (validationEnd.isSameOrBefore(validationStart)) {
      return res
        .status(400)
        .json(new ApiResponse(false, "End time must be after start time"));
    }

    // More flexible past time validation
    if (startTime && !isShiftCompleted && !isShiftInProgress) {
      // Only prevent moving start time to past for future shifts
      if (validationStart.isBefore(now)) {
        return res
          .status(400)
          .json(
            new ApiResponse(false, "Cannot move shift start time to the past")
          );
      }
    }

    // Handle other fields
    if (shiftName) updateData.shiftName = shiftName;
    if (shiftType) updateData.shiftType = shiftType;
    if (timezone) updateData.timezone = timezone;

    // Handle assignedGuards with special logic for completed/in-progress shifts
    if (assignedGuards) {
      updateData.assignedGuards = assignedGuards;
    }

    // Handle recurrence data - ADD THIS SECTION
    if (recurrence !== undefined) {
      if (recurrence.enabled === true) {
        console.log("Updating to RECURRING shift with data:", recurrence);

        updateData.recurrence = {
          enabled: true,
          frequency: recurrence.frequency || "daily",
          daysOfWeek: recurrence.daysOfWeek || [],
          datesOfMonth: recurrence.datesOfMonth || [],
          customInterval: recurrence.customInterval || 1,
          endDate: recurrence.endDate ? new Date(recurrence.endDate) : null,
          endAfterOccurrences: recurrence.endAfterOccurrences || null,
        };

        // For recurring shifts, adjust times to template format
        if (recurrence.enabled) {
          const templateDate = moment().startOf("day");
          const effectiveStartMoment =
            startMoment || moment(currentShift.startTime);
          const effectiveEndMoment = endMoment || moment(currentShift.endTime);

          updateData.startTime = templateDate
            .clone()
            .hour(effectiveStartMoment.hour())
            .minute(effectiveStartMoment.minute())
            .toDate();

          updateData.endTime = templateDate
            .clone()
            .hour(effectiveEndMoment.hour())
            .minute(effectiveEndMoment.minute())
            .toDate();

          // Handle overnight shifts
          if (effectiveEndMoment.isBefore(effectiveStartMoment)) {
            updateData.endTime = moment(updateData.endTime)
              .add(1, "day")
              .toDate();
          }
        }
      } else {
        // Disable recurrence
        updateData.recurrence = {
          enabled: false,
          frequency: "daily",
          daysOfWeek: [],
          datesOfMonth: [],
          customInterval: 1,
        };
      }
    }

    // Overlap check - only for future time periods and active guards
    if (assignedGuards?.length) {
      const overlapStart = startMoment
        ? startMoment.toDate()
        : currentShift.startTime;
      const overlapEnd = endMoment ? endMoment.toDate() : currentShift.endTime;

      // Only check overlap for future time periods
      if (moment(overlapStart).isAfter(now)) {
        const overlap = await Shift.findOne({
          _id: { $ne: req.params.id },
          assignedGuards: { $in: assignedGuards },
          isActive: true,
          startTime: { $lt: overlapEnd },
          endTime: { $gt: overlapStart },
        });

        if (overlap) {
          return res
            .status(400)
            .json(
              new ApiResponse(
                false,
                "One or more guards already have an overlapping shift"
              )
            );
        }
      }
    }

    // Add update timestamp and updatedBy info
    updateData.updatedAt = new Date();
    updateData.updatedBy = req.user.id;

    console.log("Final update data:", updateData);

    const updated = await Shift.findOneAndUpdate(filter, updateData, {
      new: true,
    }).populate("assignedGuards", "name email role");

    if (!updated) {
      return res.status(404).json(new ApiResponse(false, "Shift not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(true, "Shift updated successfully", updated));
  } catch (err) {
    console.error("Error updating shift:", err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};