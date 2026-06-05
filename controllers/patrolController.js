const Patrol = require("../models/Patrol");
const QR = require("../models/QR");
const User = require("../models/User");
const { validateLocation } = require("../utils/qrValidator");
const { verifyQRSignature } = require("../utils/qrVerifier");
const ApiResponse = require("../utils/apiResponse");
const fs = require("fs").promises;
const path = require("path");
const { uploadDir } = require("../middleware/multer");
const mongoose = require("mongoose");
const Shift = require("../models/Shift");
const Attendance = require("../models/Attendance");

const Incident = require("../models/Incident");
const PatrolPlan = require("../models/PatrolPlan");
const { log } = require("console");

const moment = require("moment-timezone");

/*import the email sending function and there helper function*/
const {
  buildReportData,
  buildExcel,
} = require("../controllers/schedulerController");
const sendEmail = require("../utils/sendEmail");
// **** newly added

//  2. HELPER FUNCTION: Check & Mark Expired Rounds
// ============================================
async function checkAndMarkExpiredRounds(
  guardId,
  patrolPlanId,
  shiftId,
  occurrenceDate,
  shiftTimezone,
) {
  try {
    const plan = await PatrolPlan.findById(patrolPlanId);
    const totalCheckpoints = plan.checkpoints.length;

    // Get start & end of occurrence day (in shift timezone)
    const dayStart = moment(occurrenceDate)
      .tz(shiftTimezone || "Asia/Kolkata")
      .startOf("day")
      .toDate();

    const dayEnd = moment(occurrenceDate)
      .tz(shiftTimezone || "Asia/Kolkata")
      .endOf("day")
      .toDate();

    // Get all scans for this shift/day
    const allScans = await Patrol.find({
      guard: guardId,
      patrolPlanId: patrolPlanId,
      shift: shiftId,
      createdAt: { $gte: dayStart, $lte: dayEnd },
      status: { $ne: "expired" }, // Don't re-check already expired rounds
    }).sort({ roundNumber: 1, createdAt: 1 });

    console.log(
      `✅ [checkAndMarkExpiredRounds] Found ${allScans.length} active scans for today`,
    );

    if (allScans.length === 0) return;

    // Group scans by round
    const scansByRound = {};
    allScans.forEach((scan) => {
      const rNum = scan.roundNumber || 1;
      if (!scansByRound[rNum]) scansByRound[rNum] = [];
      scansByRound[rNum].push(scan);
    });

    const now = moment().tz(shiftTimezone || "Asia/Kolkata");

    // Check each round for expiry
    for (const [roundNum, scans] of Object.entries(scansByRound)) {
      const roundNumInt = parseInt(roundNum);
      const firstScanTime = moment(scans[0].createdAt).tz(
        shiftTimezone || "Asia/Kolkata",
      );
      const expiryTime = firstScanTime.clone().add(1, "hour");
      const isRoundComplete = scans.length === totalCheckpoints;

      console.log(`🔍 [checkAndMarkExpiredRounds] Round ${roundNum}:`);
      console.log(`   First scan: ${firstScanTime.format("HH:mm:ss")}`);
      console.log(`   Expiry time: ${expiryTime.format("HH:mm:ss")}`);
      console.log(`   Current time: ${now.format("HH:mm:ss")}`);
      console.log(
        `   Complete: ${isRoundComplete} (${scans.length}/${totalCheckpoints})`,
      );

      // If 1 hour passed AND round not complete → Mark as expired
      if (now.isAfter(expiryTime) && !isRoundComplete) {
        console.log(
          `⏰ [checkAndMarkExpiredRounds] EXPIRING Round ${roundNum}! (${scans.length}/${totalCheckpoints} completed)`,
        );

        // Mark all scans in this round as expired
        await Patrol.updateMany(
          {
            guard: guardId,
            patrolPlanId: patrolPlanId,
            shift: shiftId,
            roundNumber: roundNumInt,
            createdAt: { $gte: dayStart, $lte: dayEnd },
          },
          {
            status: "expired",
            expiryReason: `Exceeded 1 hour without completing all checkpoints (${scans.length}/${totalCheckpoints} done)`,
          },
        );

        console.log(
          `📝 [checkAndMarkExpiredRounds] Round ${roundNum} marked as expired. Scans: ${scans.length}, checkpoints done out of ${totalCheckpoints}`,
        );
      }
    }
  } catch (err) {
    console.error("❌ Error in checkAndMarkExpiredRounds:", err);
  }
}

// *** for expiry

// ********

// async function findActiveShiftForGuard(guardId, currentTime) {
//   const now = moment(currentTime);
//   console.log(`🔍 Checking active shifts for guard ${guardId} at ${now.format()}`);

//   // Find all potentially active shifts for this guard - WITHOUT .lean()
//   const shifts = await Shift.find({
//     assignedGuards: guardId,
//     isActive: true,
//   }); // Remove .lean() to get Mongoose documents with methods

//   console.log(`📋 Found ${shifts.length} assigned shifts for guard`);

//   for (const shift of shifts) {
//     const isRecurring = shift.recurrence?.enabled || false;
//     console.log(`🔄 Processing shift: ${shift.shiftName} (Recurring: ${isRecurring})`);

//     if (!isRecurring) {
//       // ONE-TIME SHIFT: Check if current time is within shift period
//       const shiftStart = moment(shift.startTime);
//       const shiftEnd = moment(shift.endTime);

//       console.log(`⏰ One-time shift: ${shiftStart.format()} to ${shiftEnd.format()}`);
//       console.log(`📊 Now is between: ${now.isBetween(shiftStart, shiftEnd, null, '[]')}`);

//       if (now.isBetween(shiftStart, shiftEnd, null, "[]")) {
//         console.log(`✅ Found active one-time shift: ${shift.shiftName}`);
//         return shift;
//       }
//     } else {
//       // RECURRING SHIFT: Check if should occur today
//       const shouldOccurToday = shift.shouldOccurOnDate(now.toDate());
//       console.log(`📅 Should occur today: ${shouldOccurToday}`);

//       if (!shouldOccurToday) continue;

//       // Check if recurrence has ended
//       if (shift.recurrence.endDate && now.isAfter(moment(shift.recurrence.endDate))) {
//         console.log(`❌ Recurrence ended on ${moment(shift.recurrence.endDate).format()}`);
//         continue;
//       }

//       // Build today's shift time window using the template times
//       const templateStart = moment(shift.startTime);
//       const templateEnd = moment(shift.endTime);

//       console.log(`🕒 Template times: ${templateStart.format('HH:mm')} to ${templateEnd.format('HH:mm')}`);

//       // Create today's start time
//       const todayShiftStart = now.clone()
//         .startOf('day')
//         .hour(templateStart.hour())
//         .minute(templateStart.minute())
//         .second(templateStart.second());

//       // Create today's end time
//       let todayShiftEnd = now.clone()
//         .startOf('day')
//         .hour(templateEnd.hour())
//         .minute(templateEnd.minute())
//         .second(templateEnd.second());

//       // Handle overnight shifts (end time is before start time)
//       if (templateEnd.isBefore(templateStart)) {
//         console.log(`🌙 Overnight shift detected`);
//         todayShiftEnd.add(1, "day");
//       }

//       console.log(`🕐 Today's shift window: ${todayShiftStart.format()} to ${todayShiftEnd.format()}`);
//       console.log(`📊 Now is between: ${now.isBetween(todayShiftStart, todayShiftEnd, null, '[]')}`);

//       if (now.isBetween(todayShiftStart, todayShiftEnd, null, "[]")) {
//         console.log(`✅ Found active recurring shift: ${shift.shiftName}`);

//         // Convert to plain object and enhance with today's times
//         const shiftObj = shift.toObject ? shift.toObject() : { ...shift };

//         return {
//           ...shiftObj,
//           _id: shiftObj._id.toString(),
//           startTime: todayShiftStart.toDate(),
//           endTime: todayShiftEnd.toDate(),
//           parentShiftId: shiftObj._id,
//           isRecurring: true,
//           occurrenceDate: now.startOf('day').toDate()
//         };
//       } else {
//         console.log(`❌ Current time not in shift window`);
//       }
//     }
//   }

//   console.log("❌ No matching active shift found for guard", guardId);
//   return null;
// }

// async function findActiveShiftForGuard(guardId, currentTime) {
//   const now = moment(currentTime);
//   console.log(`🔍 Checking active shifts for guard ${guardId} at ${now.format()}`);

//   // Find all potentially active shifts for this guard
//   const shifts = await Shift.find({
//     assignedGuards: guardId,
//     isActive: true,
//   });

//   console.log(`📋 Found ${shifts.length} assigned shifts for guard`);

//   for (const shift of shifts) {
//     const isRecurring = shift.recurrence?.enabled || false;
//     const timezone = shift.timezone || 'UTC';

//     console.log(`🔄 Processing shift: ${shift.shiftName} (Recurring: ${isRecurring}, Timezone: ${timezone})`);

//     // Convert current time to shift's timezone
//     const nowInShiftTz = now.clone().tz(timezone);
//     console.log(`🌐 Now in shift timezone: ${nowInShiftTz.format()}`);

//     if (!isRecurring) {
//       // ONE-TIME SHIFT: Check if current time is within shift period
//       const shiftStart = moment(shift.startTime).tz(timezone);
//       const shiftEnd = moment(shift.endTime).tz(timezone);

//       console.log(`⏰ One-time shift: ${shiftStart.format()} to ${shiftEnd.format()}`);
//       console.log(`📊 Now is between: ${nowInShiftTz.isBetween(shiftStart, shiftEnd, null, '[]')}`);

//       if (nowInShiftTz.isBetween(shiftStart, shiftEnd, null, "[]")) {
//         console.log(`✅ Found active one-time shift: ${shift.shiftName}`);
//         return shift;
//       }
//     } else {
//       // RECURRING SHIFT: Check if should occur today
//       const shouldOccurToday = shift.shouldOccurOnDate(nowInShiftTz.toDate());
//       console.log(`📅 Should occur today: ${shouldOccurToday}`);

//       if (!shouldOccurToday) continue;

//       // Check if recurrence has ended
//       if (shift.recurrence.endDate && nowInShiftTz.isAfter(moment(shift.recurrence.endDate).tz(timezone))) {
//         console.log(`❌ Recurrence ended on ${moment(shift.recurrence.endDate).tz(timezone).format()}`);
//         continue;
//       }

//       // Get the ORIGINAL shift times in the correct timezone
//       const originalStart = moment(shift.startTime).tz(timezone);
//       const originalEnd = moment(shift.endTime).tz(timezone);

//       console.log(`🕒 Original shift times: ${originalStart.format('HH:mm')} to ${originalEnd.format('HH:mm')}`);

//       // Create today's start time using the original time components
//       const todayShiftStart = nowInShiftTz.clone()
//         .startOf('day')
//         .hour(originalStart.hour())
//         .minute(originalStart.minute())
//         .second(originalStart.second())
//         .millisecond(originalStart.millisecond());

//       // Create today's end time
//       let todayShiftEnd = nowInShiftTz.clone()
//         .startOf('day')
//         .hour(originalEnd.hour())
//         .minute(originalEnd.minute())
//         .second(originalEnd.second())
//         .millisecond(originalEnd.millisecond());

//       // Handle overnight shifts (end time is before start time)
//       if (todayShiftEnd.isBefore(todayShiftStart)) {
//         console.log(`🌙 Overnight shift detected`);
//         todayShiftEnd.add(1, "day");
//       }

//       console.log(`🕐 Today's shift window: ${todayShiftStart.format()} to ${todayShiftEnd.format()}`);
//       console.log(`📊 Now is between: ${nowInShiftTz.isBetween(todayShiftStart, todayShiftEnd, null, '[]')}`);

//       if (nowInShiftTz.isBetween(todayShiftStart, todayShiftEnd, null, "[]")) {
//         console.log(`✅ Found active recurring shift: ${shift.shiftName}`);

//         // Convert to plain object and enhance with today's times
//         const shiftObj = shift.toObject ? shift.toObject() : { ...shift };

//         return {
//           ...shiftObj,
//           _id: shiftObj._id.toString(),
//           startTime: todayShiftStart.toDate(),
//           endTime: todayShiftEnd.toDate(),
//           parentShiftId: shiftObj._id,
//           isRecurring: true,
//           occurrenceDate: nowInShiftTz.startOf('day').toDate()
//         };
//       } else {
//         console.log(`❌ Current time not in shift window`);
//         console.log(`   Current: ${nowInShiftTz.format('HH:mm')}`);
//         console.log(`   Window: ${todayShiftStart.format('HH:mm')} - ${todayShiftEnd.format('HH:mm')}`);
//       }
//     }
//   }

//   console.log("❌ No matching active shift found for guard", guardId);
//   return null;
// }

async function findActiveShiftForGuard(guardId, currentTime) {
  const now = moment(currentTime);
  console.log(
    `\n🔍 [findActiveShiftForGuard] Checking active shifts for guard ${guardId} at ${now.format()}`,
  );

  // Find all shifts assigned to this guard
  const shifts = await Shift.find({
    assignedGuards: guardId,
    isActive: true,
    isTemplate: { $ne: true },
  });

  console.log(
    `📋 [findActiveShiftForGuard] Found ${shifts.length} assigned shifts`,
  );

  for (const shift of shifts) {
    const isRecurring = shift.recurrence?.enabled || false;
    const timezone = shift.timezone || "UTC";

    console.log(
      `\n🔄 [findActiveShiftForGuard] Processing shift: ${shift.shiftName} (Recurring: ${isRecurring}, TZ: ${timezone})`,
    );

    // Convert current time to shift's timezone
    const nowInShiftTz = now.clone().tz(timezone);
    console.log(
      `🌐 [findActiveShiftForGuard] Now in shift timezone: ${nowInShiftTz.format()}`,
    );

    if (!isRecurring) {
      // ONE-TIME SHIFT: Check if current time is within shift period
      const shiftStart = moment(shift.startTime).tz(timezone);
      const shiftEnd = moment(shift.endTime).tz(timezone);

      console.log(
        `⏰ [findActiveShiftForGuard] One-time shift: ${shiftStart.format()} to ${shiftEnd.format()}`,
      );

      if (nowInShiftTz.isBetween(shiftStart, shiftEnd, null, "[]")) {
        console.log(
          `✅ [findActiveShiftForGuard] Found active one-time shift: ${shift.shiftName}`,
        );
        return shift;
      }
    } else {
      // RECURRING SHIFT: Check if should occur today
      const shouldOccurToday = shift.shouldOccurOnDate(nowInShiftTz.toDate());
      console.log(
        `📅 [findActiveShiftForGuard] Should occur today: ${shouldOccurToday}`,
      );

      if (!shouldOccurToday) {
        console.log(
          `❌ [findActiveShiftForGuard] Shift doesn't occur on this date`,
        );
        continue;
      }

      // Check if recurrence has ended
      if (
        shift.recurrence?.endDate &&
        nowInShiftTz.isAfter(moment(shift.recurrence.endDate).tz(timezone))
      ) {
        console.log(
          `❌ [findActiveShiftForGuard] Recurrence ended on ${moment(
            shift.recurrence.endDate,
          )
            .tz(timezone)
            .format()}`,
        );
        continue;
      }

      // Get the ORIGINAL shift times in the correct timezone
      const originalStart = moment(shift.startTime).tz(timezone);
      const originalEnd = moment(shift.endTime).tz(timezone);

      console.log(
        `🕒 [findActiveShiftForGuard] Original shift times: ${originalStart.format(
          "HH:mm:ss",
        )} to ${originalEnd.format("HH:mm:ss")}`,
      );

      // Create today's start time using the original time components
      const todayShiftStart = nowInShiftTz
        .clone()
        .startOf("day")
        .hour(originalStart.hour())
        .minute(originalStart.minute())
        .second(originalStart.second())
        .millisecond(originalStart.millisecond());

      // Create today's end time
      let todayShiftEnd = nowInShiftTz
        .clone()
        .startOf("day")
        .hour(originalEnd.hour())
        .minute(originalEnd.minute())
        .second(originalEnd.second())
        .millisecond(originalEnd.millisecond());

      // Handle overnight shifts (end time is before start time)
      if (todayShiftEnd.isBefore(todayShiftStart)) {
        console.log(`🌙 [findActiveShiftForGuard] Overnight shift detected`);
        todayShiftEnd.add(1, "day");
      }

      console.log(
        `🕐 [findActiveShiftForGuard] Today's shift window: ${todayShiftStart.format()} to ${todayShiftEnd.format()}`,
      );

      if (nowInShiftTz.isBetween(todayShiftStart, todayShiftEnd, null, "[]")) {
        console.log(
          `✅ [findActiveShiftForGuard] Found active recurring shift: ${shift.shiftName}`,
        );

        // Convert to plain object and enhance with today's times
        const shiftObj = shift.toObject ? shift.toObject() : { ...shift };

        return {
          ...shiftObj,
          _id: shiftObj._id.toString(),
          startTime: todayShiftStart.toDate(),
          endTime: todayShiftEnd.toDate(),
          parentShiftId: shiftObj._id,
          isRecurring: true,
          occurrenceDate: nowInShiftTz.startOf("day").toDate(),
        };
      } else {
        console.log(
          `❌ [findActiveShiftForGuard] Current time not in shift window`,
        );
        console.log(`   Current time: ${nowInShiftTz.format("HH:mm:ss")}`);
        console.log(
          `   Expected: ${todayShiftStart.format(
            "HH:mm:ss",
          )} - ${todayShiftEnd.format("HH:mm:ss")}`,
        );
      }
    }
  }

  console.log(
    `\n❌ [findActiveShiftForGuard] No matching active shift found for guard ${guardId}`,
  );
  return null;
}

// *********

// ********

// exports.scanQR = async (req, res) => {
//   try {
//     const guardId = req.user.id;
//     const companyId = new mongoose.Types.ObjectId(req.user.companyId);

//     console.log("scanQR hit", req.user, req.body, req.file);

//     const { qrData, guardLat, guardLng, distanceMeters, isVerified } = req.body;

//     if (
//       !qrData ||
//       guardLat == null ||
//       guardLng == null ||
//       distanceMeters == null ||
//       isVerified == null
//     ) {
//       return res
//         .status(400)
//         .json(new ApiResponse(false, "All fields required"));
//     }

//     const guard = await User.findById(
//       new mongoose.Types.ObjectId(guardId)
//     ).populate("createdBy");

//     if (!guard || guard.role !== "guard") {
//       return res.status(403).json(new ApiResponse(false, "Invalid guard"));
//     }

//     // Handle photo upload
//     let photoBase64 = null;
//     if (req.file) {
//       const full = path.join(uploadDir, req.file.filename);
//       const data = await fs.readFile(full);
//       photoBase64 = data.toString("base64");
//       await fs
//         .unlink(full)
//         .catch((e) => console.warn("unlink failed:", e.message));
//     }

//     const now = new Date();

//     // ============================================
//     // 🔄 UPDATED: Find active shift (supports recurring)
//     // ============================================
//     const activeShift = await findActiveShiftForGuard(guardId, now);

//     if (!activeShift) {
//       return res
//         .status(400)
//         .json(
//           new ApiResponse(
//             false,
//             "No active shift found. You can only scan QR codes during your assigned shift."
//           )
//         );
//     }

//     console.log(
//       `✅ Active shift found: ${activeShift.shiftName} (${
//         activeShift.recurrence?.enabled ? "Recurring" : "One-time"
//       })`
//     );

//     // Validate QR code
//     let qrDoc = null;
//     if (mongoose.Types.ObjectId.isValid(qrData)) {
//       qrDoc = await QR.findById(qrData);
//     }
//     if (!qrDoc) {
//       return res
//         .status(404)
//         .json(new ApiResponse(false, "Invalid or expired QR"));
//     }

//     // Find the patrol plan that contains this QR and is assigned to this guard
//     let patrolPlan = await PatrolPlan.findOne({
//       "assignedGuards.guardId": guardId,
//       "checkpoints.qrId": qrDoc._id,
//       isActive: true,
//     });

//     if (!patrolPlan) {
//       return res
//         .status(404)
//         .json(
//           new ApiResponse(false, "No active patrol plan assigned with this QR")
//         );
//     }

//     // Check guard assignment to current shift
//     if (activeShift) {
//       const guardAssignment = patrolPlan.assignedGuards.find(
//         (ag) => ag.guardId.toString() === guardId
//       );

//       // If patrol plan specifies shifts, verify guard is assigned to this shift
//       if (guardAssignment?.assignedShifts?.length) {
//         const isAssignedToThisShift = guardAssignment.assignedShifts.some(
//           (shiftId) => shiftId.toString() === activeShift._id.toString()
//         );

//         if (!isAssignedToThisShift) {
//           return res
//             .status(403)
//             .json(
//               new ApiResponse(
//                 false,
//                 "You are not assigned to scan this QR code during current shift"
//               )
//             );
//         }
//       }
//     }

//     // --- SHIFT-SPECIFIC ROUND LOGIC ---
//     const totalCheckpoints = patrolPlan.checkpoints.length;

//     // Get all scans for this guard, patrol plan, AND current shift
//     const allScans = await Patrol.find({
//       guard: guardId,
//       patrolPlanId: patrolPlan._id,
//       shift: activeShift._id, // CRITICAL: Only scans from current shift
//     }).sort({ createdAt: 1 });

//     console.log(
//       `📊 Found ${allScans.length} previous scans in this shift for this patrol plan`
//     );

//     // Determine current round number (shift-specific)
//     let currentRound = 1;
//     let scansInCurrentRound = [];

//     if (allScans.length > 0) {
//       // Group scans by round number stored in DB
//       const scansByRound = {};
//       allScans.forEach((scan) => {
//         const rNum = scan.roundNumber || 1;
//         if (!scansByRound[rNum]) scansByRound[rNum] = [];
//         scansByRound[rNum].push(scan);
//       });

//       // Find the latest incomplete round or start a new one
//       const roundNumbers = Object.keys(scansByRound)
//         .map(Number)
//         .sort((a, b) => a - b);

//       for (const rNum of roundNumbers) {
//         const scansInRound = scansByRound[rNum];
//         if (scansInRound.length < totalCheckpoints) {
//           // This round is incomplete
//           currentRound = rNum;
//           scansInCurrentRound = scansInRound;
//           break;
//         } else if (rNum === roundNumbers[roundNumbers.length - 1]) {
//           // Last round is complete, start new round
//           currentRound = rNum + 1;
//           scansInCurrentRound = [];
//         }
//       }
//     }

//     console.log(`🔄 Current round: ${currentRound}/${patrolPlan.rounds}`);

//     // Don't allow scanning beyond the total rounds
//     if (currentRound > patrolPlan.rounds) {
//       return res
//         .status(400)
//         .json(
//           new ApiResponse(
//             false,
//             `All ${patrolPlan.rounds} rounds for this patrol plan are completed in this shift`
//           )
//         );
//     }

//     // Get checkpoint IDs already scanned in current round
//     const scannedCheckpointIds = scansInCurrentRound.map((scan) =>
//       scan.qrCodeId.toString()
//     );

//     // Check if current checkpoint already scanned in this round
//     if (scannedCheckpointIds.includes(qrDoc._id.toString())) {
//       return res
//         .status(400)
//         .json(
//           new ApiResponse(
//             false,
//             `You have already scanned this checkpoint in round ${currentRound}. Progress: ${scannedCheckpointIds.length}/${totalCheckpoints} checkpoints completed.`
//           )
//         );
//     }

//     // Optional: Enforce sequence order (uncomment if you want strict sequential scanning)
//     /*
//     const currentCheckpoint = patrolPlan.checkpoints.find(
//       cp => cp.qrId.toString() === qrDoc._id.toString()
//     );

//     if (currentCheckpoint) {
//       const expectedSequence = scannedCheckpointIds.length + 1;
//       if (currentCheckpoint.sequence !== expectedSequence) {
//         const nextCheckpoint = patrolPlan.checkpoints.find(
//           cp => cp.sequence === expectedSequence
//         );
//         return res.status(400).json(
//           new ApiResponse(
//             false,
//             `Please scan checkpoints in sequence. Next checkpoint: ${nextCheckpoint?.siteId || 'unknown'}`
//           )
//         );
//       }
//     }
//     */

//     // Create new patrol record WITH SHIFT ID
//     const patrol = await Patrol.create({
//       guard: guardId,
//       shift: activeShift._id, // CRITICAL: Store shift reference
//       patrolPlanId: patrolPlan._id,
//       qrCodeId: qrDoc._id,
//       roundNumber: currentRound,
//       location: { lat: Number(guardLat), lng: Number(guardLng) },
//       distanceMeters: Number(distanceMeters),
//       photo: photoBase64,
//       isVerified: Boolean(isVerified),
//       firstScanAt: now,
//       lastScanAt: now,
//       companyId: companyId,
//       scanCount: 1,
//     });

//     console.log(
//       `✅ Scan recorded: Round ${currentRound}, Checkpoint ${
//         scannedCheckpointIds.length + 1
//       }/${totalCheckpoints}`
//     );

//     // Calculate progress
//     const scannedCount = scannedCheckpointIds.length + 1;
//     const isRoundComplete = scannedCount === totalCheckpoints;
//     const progressMessage = isRoundComplete
//       ? `Round ${currentRound} completed! ${
//           currentRound < patrolPlan.rounds
//             ? "Ready for next round."
//             : "All rounds completed for this shift!"
//         }`
//       : `Progress: ${scannedCount}/${totalCheckpoints} checkpoints in round ${currentRound}`;

//     return res.status(201).json(
//       new ApiResponse(true, progressMessage, {
//         patrolId: patrol._id,
//         companyId: patrol?.companyId,
//         qrCodeId: qrDoc._id,
//         siteId: qrDoc.siteId,
//         patrolPlanId: patrolPlan._id,
//         patrolPlanName: patrolPlan.planName,
//         shiftId: activeShift._id,
//         shiftName: activeShift.shiftName,
//         isRecurringShift: activeShift.recurrence?.enabled || false,
//         isVerified: Boolean(isVerified),
//         distanceMeters: Number(distanceMeters),
//         timestamp: patrol.createdAt,
//         roundNumber: currentRound,
//         scanCount: 1,
//         progress: {
//           currentRound,
//           totalRounds: patrolPlan.rounds,
//           checkpointsScanned: scannedCount,
//           totalCheckpoints,
//           isRoundComplete,
//           remainingCheckpoints: totalCheckpoints - scannedCount,
//         },
//       })
//     );
//   } catch (err) {
//     console.error("Error in scanQR:", err);
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };

// ⬇️ niche wala scaQr tested h
// exports.scanQR = async (req, res) => {
//   try {
//     const guardId = req.user.id;
//     const companyId = new mongoose.Types.ObjectId(req.user.companyId);

//     const { qrData, guardLat, guardLng, distanceMeters, isVerified } = req.body;

//     if (
//       !qrData ||
//       guardLat == null ||
//       guardLng == null ||
//       distanceMeters == null ||
//       isVerified == null
//     ) {
//       return res
//         .status(400)
//         .json(new ApiResponse(false, "All fields required"));
//     }

//     const guard = await User.findById(
//       new mongoose.Types.ObjectId(guardId)
//     ).populate("createdBy");

//     if (!guard || guard.role !== "guard") {
//       return res.status(403).json(new ApiResponse(false, "Invalid guard"));
//     }

//     let photoBase64 = null;
//     if (req.file) {
//       const full = path.join(uploadDir, req.file.filename);
//       const data = await fs.readFile(full);
//       photoBase64 = data.toString("base64");
//       await fs
//         .unlink(full)
//         .catch((e) => console.warn("unlink failed:", e.message));
//     }

//     const now = new Date();
//     const activeShift = await findActiveShiftForGuard(guardId, now);

//     if (!activeShift) {
//       return res
//         .status(400)
//         .json(
//           new ApiResponse(
//             false,
//             "No active shift found. You can only scan QR codes during your assigned shift."
//           )
//         );
//     }

//     console.log(
//       `✅ Active shift found: ${activeShift.shiftName} (Occurrence: ${moment(
//         activeShift.occurrenceDate
//       ).format("YYYY-MM-DD")})`
//     );

//     let qrDoc = null;
//     if (mongoose.Types.ObjectId.isValid(qrData)) {
//       qrDoc = await QR.findById(qrData);
//     }
//     if (!qrDoc) {
//       return res
//         .status(404)
//         .json(new ApiResponse(false, "Invalid or expired QR"));
//     }

//     let patrolPlan = await PatrolPlan.findOne({
//       "assignedGuards.guardId": guardId,
//       "checkpoints.qrId": qrDoc._id,
//       isActive: true,
//     });

//     if (!patrolPlan) {
//       return res
//         .status(404)
//         .json(
//           new ApiResponse(false, "No active patrol plan assigned with this QR")
//         );
//     }

//     if (activeShift) {
//       const guardAssignment = patrolPlan.assignedGuards.find(
//         (ag) => ag.guardId.toString() === guardId
//       );

//       if (guardAssignment?.assignedShifts?.length) {
//         const isAssignedToThisShift = guardAssignment.assignedShifts.some(
//           (shiftId) => shiftId.toString() === activeShift._id.toString()
//         );

//         if (!isAssignedToThisShift) {
//           return res
//             .status(403)
//             .json(
//               new ApiResponse(
//                 false,
//                 "You are not assigned to scan this QR code during current shift"
//               )
//             );
//         }
//       }
//     }

//     const totalCheckpoints = patrolPlan.checkpoints.length;

//     // CRITICAL: Only get scans from TODAY for this shift
//     const dayStart = moment(activeShift.occurrenceDate || now)
//       .tz("Asia/Kolkata")
//       .startOf("day")
//       .toDate();
//     const dayEnd = moment(activeShift.occurrenceDate || now)
//       .tz("Asia/Kolkata")
//       .endOf("day")
//       .toDate();

//     const allScans = await Patrol.find({
//       guard: guardId,
//       patrolPlanId: patrolPlan._id,
//       shift: activeShift._id,
//       createdAt: { $gte: dayStart, $lte: dayEnd }, // TODAY ONLY
//     }).sort({ createdAt: 1 });

//     console.log(
//       `📊 Found ${allScans.length} scans for today (${moment(dayStart).format(
//         "YYYY-MM-DD"
//       )})`
//     );

//     let currentRound = 1;
//     let scansInCurrentRound = [];

//     if (allScans.length > 0) {
//       const scansByRound = {};
//       allScans.forEach((scan) => {
//         const rNum = scan.roundNumber || 1;
//         if (!scansByRound[rNum]) scansByRound[rNum] = [];
//         scansByRound[rNum].push(scan);
//       });

//       const roundNumbers = Object.keys(scansByRound)
//         .map(Number)
//         .sort((a, b) => a - b);

//       for (const rNum of roundNumbers) {
//         const scansInRound = scansByRound[rNum];
//         if (scansInRound.length < totalCheckpoints) {
//           currentRound = rNum;
//           scansInCurrentRound = scansInRound;
//           break;
//         } else if (rNum === roundNumbers[roundNumbers.length - 1]) {
//           currentRound = rNum + 1;
//           scansInCurrentRound = [];
//         }
//       }
//     }

//     console.log(`🔄 Current round: ${currentRound}/${patrolPlan.rounds}`);

//     if (currentRound > patrolPlan.rounds) {
//       return res
//         .status(400)
//         .json(
//           new ApiResponse(
//             false,
//             `All ${patrolPlan.rounds} rounds for this patrol plan are completed in this shift`
//           )
//         );
//     }

//     const scannedCheckpointIds = scansInCurrentRound.map((scan) =>
//       scan.qrCodeId.toString()
//     );

//     if (scannedCheckpointIds.includes(qrDoc._id.toString())) {
//       return res
//         .status(400)
//         .json(
//           new ApiResponse(
//             false,
//             `You have already scanned this checkpoint in round ${currentRound}. Progress: ${scannedCheckpointIds.length}/${totalCheckpoints} checkpoints completed.`
//           )
//         );
//     }

//     const patrol = await Patrol.create({
//       guard: guardId,
//       shift: activeShift._id,
//       patrolPlanId: patrolPlan._id,
//       qrCodeId: qrDoc._id,
//       roundNumber: currentRound,
//       location: { lat: Number(guardLat), lng: Number(guardLng) },
//       distanceMeters: Number(distanceMeters),
//       photo: photoBase64,
//       isVerified: Boolean(isVerified),
//       firstScanAt: now,
//       lastScanAt: now,
//       companyId: companyId,
//       scanCount: 1,
//     });

//     console.log(
//       `✅ Scan recorded: Round ${currentRound}, Checkpoint ${
//         scannedCheckpointIds.length + 1
//       }/${totalCheckpoints}`
//     );

//     const scannedCount = scannedCheckpointIds.length + 1;
//     const isRoundComplete = scannedCount === totalCheckpoints;
//     const progressMessage = isRoundComplete
//       ? `Round ${currentRound} completed! ${
//           currentRound < patrolPlan.rounds
//             ? "Ready for next round."
//             : "All rounds completed for this shift!"
//         }`
//       : `Progress: ${scannedCount}/${totalCheckpoints} checkpoints in round ${currentRound}`;

//     return res.status(201).json(
//       new ApiResponse(true, progressMessage, {
//         patrolId: patrol._id,
//         companyId: patrol?.companyId,
//         qrCodeId: qrDoc._id,
//         siteId: qrDoc.siteId,
//         patrolPlanId: patrolPlan._id,
//         patrolPlanName: patrolPlan.planName,
//         shiftId: activeShift._id,
//         shiftName: activeShift.shiftName,
//         isRecurringShift: activeShift.isRecurring || false,
//         isVerified: Boolean(isVerified),
//         distanceMeters: Number(distanceMeters),
//         timestamp: patrol.createdAt,
//         roundNumber: currentRound,
//         scanCount: 1,
//         progress: {
//           currentRound,
//           totalRounds: patrolPlan.rounds,
//           checkpointsScanned: scannedCount,
//           totalCheckpoints,
//           isRoundComplete,
//           remainingCheckpoints: totalCheckpoints - scannedCount,
//         },
//       })
//     );
//   } catch (err) {
//     console.error("Error in scanQR:", err);
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };
// **************

// exports.scanQR = async (req, res) => {
//   try {
//     const guardId = req.user.id;

//     console.log('***req***', req.user);
//     const companyId =  new mongoose.Types.ObjectId( req.user.companyId);

//     console.log('guardId:', guardId);

//     console.log('scanQR hit', req.user, req.body, req.file);

//     const { qrData, guardLat, guardLng, distanceMeters, isVerified } = req.body;

//     if (
//       !qrData ||
//       guardLat == null ||
//       guardLng == null ||
//       distanceMeters == null ||
//       isVerified == null
//     ) {
//       return res
//         .status(400)
//         .json(new ApiResponse(false, "All fields required"));
//     }

//    const guard = await User.findById(new mongoose.Types.ObjectId(guardId)).populate(
//      "createdBy"
//    );

//    console.log('guard:', guard);

//     if (!guard || guard.role !== "guard") {
//       return res.status(403).json(new ApiResponse(false, "Invalid guard"));
//     }

//     // Handle photo upload
//     let photoBase64 = null;
//     if (req.file) {
//       const full = path.join(uploadDir, req.file.filename);
//       const data = await fs.readFile(full);
//       photoBase64 = data.toString("base64");
//       await fs
//         .unlink(full)
//         .catch((e) => console.warn("unlink failed:", e.message));
//     }

//     const now = new Date();

//     // Find active shift for the guard
//     const activeShift = await Shift.findOne({
//       assignedGuards: guardId,
//       startTime: { $lte: now },
//       endTime: { $gte: now },
//       isActive: true,
//     });

//     if (!activeShift) {
//       return res
//         .status(400)
//         .json(
//           new ApiResponse(
//             false,
//             "No active shift found. You can only scan QR codes during your assigned shift."
//           )
//         );
//     }

//     // Validate QR code
//     let qrDoc = null;
//     if (mongoose.Types.ObjectId.isValid(qrData)) {
//       qrDoc = await QR.findById(qrData);
//     }
//     if (!qrDoc) {
//       return res
//         .status(404)
//         .json(new ApiResponse(false, "Invalid or expired QR"));
//     }

//     // Find the patrol plan that contains this QR and is assigned to this guard
//     let patrolPlan = await PatrolPlan.findOne({
//       "assignedGuards.guardId": guardId,
//       "checkpoints.qrId": qrDoc._id,
//       isActive: true,
//     });

//     if (!patrolPlan) {
//       return res
//         .status(404)
//         .json(
//           new ApiResponse(false, "No active patrol plan assigned with this QR")
//         );
//     }

//     // Check guard assignment to current shift
//     if (activeShift) {
//       const guardAssignment = patrolPlan.assignedGuards.find(
//         (ag) => ag.guardId.toString() === guardId
//       );
//       if (
//         guardAssignment?.assignedShifts?.length &&
//         !guardAssignment.assignedShifts.some(
//           (shiftId) => shiftId.toString() === activeShift._id.toString()
//         )
//       ) {
//         return res
//           .status(403)
//           .json(
//             new ApiResponse(
//               false,
//               "You are not assigned to scan this QR code during current shift"
//             )
//           );
//       }
//     }

//     // --- SHIFT-SPECIFIC ROUND LOGIC ---
//     const totalCheckpoints = patrolPlan.checkpoints.length;

//     // Get all scans for this guard, patrol plan, AND current shift
//     const allScans = await Patrol.find({
//       guard: guardId,
//       patrolPlanId: patrolPlan._id,
//       shift: activeShift._id, // CRITICAL: Only scans from current shift
//     }).sort({ createdAt: 1 });

//     // Determine current round number (shift-specific)
//     let currentRound = 1;
//     let scansInCurrentRound = [];

//     if (allScans.length > 0) {
//       // Group scans by round number stored in DB
//       const scansByRound = {};
//       allScans.forEach((scan) => {
//         const rNum = scan.roundNumber || 1;
//         if (!scansByRound[rNum]) scansByRound[rNum] = [];
//         scansByRound[rNum].push(scan);
//       });

//       // Find the latest incomplete round or start a new one
//       const roundNumbers = Object.keys(scansByRound)
//         .map(Number)
//         .sort((a, b) => a - b);

//       for (const rNum of roundNumbers) {
//         const scansInRound = scansByRound[rNum];
//         if (scansInRound.length < totalCheckpoints) {
//           // This round is incomplete
//           currentRound = rNum;
//           scansInCurrentRound = scansInRound;
//           break;
//         } else if (rNum === roundNumbers[roundNumbers.length - 1]) {
//           // Last round is complete, start new round
//           currentRound = rNum + 1;
//           scansInCurrentRound = [];
//         }
//       }
//     }

//     // Don't allow scanning beyond the total rounds
//     if (currentRound > patrolPlan.rounds) {
//       return res
//         .status(400)
//         .json(
//           new ApiResponse(
//             false,
//             `All ${patrolPlan.rounds} rounds for this patrol plan are completed in this shift`
//           )
//         );
//     }

//     // Get checkpoint IDs already scanned in current round
//     const scannedCheckpointIds = scansInCurrentRound.map((scan) =>
//       scan.qrCodeId.toString()
//     );

//     // Check if current checkpoint already scanned in this round
//     if (scannedCheckpointIds.includes(qrDoc._id.toString())) {
//       return res
//         .status(400)
//         .json(
//           new ApiResponse(
//             false,
//             `You have already scanned this checkpoint in round ${currentRound}. Progress: ${scannedCheckpointIds.length}/${totalCheckpoints} checkpoints completed.`
//           )
//         );
//     }

//     // Optional: Enforce sequence order (uncomment if you want strict sequential scanning)
//     /*
//     const currentCheckpoint = patrolPlan.checkpoints.find(
//       cp => cp.qrId.toString() === qrDoc._id.toString()
//     );

//     if (currentCheckpoint) {
//       const expectedSequence = scannedCheckpointIds.length + 1;
//       if (currentCheckpoint.sequence !== expectedSequence) {
//         const nextCheckpoint = patrolPlan.checkpoints.find(
//           cp => cp.sequence === expectedSequence
//         );
//         return res.status(400).json(
//           new ApiResponse(
//             false,
//             `Please scan checkpoints in sequence. Next checkpoint: ${nextCheckpoint?.siteId || 'unknown'}`
//           )
//         );
//       }
//     }
//     */

//     // Create new patrol record WITH SHIFT ID
//     const patrol = await Patrol.create({
//       guard: guardId,
//       shift: activeShift._id, // CRITICAL: Store shift reference
//       patrolPlanId: patrolPlan._id,
//       qrCodeId: qrDoc._id,
//       roundNumber: currentRound,
//       location: { lat: Number(guardLat), lng: Number(guardLng) },
//       distanceMeters: Number(distanceMeters),
//       photo: photoBase64,
//       isVerified: Boolean(isVerified),
//       firstScanAt: now,
//       lastScanAt: now,
//       companyId: companyId,
//       scanCount: 1,
//     });

//     // Calculate progress
//     const scannedCount = scannedCheckpointIds.length + 1;
//     const isRoundComplete = scannedCount === totalCheckpoints;
//     const progressMessage = isRoundComplete
//       ? `Round ${currentRound} completed! ${
//           currentRound < patrolPlan.rounds
//             ? "Ready for next round."
//             : "All rounds completed for this shift!"
//         }`
//       : `Progress: ${scannedCount}/${totalCheckpoints} checkpoints in round ${currentRound}`;

//     return res.status(201).json(
//       new ApiResponse(true, progressMessage, {
//         patrolId: patrol._id,

//         companyId: patrol?.companyId,
//         qrCodeId: qrDoc._id,
//         siteId: qrDoc.siteId,
//         patrolPlanId: patrolPlan._id,
//         patrolPlanName: patrolPlan.planName,
//         isVerified: Boolean(isVerified),
//         distanceMeters: Number(distanceMeters),
//         timestamp: patrol.createdAt,
//         roundNumber: currentRound,
//         scanCount: 1,
//         progress: {
//           currentRound,
//           totalRounds: patrolPlan.rounds,
//           checkpointsScanned: scannedCount,
//           totalCheckpoints,
//           isRoundComplete,
//           remainingCheckpoints: totalCheckpoints - scannedCount,
//         },
//       })
//     );
//   } catch (err) {
//     console.error("Error in scanQR:", err);
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };

exports.getPatrolLogs = async (req, res) => {
  try {
    const {
      guardId,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sort = "desc",
      patrolPlanId,
      shiftId,
    } = req.body;

    const { ObjectId } = mongoose.Types;
    const match = {};

    console.log("req is ", req.body);

    // Normalize guardId
    let guardObjectId = null;
    if (guardId && mongoose.isValidObjectId(guardId)) {
      guardObjectId = new ObjectId(guardId);
    }

    // Role-based access
    if (req.user.role === "employee") {
      const guards = await User.find({
        role: "guard",
        companyId: req.user.id,
      }).select("_id");
      if (!guards.length) {
        return res
          .status(200)
          .json(
            new ApiResponse(true, "No guards found", { logs: [], page, limit }),
          );
      }
      match.guard = { $in: guards.map((g) => g._id) };

      if (guardObjectId && !guards.some((g) => g._id.equals(guardObjectId))) {
        return res
          .status(403)
          .json(new ApiResponse(false, "No access to this guard's logs"));
      }
      if (guardObjectId) match.guard = guardObjectId;
    } else if (req.user.role === "supervisor") {
      const guards = await User.find({
        role: "guard",
        supervisor: req.user.id,
      }).select("_id");
      if (!guards.length) {
        return res
          .status(200)
          .json(
            new ApiResponse(true, "No guards found", { logs: [], page, limit }),
          );
      }
      match.guard = { $in: guards.map((g) => g._id) };

      if (guardObjectId && !guards.some((g) => g._id.equals(guardObjectId))) {
        return res
          .status(403)
          .json(new ApiResponse(false, "No access to this guard's logs"));
      }
      if (guardObjectId) match.guard = guardObjectId;
    } else if (guardObjectId) {
      match.guard = guardObjectId;
    }

    // FIXED: Date filtering with moment UTC
    // if ((startDate && startDate.trim()) || (endDate && endDate.trim())) {
    //   match.createdAt = {};

    //   if (startDate && startDate.trim()) {
    //     const startMoment = moment.utc(startDate).startOf("day");
    //     match.createdAt.$gte = startMoment.toDate();
    //   console.log("➡️ ➡️Start date filter:", startMoment.local().format('DD MMM YYYY, hh:mm A'));
    //   }

    //   if (endDate && endDate.trim()) {
    //     const endMoment = moment.utc(endDate).endOf("day");
    //     match.createdAt.$lte = endMoment.toDate();
    //     console.log(
    //       "End date filter:",
    //       endMoment.local().format("DD MMM YYYY, hh:mm A")
    //     );
    //   }

    //   // Log the final date filter for debugging
    //   console.log("Final date match:", {
    //     $gte: match.createdAt.$gte?.toISOString(),
    //     $lte: match.createdAt.$lte?.toISOString(),
    //   });
    // }
    // Make sure: const moment = require('moment-timezone');
    // Use timezone from client or default to Asia/Kolkata
    let timezone = (req.body.timezone || "Asia/Kolkata").trim();
    if (!moment.tz.zone(timezone)) {
      console.warn(
        `Invalid timezone "${timezone}" provided. Falling back to UTC.`,
      );
      timezone = "UTC";
    }

    if ((startDate && startDate.trim()) || (endDate && endDate.trim())) {
      match.createdAt = {};

      if (startDate && startDate.trim()) {
        // Interpret startDate as the user's local start-of-day in their timezone
        // Use format 'YYYY-MM-DD' to avoid ambiguous parsing when client sends dates like "2025-11-02"
        const userStart = moment
          .tz(startDate, "YYYY-MM-DD", timezone)
          .startOf("day");
        const startUtc = userStart.clone().utc().toDate();
        match.createdAt.$gte = startUtc;
        console.log(
          "Start (user local startOfDay):",
          userStart.format(),
          "UTC used for query:",
          startUtc.toISOString(),
        );
      }

      if (endDate && endDate.trim()) {
        // Interpret endDate as the user's local end-of-day in their timezone
        const userEnd = moment.tz(endDate, "YYYY-MM-DD", timezone).endOf("day");
        const endUtc = userEnd.clone().utc().toDate();
        match.createdAt.$lte = endUtc;
        console.log(
          "End (user local endOfDay):",
          userEnd.format(),
          "UTC used for query:",
          endUtc.toISOString(),
        );
      }

      console.log("Final date match:", {
        $gte: match.createdAt.$gte?.toISOString(),
        $lte: match.createdAt.$lte?.toISOString(),
      });
    }
    // Plan & Shift filters
    if (patrolPlanId && mongoose.isValidObjectId(patrolPlanId)) {
      match.patrolPlanId = new ObjectId(patrolPlanId);
    }
    if (shiftId && mongoose.isValidObjectId(shiftId)) {
      match.shift = new ObjectId(shiftId);
    }

    // Pagination + sort
    const sortDir = sort === "asc" ? 1 : -1;
    const skip = (page - 1) * limit;

    // Aggregate
    const logs = await Patrol.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "guard",
          foreignField: "_id",
          as: "guardInfo",
          pipeline: [{ $project: { _id: 1, name: 1, email: 1, phone: 1 } }],
        },
      },
      { $unwind: "$guardInfo" },
      {
        $lookup: {
          from: "shifts",
          localField: "shift",
          foreignField: "_id",
          as: "shiftInfo",
          pipeline: [
            {
              $project: {
                _id: 1,
                shiftName: 1,
                startTime: 1,
                endTime: 1,
                shiftType: 1,
              },
            },
          ],
        },
      },
      { $unwind: { path: "$shiftInfo", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "qrs",
          localField: "qrCodeId",
          foreignField: "_id",
          as: "qrInfo",
          pipeline: [
            {
              $project: {
                _id: 1,
                siteId: 1,
                description: 1,
                lat: 1,
                lng: 1,
                companyId: 1,
              },
            },
          ],
        },
      },
      { $unwind: { path: "$qrInfo", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "patrolplans",
          localField: "patrolPlanId",
          foreignField: "_id",
          as: "patrolPlanInfo",
          pipeline: [
            { $project: { _id: 1, planName: 1, description: 1, rounds: 1 } },
          ],
        },
      },
      {
        $unwind: { path: "$patrolPlanInfo", preserveNullAndEmptyArrays: true },
      },
      {
        $project: {
          _id: 1,
          guard: "$guardInfo",
          shift: "$shiftInfo",
          patrolPlan: "$patrolPlanInfo",
          qrCode: "$qrInfo",
          location: 1,
          distanceMeters: 1,
          photo: 1,
          isVerified: 1,
          scanTime: "$createdAt",
          updatedAt: 1,
        },
      },
      { $sort: { scanTime: sortDir } },
      { $skip: skip },
      { $limit: parseInt(limit) },
    ]);

    const totalLogs = await Patrol.countDocuments(match);

    return res.status(200).json(
      new ApiResponse(true, "Patrol logs fetched successfully", {
        logs,
        pagination: {
          total: totalLogs,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalLogs / limit),
        },
      }),
    );
  } catch (err) {
    console.error("Error in getPatrolLogs:", err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// ⬇️ niche wali report chalu h
// exports.getGuardPerformanceReport = async (req, res) => {
//   try {
//     console.log("Generating guard performance report", req.body);

//     const { guardId, startDate, endDate, shiftId } = req.body;

//     if (!guardId)
//       return res.status(400).json(new ApiResponse(false, "Guard ID required"));

//     // Access control
//     let guard;
//     if (req.user.role === "employee") {
//       guard = await User.findOne({
//         _id: guardId,
//         role: "guard",
//         companyId: req.user.id,
//       });
//     } else if (req.user.role === "supervisor") {
//       guard = await User.findOne({
//         _id: guardId,
//         role: "guard",
//         supervisor: req.user.id,
//       });
//     }
//     if (!guard)
//       return res
//         .status(403)
//         .json(new ApiResponse(false, "No access to this guard"));

//     // Date range with moment.js
//     let start, end;
//     if (startDate) {
//       start = moment.utc(startDate).startOf("day").toDate();
//       if (endDate) {
//         end = moment.utc(endDate).endOf("day").toDate();
//       } else {
//         end = moment.utc(startDate).endOf("day").toDate();
//       }
//     } else if (endDate) {
//       end = moment.utc(endDate).endOf("day").toDate();
//       start = moment.utc(endDate).startOf("day").toDate();
//     } else {
//       end = moment.utc().endOf("day").toDate();
//       start = moment.utc().subtract(30, "days").startOf("day").toDate();
//     }

//     console.log(
//       `📊 Generating detailed report for guard ${guardId} from ${start} to ${end}`
//     );

//     const totalDays = moment(end).diff(moment(start), "days") + 1;

//     // Build query for patrol scans
//     const scanQuery = {
//       guard: guardId,
//       createdAt: { $gte: start, $lte: end },
//     };

//     if (shiftId) {
//       scanQuery.shift = shiftId;
//     }

//     // 1. GET ALL PATROL SCANS
//     const patrolScans = await Patrol.find(scanQuery)
//       .populate("patrolPlanId", "planName rounds")
//       .populate("qrCodeId", "siteId description")
//       .populate("shift", "shiftName")
//       .sort({ createdAt: -1 });

//     console.log(`Found ${patrolScans.length} patrol scans`);

//     // 2. GET PATROL PLANS
//     const patrolPlanIds = [
//       ...new Set(
//         patrolScans.map((scan) => scan.patrolPlanId?._id).filter(Boolean)
//       ),
//     ];

//     const patrolPlans = await PatrolPlan.find({
//       _id: { $in: patrolPlanIds },
//     }).populate("checkpoints.qrId", "siteId description");

//     // 3. INITIALIZE TRACKING
//     const roundsData = {};
//     let totalCompletedRounds = 0;
//     let totalExpectedRounds = 0;
//     let totalCompletedScans = 0;
//     let totalExpectedScans = 0;

//     // Calculate expected values
//     patrolPlans.forEach((plan) => {
//       const planId = plan._id.toString();
//       const planRounds = plan.rounds || 1;
//       const planCheckpoints = plan.checkpoints.length;

//       totalExpectedRounds += planRounds;
//       totalExpectedScans += planRounds * planCheckpoints;

//       roundsData[planId] = {
//         planName: plan.planName,
//         totalRounds: planRounds,
//         totalCheckpoints: planCheckpoints,
//         completedRounds: 0,
//         completedScans: 0,
//         rounds: {},
//       };
//     });

//     // 4. GROUP SCANS BY PLAN AND ROUND - FIXED DUPLICATE DETECTION
//     patrolScans.forEach((scan) => {
//       const planId = scan.patrolPlanId?._id?.toString();
//       const roundNumber = scan.roundNumber || 1;
//       const qrCodeId = scan.qrCodeId?._id?.toString(); // FIXED: Get ID as string

//       if (!planId || !roundsData[planId] || !qrCodeId) return;

//       const roundKey = `round_${roundNumber}`;

//       // Initialize round if not exists
//       if (!roundsData[planId].rounds[roundKey]) {
//         roundsData[planId].rounds[roundKey] = {
//           roundNumber: roundNumber,
//           scans: [],
//           scannedQRIds: new Set(), // FIXED: Track scanned QR IDs using Set
//           completedCheckpoints: 0,
//           isComplete: false,
//         };
//       }

//       const roundData = roundsData[planId].rounds[roundKey];

//       // FIXED: Check if this QR was already scanned in this round
//       if (!roundData.scannedQRIds.has(qrCodeId)) {
//         // Add to scanned set
//         roundData.scannedQRIds.add(qrCodeId);

//         // Add scan details
//         roundData.scans.push({
//           scanId: scan._id,
//           qrCodeId: qrCodeId,
//           siteId: scan.qrCodeId?.siteId,
//           checkpointName: scan.qrCodeId?.siteId,
//           checkpointDescription: scan.qrCodeId?.description,
//           actualTime: scan.createdAt,
//           distanceMeters: scan.distanceMeters,
//           isVerified: scan.isVerified,
//         });

//         roundData.completedCheckpoints++;

//         // Check if round is complete
//         if (
//           roundData.completedCheckpoints >= roundsData[planId].totalCheckpoints
//         ) {
//           if (!roundData.isComplete) {
//             roundData.isComplete = true;
//             roundsData[planId].completedRounds++;
//             totalCompletedRounds++;
//           }
//         }

//         roundsData[planId].completedScans++;
//         totalCompletedScans++;

//         console.log(
//           `✅ Added scan: Plan ${roundsData[planId].planName}, Round ${roundNumber}, QR ${scan.qrCodeId?.siteId}, Total: ${roundData.completedCheckpoints}/${roundsData[planId].totalCheckpoints}`
//         );
//       } else {
//         console.log(
//           `⚠️ Duplicate scan detected: Plan ${roundsData[planId].planName}, Round ${roundNumber}, QR ${scan.qrCodeId?.siteId}`
//         );
//       }
//     });

//     // 5. CREATE DETAILED ROUNDS DATA FOR TABLE
//     const detailedRoundsData = [];

//     Object.entries(roundsData).forEach(([planId, planData]) => {
//       const patrolPlan = patrolPlans.find((p) => p._id.toString() === planId);

//       Object.values(planData.rounds).forEach((round) => {
//         // Add completed scans
//         round.scans.forEach((scan) => {
//           detailedRoundsData.push({
//             date: moment(scan.actualTime).format("YYYY-MM-DD"),
//             roundNumber: round.roundNumber,
//             planName: planData.planName,
//             checkpointName: scan.checkpointName,
//             checkpointDescription: scan.checkpointDescription,
//             actualTime: scan.actualTime,
//             status: "completed",
//             scanId: scan.scanId,
//             distanceMeters: scan.distanceMeters,
//             isVerified: scan.isVerified,
//           });
//         });

//         // Add missed checkpoints
//         if (!round.isComplete && patrolPlan) {
//           patrolPlan.checkpoints.forEach((checkpoint) => {
//             const checkpointId = checkpoint.qrId._id.toString();

//             // FIXED: Check using Set
//             if (!round.scannedQRIds.has(checkpointId)) {
//               detailedRoundsData.push({
//                 date: round.scans[0]
//                   ? moment(round.scans[0].actualTime).format("YYYY-MM-DD")
//                   : moment().format("YYYY-MM-DD"),
//                 roundNumber: round.roundNumber,
//                 planName: planData.planName,
//                 checkpointName: checkpoint.qrId.siteId,
//                 checkpointDescription: checkpoint.qrId.description,
//                 actualTime: null,
//                 status: "missed",
//                 scanId: null,
//               });
//             }
//           });
//         }
//       });
//     });

//     // Sort detailed data
//     detailedRoundsData.sort((a, b) => {
//       if (a.date === b.date) {
//         if (a.roundNumber === b.roundNumber) {
//           return a.checkpointName.localeCompare(b.checkpointName);
//         }
//         return a.roundNumber - b.roundNumber;
//       }
//       return new Date(b.date) - new Date(a.date);
//     });

//     // 6. CALCULATE PERFORMANCE METRICS
//     const missedRounds = totalExpectedRounds - totalCompletedRounds;
//     const missedScans = totalExpectedScans - totalCompletedScans;

//     const roundsCompletionRate =
//       totalExpectedRounds > 0
//         ? (totalCompletedRounds / totalExpectedRounds) * 100
//         : 0;

//     const scanCompletionRate =
//       totalExpectedScans > 0
//         ? (totalCompletedScans / totalExpectedScans) * 100
//         : 0;

//     console.log(
//       `📊 Final Stats: ${totalCompletedScans}/${totalExpectedScans} scans, ${totalCompletedRounds}/${totalExpectedRounds} rounds`
//     );

//     // 7. GET ATTENDANCE DATA (optional)
//     const attendanceRecords = await Attendance.find({
//       guard: guardId,
//       date: { $gte: start, $lte: end },
//     });

//     const attendanceTotalDays = attendanceRecords.length;
//     const presentDays = attendanceRecords.filter(
//       (record) =>
//         record.status === "present" ||
//         record.status === "on-duty" ||
//         record.status === "late"
//     ).length;

//     const attendanceRate =
//       attendanceTotalDays > 0 ? (presentDays / attendanceTotalDays) * 100 : 0;

//     const overallPerformance = roundsCompletionRate;

//     return res.status(200).json(
//       new ApiResponse(true, "Guard performance report generated", {
//         guard: {
//           _id: guard._id,
//           name: guard.name,
//           phone: guard.phone,
//         },

//         reportPeriod: {
//           startDate: start,
//           endDate: end,
//           totalDays: totalDays,
//         },

//         roundsPerformance: {
//           summary: {
//             totalExpectedRounds: totalExpectedRounds,
//             totalCompletedRounds: totalCompletedRounds,
//             totalMissedRounds: missedRounds,
//             totalExpectedScans: totalExpectedScans,
//             totalCompletedScans: totalCompletedScans,
//             totalMissedScans: missedScans,
//             roundsCompletionRate: roundsCompletionRate.toFixed(1) + "%",
//             scanCompletionRate: scanCompletionRate.toFixed(1) + "%",
//           },
//           planBreakdown: Object.values(roundsData).map((plan) => ({
//             planName: plan.planName,
//             totalRounds: plan.totalRounds,
//             completedRounds: plan.completedRounds,
//             totalCheckpoints: plan.totalCheckpoints,
//             completedScans: plan.completedScans,
//             completionRate:
//               ((plan.completedRounds / plan.totalRounds) * 100).toFixed(1) +
//               "%",
//           })),
//         },

//         detailedRounds: detailedRoundsData,

//         performance: {
//           overallScore: overallPerformance.toFixed(1),
//           rating: getPerformanceRating(overallPerformance),
//           breakdown: {
//             roundsCompletionRate: roundsCompletionRate.toFixed(1),
//             scanCompletionRate: scanCompletionRate.toFixed(1),
//           },
//         },

//         summary: {
//           progress: `${totalCompletedRounds}/${totalExpectedRounds} rounds completed`,
//           efficiency: roundsCompletionRate.toFixed(1) + "%",
//           status: overallPerformance >= 70 ? "Good" : "Needs Improvement",
//         },
//       })
//     );
//   } catch (err) {
//     console.error("❌ Error in getGuardPerformanceReport:", err);
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };

// function getPerformanceRating(score) {
//   const numericScore = parseFloat(score) || 0;
//   if (numericScore >= 90) return "Excellent";
//   if (numericScore >= 80) return "Good";
//   if (numericScore >= 70) return "Satisfactory";
//   if (numericScore >= 60) return "Needs Improvement";
//   return "Poor";
// }

// exports.getGuardPerformanceReport = async (req, res) => {
//   try {
//     console.log("Generating guard performance report", req.body);

//     const { guardId, startDate, endDate, shiftId } = req.body;

//     if (!guardId)
//       return res.status(400).json(new ApiResponse(false, "Guard ID required"));

//     // Access control
//     let guard;
//     if (req.user.role === "employee") {
//       guard = await User.findOne({
//         _id: guardId,
//         role: "guard",
//         companyId: req.user.id,
//       });
//     } else if (req.user.role === "supervisor") {
//       guard = await User.findOne({
//         _id: guardId,
//         role: "guard",
//         supervisor: req.user.id,
//       });
//     }
//     if (!guard)
//       return res
//         .status(403)
//         .json(new ApiResponse(false, "No access to this guard"));

//     // Date range with moment.js - FIXED for partial dates
//     let start, end;
//     if (startDate) {
//       // If only start date is provided
//       // start = moment(startDate).startOf("day").toDate();
//         start = moment.utc(startDate).startOf("day").toDate();

//       if (endDate) {
//         // Both start and end dates provided
//         // end = moment(endDate).endOf("day").toDate();
//         end = moment(endDate).endOf("day").toDate();
//       } else {
//         // Only start date provided - set end date to same day
//         // end = moment.utc(startDate).endOf("day").toDate();
//             end = moment.utc(startDate).endOf("day").toDate();
//       }
//     } else if (endDate) {
//       // Only end date provided
//       // end = moment(endDate).endOf("day").toDate();
//       // start = moment(endDate).startOf("day").toDate(); // Set start to same day

//         end = moment.utc(endDate).endOf("day").toDate();
//         start = moment.utc(endDate).startOf("day").toDate();
//     } else {
//       // No dates provided - default to last 30 days
//       // end = moment().endOf("day").toDate();
//       // start = moment().subtract(30, "days").startOf("day").toDate();

//         end = moment.utc().endOf("day").toDate();
//         start = moment.utc().subtract(30, "days").startOf("day").toDate();
//     }

//     console.log(
//       `📊 Generating detailed report for guard ${guardId} from ${start} to ${end}`
//     );
//     console.log(`Frontend dates - start: ${startDate}, end: ${endDate}`);
//     console.log(`Processed dates - start: ${start}, end: ${end}`);

//     // Calculate total days correctly
//     const totalDays = moment(end).diff(moment(start), "days") + 1;

//     // Build query for patrol scans
//     const scanQuery = {
//       guard: guardId,
//       createdAt: { $gte: start, $lte: end },
//     };

//     // Add shift filter if provided
//     if (shiftId) {
//       scanQuery.shift = shiftId;
//     }

//     // 1. GET ALL PATROL SCANS WITH DETAILED INFORMATION
//     const patrolScans = await Patrol.find(scanQuery)
//       .populate("patrolPlanId", "planName rounds")
//       .populate("qrCodeId", "siteId description")
//       .populate("shift", "shiftName")
//       .sort({ createdAt: -1 });

//     console.log(`Found ${patrolScans.length} patrol scans`);

//     // 2. GET PATROL PLANS TO GET TOTAL ROUNDS INFORMATION
//     const patrolPlanIds = [
//       ...new Set(
//         patrolScans.map((scan) => scan.patrolPlanId?._id).filter(Boolean)
//       ),
//     ];

//     const patrolPlans = await PatrolPlan.find({
//       _id: { $in: patrolPlanIds },
//     }).populate("checkpoints.qrId", "siteId description");

//     // 3. SIMPLE ANALYSIS BASED ON ACTUAL SCAN DATA
//     const roundsData = {};
//     let totalCompletedRounds = 0;
//     let totalExpectedRounds = 0;
//     let totalCompletedScans = 0;
//     let totalExpectedScans = 0;

//     // Calculate based on patrol plans
//     patrolPlans.forEach((plan) => {
//       const planId = plan._id.toString();
//       const planRounds = plan.rounds || 1;
//       const planCheckpoints = plan.checkpoints.length;

//       totalExpectedRounds += planRounds;
//       totalExpectedScans += planRounds * planCheckpoints;

//       // Initialize rounds data for this plan
//       roundsData[planId] = {
//         planName: plan.planName,
//         totalRounds: planRounds,
//         totalCheckpoints: planCheckpoints,
//         completedRounds: 0,
//         completedScans: 0,
//         rounds: {},
//       };
//     });

//     // Group scans by plan and round number
//     patrolScans.forEach((scan) => {
//       const planId = scan.patrolPlanId?._id?.toString();
//       const roundNumber = scan.roundNumber || 1;

//       if (!planId || !roundsData[planId]) return;

//       const roundKey = `round_${roundNumber}`;

//       if (!roundsData[planId].rounds[roundKey]) {
//         roundsData[planId].rounds[roundKey] = {
//           roundNumber: roundNumber,
//           scans: [],
//           completedCheckpoints: 0,
//           isComplete: false,
//         };
//       }

//       // Add scan if not already recorded for this checkpoint
//       const existingScan = roundsData[planId].rounds[roundKey].scans.find(
//         (s) => s.qrCodeId?.toString() === scan.qrCodeId?._id?.toString()
//       );

//       if (!existingScan) {
//         roundsData[planId].rounds[roundKey].scans.push({
//           scanId: scan._id,
//           siteId: scan.qrCodeId?.siteId,
//           checkpointName: scan.qrCodeId?.siteId,
//           checkpointDescription: scan.qrCodeId?.description,
//           actualTime: scan.createdAt,
//           distanceMeters: scan.distanceMeters,
//           isVerified: scan.isVerified,
//         });

//         roundsData[planId].rounds[roundKey].completedCheckpoints++;

//         // Check if round is complete
//         const totalCheckpoints = roundsData[planId].totalCheckpoints;
//         if (
//           roundsData[planId].rounds[roundKey].completedCheckpoints >=
//           totalCheckpoints
//         ) {
//           roundsData[planId].rounds[roundKey].isComplete = true;
//           roundsData[planId].completedRounds++;
//           totalCompletedRounds++;
//         }

//         roundsData[planId].completedScans++;
//         totalCompletedScans++;
//       }
//     });

//     // 4. CREATE DETAILED ROUNDS DATA FOR TABLE
//     const detailedRoundsData = [];

//     Object.values(roundsData).forEach((planData) => {
//       Object.values(planData.rounds).forEach((round) => {
//         round.scans.forEach((scan) => {
//           detailedRoundsData.push({
//             date: moment(scan.actualTime).format("YYYY-MM-DD"),
//             roundNumber: round.roundNumber,
//             planName: planData.planName,
//             checkpointName: scan.checkpointName,
//             checkpointDescription: scan.checkpointDescription,
//             actualTime: scan.actualTime,
//             status: "completed",
//             scanId: scan.scanId,
//             distanceMeters: scan.distanceMeters,
//             isVerified: scan.isVerified,
//           });
//         });

//         // Add missed checkpoints for incomplete rounds
//         if (!round.isComplete) {
//           const scannedSiteIds = round.scans.map((s) => s.siteId);
//           const patrolPlan = patrolPlans.find(
//             (p) =>
//               p._id.toString() ===
//               Object.keys(roundsData).find(
//                 (key) => roundsData[key].planName === planData.planName
//               )
//           );

//           if (patrolPlan) {
//             patrolPlan.checkpoints.forEach((checkpoint) => {
//               const siteId = checkpoint.qrId.siteId;
//               if (!scannedSiteIds.includes(siteId)) {
//                 detailedRoundsData.push({
//                   date: round.scans[0]
//                     ? moment(round.scans[0].actualTime).format("YYYY-MM-DD")
//                     : moment().format("YYYY-MM-DD"),
//                   roundNumber: round.roundNumber,
//                   planName: planData.planName,
//                   checkpointName: siteId,
//                   checkpointDescription: checkpoint.qrId.description,
//                   actualTime: null,
//                   status: "missed",
//                   scanId: null,
//                 });
//               }
//             });
//           }
//         }
//       });
//     });

//     // Sort detailed data
//     detailedRoundsData.sort((a, b) => {
//       if (a.date === b.date) {
//         if (a.roundNumber === b.roundNumber) {
//           return a.checkpointName.localeCompare(b.checkpointName);
//         }
//         return a.roundNumber - b.roundNumber;
//       }
//       return new Date(b.date) - new Date(a.date);
//     });

//     // 5. CALCULATE PERFORMANCE METRICS - SIMPLE AND ACCURATE
//     const missedRounds = totalExpectedRounds - totalCompletedRounds;
//     const missedScans = totalExpectedScans - totalCompletedScans;

//     const roundsCompletionRate =
//       totalExpectedRounds > 0
//         ? (totalCompletedRounds / totalExpectedRounds) * 100
//         : 0;

//     const scanCompletionRate =
//       totalExpectedScans > 0
//         ? (totalCompletedScans / totalExpectedScans) * 100
//         : 0;

//     // 6. GET ATTENDANCE DATA (optional)
//     const attendanceRecords = await Attendance.find({
//       guard: guardId,
//       date: { $gte: start, $lte: end },
//     });

//     const attendanceTotalDays = attendanceRecords.length;
//     const presentDays = attendanceRecords.filter(
//       (record) =>
//         record.status === "present" ||
//         record.status === "on-duty" ||
//         record.status === "late"
//     ).length;

//     const attendanceRate =
//       attendanceTotalDays > 0 ? (presentDays / attendanceTotalDays) * 100 : 0;

//     // Overall performance (focus on rounds completion)
//     const overallPerformance = roundsCompletionRate;

//     return res.status(200).json(
//       new ApiResponse(true, "Guard performance report generated", {
//         // Basic Info
//         guard: {
//           _id: guard._id,
//           name: guard.name,
//           phone: guard.phone,
//         },

//         // Report Period - FIXED with correct totalDays
//         reportPeriod: {
//           startDate: start,
//           endDate: end,
//           totalDays: totalDays, // Now correctly calculated
//         },

//         // Rounds Performance Summary - SIMPLE AND ACCURATE
//         roundsPerformance: {
//           summary: {
//             totalExpectedRounds: totalExpectedRounds,
//             totalCompletedRounds: totalCompletedRounds,
//             totalMissedRounds: missedRounds,
//             totalExpectedScans: totalExpectedScans,
//             totalCompletedScans: totalCompletedScans,
//             totalMissedScans: missedScans,
//             roundsCompletionRate: roundsCompletionRate.toFixed(1) + "%",
//             scanCompletionRate: scanCompletionRate.toFixed(1) + "%",
//           },
//           planBreakdown: Object.values(roundsData).map((plan) => ({
//             planName: plan.planName,
//             totalRounds: plan.totalRounds,
//             completedRounds: plan.completedRounds,
//             totalCheckpoints: plan.totalCheckpoints,
//             completedScans: plan.completedScans,
//             completionRate:
//               ((plan.completedRounds / plan.totalRounds) * 100).toFixed(1) +
//               "%",
//           })),
//         },

//         // Detailed Rounds Data
//         detailedRounds: detailedRoundsData,

//         // Overall Performance
//         performance: {
//           overallScore: overallPerformance.toFixed(1),
//           rating: getPerformanceRating(overallPerformance),
//           breakdown: {
//             roundsCompletionRate: roundsCompletionRate.toFixed(1),
//             scanCompletionRate: scanCompletionRate.toFixed(1),
//           },
//         },

//         // Simple Summary
//         summary: {
//           progress: `${totalCompletedRounds}/${totalExpectedRounds} rounds completed`,
//           efficiency: roundsCompletionRate.toFixed(1) + "%",
//           status: overallPerformance >= 70 ? "Good" : "Needs Improvement",
//         },
//       })
//     );
//   } catch (err) {
//     console.error("❌ Error in getGuardPerformanceReport:", err);
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };

// // Helper function for performance rating
// function getPerformanceRating(score) {
//   const numericScore = parseFloat(score) || 0;
//   if (numericScore >= 90) return "Excellent";
//   if (numericScore >= 80) return "Good";
//   if (numericScore >= 70) return "Satisfactory";
//   if (numericScore >= 60) return "Needs Improvement";
//   return "Poor";
// }

exports.getPatrolSummary = async (req, res) => {
  try {
    const match = {};

    // Agar employee hai toh sirf apne guards ka data
    if (req.user.role === "employee") {
      const guards = await User.find({
        createdBy: req.user.id,
        role: "guard",
      }).select("_id");
      const guardIds = guards.map((g) =>
        mongoose.Types.ObjectId.isValid(g._id)
          ? new mongoose.Types.ObjectId(g._id)
          : g._id,
      );
      match.guard = { $in: guardIds };
    }

    const summary = await Patrol.aggregate([
      { $match: match }, // ✅ pehle filter lagao
      {
        $group: {
          _id: { guard: "$guard", qr: "$qrCodeId" },
          count: { $sum: 1 },
          firstScan: { $min: "$createdAt" },
          lastScan: { $max: "$createdAt" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id.guard",
          foreignField: "_id",
          as: "guardInfo",
        },
      },
      { $unwind: "$guardInfo" },
      {
        $project: {
          guardId: "$_id.guard",
          guardName: "$guardInfo.name",
          qrCodeId: "$_id.qr",
          count: 1,
          firstScan: 1,
          lastScan: 1,
        },
      },
      { $sort: { lastScan: -1 } },
    ]);

    return res
      .status(200)
      .json(new ApiResponse(true, "Patrol summary", { summary }));
  } catch (err) {
    console.error(err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

exports.getGuardDashboard = async (req, res) => {
  try {
    const guardId = req.user.id;

    const guardObjectId = new mongoose.Types.ObjectId(guardId);

    const now = new Date();

    // Find current shift where guard is assigned
    const currentShift = await Shift.findOne({
      assignedGuards: guardObjectId,
      startTime: { $lte: now },
      endTime: { $gte: now },
      isActive: true,
    });

    // Today's patrols
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayPatrols = await Patrol.find({
      guard: guardId,
      createdAt: { $gte: today, $lt: tomorrow },
    }).populate("qrCodeId", "siteId description");

    // Assigned patrol plans
    const assignedPlans = await PatrolPlan.find({
      assignedGuards: guardObjectId,
      isActive: true,
    }).populate("checkpoints.qrId", "siteId description lat lng qrImageBase64");

    // Recent incidents reported
    const recentIncidents = await Incident.find({
      reportedBy: guardId,
    })
      .sort({ createdAt: -1 })
      .limit(5);

    // Calculate completion statistics
    const totalAssignedCheckpoints = assignedPlans.reduce((total, plan) => {
      return total + plan.checkpoints.length;
    }, 0);

    const completedCheckpoints = await Patrol.countDocuments({
      guard: guardId,
      isVerified: true,
      createdAt: { $gte: today, $lt: tomorrow },
    });

    const dashboardData = {
      currentShift: currentShift || null,
      todayStats: {
        patrols: todayPatrols.length,
        completedCheckpoints,
        totalAssignedCheckpoints,
        completionRate:
          totalAssignedCheckpoints > 0
            ? Math.round(
                (completedCheckpoints / totalAssignedCheckpoints) * 100,
              )
            : 0,
      },
      assignedPlans,
      recentIncidents,
      todayPatrols,
    };

    // Return success even if no active shift
    if (!currentShift) {
      return res
        .status(200)
        .json(new ApiResponse(false, "No active shift found", dashboardData));
    }

    return res
      .status(200)
      .json(new ApiResponse(true, "Guard dashboard", dashboardData));
  } catch (err) {
    console.error("Error in getGuardDashboard:", err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// exports.getShiftQRCodes = async (req, res) => {
//   try {
//     const guardId = new mongoose.Types.ObjectId(req.user.id);
//     const now = moment().utc(); // Use moment.js for consistent time handling

//     console.log("Guard ID:", guardId);
//     console.log("Now (UTC):", now.format());

//     // Find current active shift where guard is assigned
//     const currentShift = await Shift.findOne({
//       assignedGuards: guardId,
//       startTime: { $lte: now.toDate() }, // FIXED: Moved inside query object
//       endTime: { $gte: now.toDate() }, // FIXED: Moved inside query object
//     }).sort({ startTime: 1 });

//     if (!currentShift) {
//       return res
//         .status(404)
//         .json(
//           new ApiResponse(
//             false,
//             "No active shift found for your account at this time. Please check your schedule or contact your supervisor if you believe this is an error.",
//             null
//           )
//         );
//     }

//     console.log("Found shift:", {
//       shiftName: currentShift.shiftName,
//       startTime: currentShift.startTime,
//       endTime: currentShift.endTime,
//       isActive: currentShift.isActive,
//     });

//     // Get patrol plans assigned to this guard for current shift
//     const patrolPlans = await PatrolPlan.find({
//       "assignedGuards.guardId": guardId,
//       "assignedGuards.assignedShifts": currentShift._id,
//       isActive: true,
//       // Additional check: ensure plan is active during current time
//       $or: [{ startDate: { $lte: now.toDate() } }, { startDate: null }],
//       $and: [{ $or: [{ endDate: { $gte: now.toDate() } }, { endDate: null }] }], // FIXED: Duplicate $or
//     }).populate("checkpoints.qrId");

//     const qrCodes = [];

//     for (const plan of patrolPlans) {
//       // Additional time-based plan validation
//       const planStart = plan.startDate ? moment.utc(plan.startDate) : null;
//       const planEnd = plan.endDate ? moment.utc(plan.endDate) : null;

//       // Skip if plan has date restrictions and current time is outside them
//       if (planStart && now.isBefore(planStart)) {
//         continue;
//       }
//       if (planEnd && now.isAfter(planEnd)) {
//         continue;
//       }

//       // Get current round for this guard, plan, AND current shift
//       const currentRound = await getCurrentRound(
//         guardId,
//         plan._id,
//         currentShift._id
//       );

//       // CHANGED: Check if all rounds completed but DON'T skip - still send data to frontend
//       const allRoundsCompleted = currentRound > plan.rounds;

//       // Get all scans in current round for this plan AND shift
//       const currentRoundScans = await Patrol.find({
//         guard: guardId,
//         patrolPlanId: plan._id,
//         shift: currentShift._id, // CRITICAL: Only scans from current shift
//         roundNumber: allRoundsCompleted ? plan.rounds : currentRound, // Use last round if completed
//       });

//       const scannedQRIds = currentRoundScans.map((scan) =>
//         scan.qrCodeId.toString()
//       );

//       for (const checkpoint of plan.checkpoints) {
//         if (checkpoint.qrId) {
//           const isThisQRScanned = scannedQRIds.includes(
//             checkpoint.qrId._id.toString()
//           );

//           qrCodes.push({
//             ...checkpoint.qrId.toObject(),
//             planName: plan.planName,
//             patrolPlanId: plan._id, // NEW: Added plan ID

//             // Core tracking fields
//             isCompleted: isThisQRScanned,
//             currentRound: allRoundsCompleted ? plan.rounds : currentRound,
//             totalRounds: plan.rounds,

//             // NEW: Critical field for frontend to disable scanning
//             allRoundsCompleted: allRoundsCompleted,

//             // NEW: Additional progress info
//             checkpointsScanned: scannedQRIds.length,
//             totalCheckpoints: plan.checkpoints.length,
//             isRoundComplete: scannedQRIds.length === plan.checkpoints.length,

//             // Keep existing fields
//             progress: `${scannedQRIds.length}/${plan.checkpoints.length}`,
//             expectedTime: checkpoint.expectedTime,
//             sequence: checkpoint.sequence, // NEW: Added sequence
//           });
//         }
//       }
//     }

//     // No QR codes assigned for this shift
//     if (qrCodes.length === 0) {
//       return res.status(200).json(
//         new ApiResponse(
//           true,
//           "No checkpoints assigned for your current shift. Please check with your supervisor.",
//           {
//             shift: {
//               ...currentShift.toObject(),
//               currentTime: now.format(),
//               timezone: "UTC",
//             },
//             qrCodes: [],
//           }
//         )
//       );
//     }

//     // Success
//     return res.status(200).json(
//       new ApiResponse(true, "QR codes for current shift", {
//         shift: {
//           ...currentShift.toObject(),
//           currentTime: now.format(),
//           timezone: "UTC",
//         },
//         qrCodes,
//       })
//     );
//   } catch (err) {
//     console.error("Error in getShiftQRCodes:", err);
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };

// Keep your existing getCurrentRound function unchanged

// ***************************************************************below is working

// **********************************************
// exports.getShiftQRCodes = async (req, res) => {
//   try {
//     const guardId = new mongoose.Types.ObjectId(req.user.id);

//     // Use current time in guard's local timezone (Asia/Kolkata) instead of UTC
//     const now = moment(); // Local time
//     console.log("Guard ID:", guardId);
//     console.log("Now (Local):", now.format());
//     console.log("Now (UTC):", now.clone().utc().format());

//     // Find current active shift where guard is assigned
//     // Use the same logic as findActiveShiftForGuard for consistency
//     const currentShift = await findActiveShiftForGuard(
//       guardId.toString(),
//       now.toDate()
//     );

//     if (!currentShift) {
//       return res
//         .status(404)
//         .json(
//           new ApiResponse(
//             false,
//             "No active shift found for your account at this time. Please check your schedule or contact your supervisor if you believe this is an error.",
//             null
//           )
//         );
//     }

//     console.log("Found active shift:", {
//       shiftName: currentShift.shiftName,
//       startTime: currentShift.startTime,
//       endTime: currentShift.endTime,
//       isActive: currentShift.isActive,
//       isRecurring: currentShift.isRecurring || false,
//       timezone: currentShift.timezone,
//     });

//     // Get patrol plans assigned to this guard for current shift
//     const patrolPlans = await PatrolPlan.find({
//       "assignedGuards.guardId": guardId,
//       "assignedGuards.assignedShifts": currentShift._id,
//       isActive: true,
//     }).populate("checkpoints.qrId");

//     const qrCodes = [];

//     for (const plan of patrolPlans) {
//       // Additional time-based plan validation using local time
//       const planStart = plan.startDate ? moment(plan.startDate) : null;
//       const planEnd = plan.endDate ? moment(plan.endDate) : null;

//       // Skip if plan has date restrictions and current time is outside them
//       if (planStart && now.isBefore(planStart)) {
//         continue;
//       }
//       if (planEnd && now.isAfter(planEnd)) {
//         continue;
//       }

//       // Get current round for this guard, plan, AND current shift
//       const currentRound = await getCurrentRound(
//         guardId,
//         plan._id,
//         currentShift._id
//       );

//       // Check if all rounds completed but DON'T skip - still send data to frontend
//       const allRoundsCompleted = currentRound > plan.rounds;

//       // Get all scans in current round for this plan AND shift
//       const currentRoundScans = await Patrol.find({
//         guard: guardId,
//         patrolPlanId: plan._id,
//         shift: currentShift._id, // CRITICAL: Only scans from current shift
//         roundNumber: allRoundsCompleted ? plan.rounds : currentRound, // Use last round if completed
//       });

//       const scannedQRIds = currentRoundScans.map((scan) =>
//         scan.qrCodeId.toString()
//       );

//       for (const checkpoint of plan.checkpoints) {
//         if (checkpoint.qrId) {
//           const isThisQRScanned = scannedQRIds.includes(
//             checkpoint.qrId._id.toString()
//           );

//           qrCodes.push({
//             ...checkpoint.qrId.toObject(),
//             planName: plan.planName,
//             patrolPlanId: plan._id,

//             // Core tracking fields
//             isCompleted: isThisQRScanned,
//             currentRound: allRoundsCompleted ? plan.rounds : currentRound,
//             totalRounds: plan.rounds,

//             // Critical field for frontend to disable scanning
//             allRoundsCompleted: allRoundsCompleted,

//             // Additional progress info
//             checkpointsScanned: scannedQRIds.length,
//             totalCheckpoints: plan.checkpoints.length,
//             isRoundComplete: scannedQRIds.length === plan.checkpoints.length,

//             // Keep existing fields
//             progress: `${scannedQRIds.length}/${plan.checkpoints.length}`,
//             expectedTime: checkpoint.expectedTime,
//             sequence: checkpoint.sequence,
//           });
//         }
//       }
//     }

//     // No QR codes assigned for this shift
//     if (qrCodes.length === 0) {
//       return res.status(200).json(
//         new ApiResponse(
//           true,
//           "No checkpoints assigned for your current shift. Please check with your supervisor.",
//           {
//             shift: {
//               ...currentShift.toObject(),
//               currentTime: now.format(),
//               timezone: currentShift.timezone || "Asia/Kolkata",
//             },
//             qrCodes: [],
//           }
//         )
//       );
//     }

//     // Success
//     return res.status(200).json(
//       new ApiResponse(true, "QR codes for current shift", {
//         shift: {
//           ...currentShift,
//           currentTime: now.format(),
//           timezone: currentShift.timezone || "Asia/Kolkata",
//         },
//         qrCodes,
//       })
//     );
//   } catch (err) {
//     console.error("Error in getShiftQRCodes:", err);
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };

// async function getCurrentRound(guardId, patrolPlanId, shiftId) {
//   const plan = await PatrolPlan.findById(patrolPlanId);
//   const totalCheckpoints = plan.checkpoints.length;

//   // Get all scans for this guard, plan, AND specific shift
//   const allScans = await Patrol.find({
//     guard: guardId,
//     patrolPlanId: patrolPlanId,
//     shift: shiftId, // CRITICAL: Only consider scans from this shift
//   }).sort({ createdAt: 1 });

//   if (allScans.length === 0) {
//     return 1; // Start with round 1 if no scans in this shift
//   }

//   // Group scans by round number
//   const scansByRound = {};
//   allScans.forEach((scan) => {
//     const roundNum = scan.roundNumber || 1;
//     if (!scansByRound[roundNum]) scansByRound[roundNum] = [];
//     scansByRound[roundNum].push(scan);
//   });

//   // Find rounds in order
//   const roundNumbers = Object.keys(scansByRound)
//     .map(Number)
//     .sort((a, b) => a - b);

//   // Find the first incomplete round
//   for (const roundNum of roundNumbers) {
//     const scansInRound = scansByRound[roundNum];
//     if (scansInRound.length < totalCheckpoints) {
//       return roundNum; // Return this incomplete round
//     }
//   }

//   // All existing rounds are complete, check if we can start a new round
//   const lastRound = roundNumbers[roundNumbers.length - 1];
//   return lastRound < plan.rounds ? lastRound + 1 : lastRound;
// }

// UPDATED: getCurrentRound - Now filters by shift occurrence date

//  dekh bhai niche wala tested and chalu h pura ⬇️

// async function getCurrentRound(guardId, patrolPlanId, shiftId, occurrenceDate) {
//   const plan = await PatrolPlan.findById(patrolPlanId);
//   const totalCheckpoints = plan.checkpoints.length;

//   // Get the start and end of the occurrence day
//   const dayStart = moment(occurrenceDate).tz("Asia/Kolkata").startOf("day").toDate();
//   const dayEnd = moment(occurrenceDate).tz("Asia/Kolkata").endOf("day").toDate();

//   // CRITICAL: Only get scans from THIS specific shift occurrence (today)
//   const allScans = await Patrol.find({
//     guard: guardId,
//     patrolPlanId: patrolPlanId,
//     shift: shiftId,
//     createdAt: { $gte: dayStart, $lte: dayEnd }, // Same day only
//   }).sort({ createdAt: 1 });

//   console.log(
//     `[getCurrentRound] Found ${allScans.length} scans for ${moment(occurrenceDate).format("YYYY-MM-DD")}`
//   );

//   if (allScans.length === 0) {
//     return 1; // Start with round 1 for this new shift occurrence
//   }

//   // Group scans by round number
//   const scansByRound = {};
//   allScans.forEach((scan) => {
//     const roundNum = scan.roundNumber || 1;
//     if (!scansByRound[roundNum]) scansByRound[roundNum] = [];
//     scansByRound[roundNum].push(scan);
//   });

//   const roundNumbers = Object.keys(scansByRound)
//     .map(Number)
//     .sort((a, b) => a - b);

//   // Find the first incomplete round
//   for (const roundNum of roundNumbers) {
//     const scansInRound = scansByRound[roundNum];
//     if (scansInRound.length < totalCheckpoints) {
//       return roundNum;
//     }
//   }

//   // All existing rounds are complete, return next round or stay at max
//   const lastRound = roundNumbers[roundNumbers.length - 1];
//   return lastRound < plan.rounds ? lastRound + 1 : lastRound;
// }

//

// ⬇️ niche wala get shift chalu aur tested h
// exports.getShiftQRCodes = async (req, res) => {
//   try {
//     const guardId = new mongoose.Types.ObjectId(req.user.id);
//     const now = moment();

//     console.log("Guard ID:", guardId);
//     console.log("Now (Local):", now.format());

//     // Find current active shift where guard is assigned
//     const currentShift = await findActiveShiftForGuard(
//       guardId.toString(),
//       now.toDate()
//     );

//     if (!currentShift) {
//       return res
//         .status(404)
//         .json(
//           new ApiResponse(
//             false,
//             "No active shift found for your account at this time. Please check your schedule or contact your supervisor if you believe this is an error.",
//             null
//           )
//         );
//     }

//     console.log("Found active shift:", {
//       shiftName: currentShift.shiftName,
//       startTime: currentShift.startTime,
//       endTime: currentShift.endTime,
//       isRecurring: currentShift.isRecurring || false,
//       occurrenceDate: currentShift.occurrenceDate,
//     });

//     // Get patrol plans assigned to this guard for current shift
//     const patrolPlans = await PatrolPlan.find({
//       "assignedGuards.guardId": guardId,
//       "assignedGuards.assignedShifts": currentShift._id,
//       isActive: true,
//     }).populate("checkpoints.qrId");

//     const qrCodes = [];

//     for (const plan of patrolPlans) {
//       const planStart = plan.startDate ? moment(plan.startDate) : null;
//       const planEnd = plan.endDate ? moment(plan.endDate) : null;

//       if (planStart && now.isBefore(planStart)) continue;
//       if (planEnd && now.isAfter(planEnd)) continue;

//       // CRITICAL: Pass occurrenceDate to isolate this shift's scans
//       const currentRound = await getCurrentRound(
//         guardId,
//         plan._id,
//         currentShift._id,
//         currentShift.occurrenceDate || now.toDate() // Use occurrence date
//       );

//       const allRoundsCompleted = currentRound > plan.rounds;

//       // Get scans from TODAY ONLY for this shift occurrence
//       const dayStart = moment(currentShift.occurrenceDate || now)
//         .tz("Asia/Kolkata")
//         .startOf("day")
//         .toDate();
//       const dayEnd = moment(currentShift.occurrenceDate || now)
//         .tz("Asia/Kolkata")
//         .endOf("day")
//         .toDate();

//       const currentRoundScans = await Patrol.find({
//         guard: guardId,
//         patrolPlanId: plan._id,
//         shift: currentShift._id,
//         roundNumber: allRoundsCompleted ? plan.rounds : currentRound,
//         createdAt: { $gte: dayStart, $lte: dayEnd }, // TODAY ONLY
//       });

//       const scannedQRIds = currentRoundScans.map((scan) =>
//         scan.qrCodeId.toString()
//       );

//       for (const checkpoint of plan.checkpoints) {
//         if (checkpoint.qrId) {
//           const isThisQRScanned = scannedQRIds.includes(
//             checkpoint.qrId._id.toString()
//           );

//           qrCodes.push({
//             ...checkpoint.qrId.toObject(),
//             planName: plan.planName,
//             patrolPlanId: plan._id,
//             isCompleted: isThisQRScanned,
//             currentRound: allRoundsCompleted ? plan.rounds : currentRound,
//             totalRounds: plan.rounds,
//             allRoundsCompleted: allRoundsCompleted,
//             checkpointsScanned: scannedQRIds.length,
//             totalCheckpoints: plan.checkpoints.length,
//             isRoundComplete: scannedQRIds.length === plan.checkpoints.length,
//             progress: `${scannedQRIds.length}/${plan.checkpoints.length}`,
//             expectedTime: checkpoint.expectedTime,
//             sequence: checkpoint.sequence,
//           });
//         }
//       }
//     }

//     if (qrCodes.length === 0) {
//       return res.status(200).json(
//         new ApiResponse(
//           true,
//           "No checkpoints assigned for your current shift. Please check with your supervisor.",
//           {
//             shift: {
//               _id: currentShift._id,
//               shiftName: currentShift.shiftName,
//               startTime: currentShift.startTime,
//               endTime: currentShift.endTime,
//               currentTime: now.format(),
//               timezone: currentShift.timezone || "Asia/Kolkata",
//               occurrenceDate: currentShift.occurrenceDate,
//             },
//             qrCodes: [],
//           }
//         )
//       );
//     }

//     return res.status(200).json(
//       new ApiResponse(true, "QR codes for current shift", {
//         shift: {
//           _id: currentShift._id,
//           shiftName: currentShift.shiftName,
//           startTime: currentShift.startTime,
//           endTime: currentShift.endTime,
//           currentTime: now.format(),
//           timezone: currentShift.timezone || "Asia/Kolkata",
//           occurrenceDate: currentShift.occurrenceDate,
//         },
//         qrCodes,
//       })
//     );
//   } catch (err) {
//     console.error("Error in getShiftQRCodes:", err);
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };
exports.completeCheckpoint = async (req, res) => {
  try {
    const { patrolPlanId, qrId } = req.body;
    const guardId = req.user.id;

    const patrolPlan = await PatrolPlan.findOne({
      _id: patrolPlanId,
      assignedGuards: guardId,
    });

    if (!patrolPlan) {
      return res
        .status(404)
        .json(
          new ApiResponse(
            false,
            "Patrol plan not found or not assigned to you",
          ),
        );
    }

    // Find checkpoint and mark as completed
    const checkpoint = patrolPlan.checkpoints.find(
      (cp) => cp.qrId.toString() === qrId,
    );

    if (!checkpoint) {
      return res
        .status(404)
        .json(new ApiResponse(false, "Checkpoint not found in patrol plan"));
    }

    checkpoint.isCompleted = true;
    checkpoint.completedAt = new Date();
    await patrolPlan.save();

    return res
      .status(200)
      .json(
        new ApiResponse(true, "Checkpoint marked as complete", { checkpoint }),
      );
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// ============================================
// 3. HELPER FUNCTION: Get Current Round (Updated)
// ============================================
async function getCurrentRound(
  guardId,
  patrolPlanId,
  shiftId,
  occurrenceDate,
  shiftTimezone,
) {
  const plan = await PatrolPlan.findById(patrolPlanId);
  const totalCheckpoints = plan.checkpoints.length;

  // Get the start and end of the occurrence day
  const dayStart = moment(occurrenceDate)
    .tz(shiftTimezone || "Asia/Kolkata")
    .startOf("day")
    .toDate();

  const dayEnd = moment(occurrenceDate)
    .tz(shiftTimezone || "Asia/Kolkata")
    .endOf("day")
    .toDate();

  // ← UPDATED: Only get IN_PROGRESS or COMPLETED scans (exclude expired)
  const allScans = await Patrol.find({
    guard: guardId,
    patrolPlanId: patrolPlanId,
    shift: shiftId,
    createdAt: { $gte: dayStart, $lte: dayEnd },
    status: { $in: ["in_progress", "completed"] }, // ← Skip expired
  }).sort({ createdAt: 1 });

  console.log(
    `[getCurrentRound] Found ${allScans.length} active scans for ${moment(occurrenceDate).format("YYYY-MM-DD")}`,
  );

  if (allScans.length === 0) {
    return 1; // Start with round 1 for this new shift occurrence
  }

  // Group scans by round number
  const scansByRound = {};
  allScans.forEach((scan) => {
    const roundNum = scan.roundNumber || 1;
    if (!scansByRound[roundNum]) scansByRound[roundNum] = [];
    scansByRound[roundNum].push(scan);
  });

  const roundNumbers = Object.keys(scansByRound)
    .map(Number)
    .sort((a, b) => a - b);

  // Find the first incomplete round
  for (const roundNum of roundNumbers) {
    const scansInRound = scansByRound[roundNum];
    if (scansInRound.length < totalCheckpoints) {
      console.log(
        `[getCurrentRound] Current round: ${roundNum} (${scansInRound.length}/${totalCheckpoints})`,
      );
      return roundNum;
    }
  }

  // All existing rounds are complete, return next round or stay at max
  const lastRound = roundNumbers[roundNumbers.length - 1];
  const nextRound = lastRound < plan.rounds ? lastRound + 1 : lastRound;
  console.log(
    `[getCurrentRound] All rounds up to ${lastRound} complete. Next: ${nextRound}`,
  );
  return nextRound;
}

// ============================================
// 4. UPDATED SCANQR CONTROLLER
// ============================================
exports.scanQR = async (req, res) => {
  try {
    const guardId = req.user.id;
    const companyId = new mongoose.Types.ObjectId(req.user.companyId);

    const { qrData, guardLat, guardLng, distanceMeters, isVerified } = req.body;

    if (
      !qrData ||
      guardLat == null ||
      guardLng == null ||
      distanceMeters == null ||
      isVerified == null
    ) {
      return res
        .status(400)
        .json(new ApiResponse(false, "All fields required"));
    }

    const guard = await User.findById(
      new mongoose.Types.ObjectId(guardId),
    ).populate("createdBy");
    if (!guard || guard.role !== "guard") {
      return res.status(403).json(new ApiResponse(false, "Invalid guard"));
    }

    let photoBase64 = null;
    if (req.file) {
      const full = path.join(uploadDir, req.file.filename);
      const data = await fs.readFile(full);
      photoBase64 = data.toString("base64");
      await fs
        .unlink(full)
        .catch((e) => console.warn("unlink failed:", e.message));
    }

    const now = new Date();
    const activeShift = await findActiveShiftForGuard(guardId, now);

    if (!activeShift) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            false,
            "No active shift found. You can only scan QR codes during your assigned shift.",
          ),
        );
    }

    console.log(
      `✅ Active shift found: ${activeShift.shiftName} (TZ: ${activeShift.timezone})`,
    );

    let qrDoc = null;
    if (mongoose.Types.ObjectId.isValid(qrData)) {
      qrDoc = await QR.findById(qrData);
    }
    if (!qrDoc) {
      return res
        .status(404)
        .json(new ApiResponse(false, "Invalid or expired QR"));
    }

    let patrolPlan = await PatrolPlan.findOne({
      "assignedGuards.guardId": guardId,
      "checkpoints.qrId": qrDoc._id,
      isActive: true,
    });

    if (!patrolPlan) {
      return res
        .status(404)
        .json(
          new ApiResponse(false, "No active patrol plan assigned with this QR"),
        );
    }

    if (activeShift) {
      const guardAssignment = patrolPlan.assignedGuards.find(
        (ag) => ag.guardId.toString() === guardId,
      );
      if (guardAssignment?.assignedShifts?.length) {
        const isAssignedToThisShift = guardAssignment.assignedShifts.some(
          (shiftId) => shiftId.toString() === activeShift._id.toString(),
        );
        if (!isAssignedToThisShift) {
          return res
            .status(403)
            .json(
              new ApiResponse(
                false,
                "You are not assigned to scan this QR code during current shift",
              ),
            );
        }
      }
    }

    const totalCheckpoints = patrolPlan.checkpoints.length;

    // Get day boundaries in shift timezone
    const dayStart = moment(activeShift.occurrenceDate || now)
      .tz(activeShift.timezone || "Asia/Kolkata")
      .startOf("day")
      .toDate();

    const dayEnd = moment(activeShift.occurrenceDate || now)
      .tz(activeShift.timezone || "Asia/Kolkata")
      .endOf("day")
      .toDate();

    // ✅ NEW STEP 1: Check and mark expired rounds
    console.log(`🔍 [scanQR] Checking for expired rounds...`);
    await checkAndMarkExpiredRounds(
      guardId,
      patrolPlan._id,
      activeShift._id,
      activeShift.occurrenceDate || now,
      activeShift.timezone || "Asia/Kolkata",
    );

    // Get all active (non-expired) scans for today
    const allScans = await Patrol.find({
      guard: guardId,
      patrolPlanId: patrolPlan._id,
      shift: activeShift._id,
      createdAt: { $gte: dayStart, $lte: dayEnd },
      status: { $in: ["in_progress", "completed"] }, // ← Skip expired
    }).sort({ createdAt: 1 });

    console.log(`📊 Found ${allScans.length} active scans for today`);

    let currentRound = 1;
    let scansInCurrentRound = [];

    if (allScans.length > 0) {
      const scansByRound = {};
      allScans.forEach((scan) => {
        const rNum = scan.roundNumber || 1;
        if (!scansByRound[rNum]) scansByRound[rNum] = [];
        scansByRound[rNum].push(scan);
      });

      const roundNumbers = Object.keys(scansByRound)
        .map(Number)
        .sort((a, b) => a - b);

      for (const rNum of roundNumbers) {
        const scansInRound = scansByRound[rNum];
        if (scansInRound.length < totalCheckpoints) {
          currentRound = rNum;
          scansInCurrentRound = scansInRound;
          break;
        } else if (rNum === roundNumbers[roundNumbers.length - 1]) {
          currentRound = rNum + 1;
          scansInCurrentRound = [];
        }
      }
    }

    console.log(`🔄 Current round: ${currentRound}/${patrolPlan.rounds}`);

    // ✅ NEW STEP 2: Check if last round
    const isLastRound = currentRound === patrolPlan.rounds;

    if (currentRound > patrolPlan.rounds) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            false,
            `All ${patrolPlan.rounds} rounds for this patrol plan are completed in this shift`,
          ),
        );
    }

    const scannedCheckpointIds = scansInCurrentRound.map((scan) =>
      scan.qrCodeId.toString(),
    );

    if (scannedCheckpointIds.includes(qrDoc._id.toString())) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            false,
            `You have already scanned this checkpoint in round ${currentRound}. Progress: ${scannedCheckpointIds.length}/${totalCheckpoints} checkpoints completed.`,
          ),
        );
    }

    // ✅ NEW: Set roundStartTime for first scan of the round
    const roundStartTime =
      scansInCurrentRound.length === 0
        ? now
        : scansInCurrentRound[0].roundStartTime;

    const patrol = await Patrol.create({
      guard: guardId,
      shift: activeShift._id,
      patrolPlanId: patrolPlan._id,
      qrCodeId: qrDoc._id,
      roundNumber: currentRound,
      location: { lat: Number(guardLat), lng: Number(guardLng) },
      distanceMeters: Number(distanceMeters),
      photo: photoBase64,
      isVerified: Boolean(isVerified),
      roundStartTime: roundStartTime, // ← NEW: Track when round started
      status: "in_progress", // ← NEW: Mark as in progress
      firstScanAt: now,
      lastScanAt: now,
      companyId: companyId,
      scanCount: 1,
    });

    console.log(
      `✅ Scan recorded: Round ${currentRound}, Checkpoint ${scannedCheckpointIds.length + 1}/${totalCheckpoints}`,
    );

    const scannedCount = scannedCheckpointIds.length + 1;
    const isRoundComplete = scannedCount === totalCheckpoints;

    // ✅ NEW: If round complete, mark all scans as completed
    if (isRoundComplete) {
      await Patrol.updateMany(
        {
          guard: guardId,
          patrolPlanId: patrolPlan._id,
          shift: activeShift._id,
          roundNumber: currentRound,
          status: "in_progress",
        },
        { status: "completed" },
      );
      console.log(
        `🎉 [scanQR] Round ${currentRound} COMPLETED! All scans marked as completed`,
      );
    }

    const progressMessage = isRoundComplete
      ? `Round ${currentRound} completed! ${
          currentRound < patrolPlan.rounds
            ? "Ready for next round."
            : "All rounds completed for this shift!"
        }`
      : `Progress: ${scannedCount}/${totalCheckpoints} checkpoints in round ${currentRound}`;

    return res.status(201).json(
      new ApiResponse(true, progressMessage, {
        patrolId: patrol._id,
        companyId: patrol?.companyId,
        qrCodeId: qrDoc._id,
        siteId: qrDoc.siteId,
        patrolPlanId: patrolPlan._id,
        patrolPlanName: patrolPlan.planName,
        shiftId: activeShift._id,
        shiftName: activeShift.shiftName,
        isRecurringShift: activeShift.isRecurring || false,
        isVerified: Boolean(isVerified),
        distanceMeters: Number(distanceMeters),
        timestamp: patrol.createdAt,
        roundNumber: currentRound,
        scanCount: 1,
        progress: {
          currentRound,
          totalRounds: patrolPlan.rounds,
          checkpointsScanned: scannedCount,
          totalCheckpoints,
          isRoundComplete,
          remainingCheckpoints: totalCheckpoints - scannedCount,
          isLastRound: isLastRound, // ← NEW: Indicate if last round
        },
      }),
    );
  } catch (err) {
    console.error("Error in scanQR:", err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

exports.getShiftQRCodes = async (req, res) => {
  try {
    const guardId = new mongoose.Types.ObjectId(req.user.id);
    const now = moment();

    const currentShift = await findActiveShiftForGuard(
      guardId.toString(),
      now.toDate(),
    );

    if (!currentShift) {
      return res
        .status(404)
        .json(
          new ApiResponse(
            false,
            "No active shift found for your account at this time.",
            null,
          ),
        );
    }

    // ✅ NEW: Check and mark expired rounds FIRST
    const patrolPlans = await PatrolPlan.find({
      "assignedGuards.guardId": guardId,
      "assignedGuards.assignedShifts": currentShift._id,
      isActive: true,
    }).populate("checkpoints.qrId");

    for (const plan of patrolPlans) {
      await checkAndMarkExpiredRounds(
        guardId,
        plan._id,
        currentShift._id,
        currentShift.occurrenceDate || now.toDate(),
        currentShift.timezone || "Asia/Kolkata",
      );
    }

    const qrCodes = [];

    for (const plan of patrolPlans) {
      const planStart = plan.startDate ? moment(plan.startDate) : null;
      const planEnd = plan.endDate ? moment(plan.endDate) : null;

      if (planStart && now.isBefore(planStart)) continue;
      if (planEnd && now.isAfter(planEnd)) continue;

      const currentRound = await getCurrentRound(
        guardId,
        plan._id,
        currentShift._id,
        currentShift.occurrenceDate || now.toDate(),
        currentShift.timezone || "Asia/Kolkata",
      );

      const allRoundsCompleted = currentRound > plan.rounds;

      const dayStart = moment(currentShift.occurrenceDate || now)
        .tz(currentShift.timezone || "Asia/Kolkata")
        .startOf("day")
        .toDate();

      const dayEnd = moment(currentShift.occurrenceDate || now)
        .tz(currentShift.timezone || "Asia/Kolkata")
        .endOf("day")
        .toDate();

      const currentRoundScans = await Patrol.find({
        guard: guardId,
        patrolPlanId: plan._id,
        shift: currentShift._id,
        roundNumber: allRoundsCompleted ? plan.rounds : currentRound,
        createdAt: { $gte: dayStart, $lte: dayEnd },
        status: { $in: ["in_progress", "completed"] }, // ← Skip expired
      });

      const scannedQRIds = currentRoundScans.map((scan) =>
        scan.qrCodeId.toString(),
      );

      for (const checkpoint of plan.checkpoints) {
        if (checkpoint.qrId) {
          const isThisQRScanned = scannedQRIds.includes(
            checkpoint.qrId._id.toString(),
          );

          qrCodes.push({
            ...checkpoint.qrId.toObject(),
            planName: plan.planName,
            patrolPlanId: plan._id,
            isCompleted: isThisQRScanned,
            currentRound: allRoundsCompleted ? plan.rounds : currentRound,
            totalRounds: plan.rounds,
            allRoundsCompleted: allRoundsCompleted,
            checkpointsScanned: scannedQRIds.length,
            totalCheckpoints: plan.checkpoints.length,
            isRoundComplete: scannedQRIds.length === plan.checkpoints.length,
            progress: `${scannedQRIds.length}/${plan.checkpoints.length}`,
            expectedTime: checkpoint.expectedTime,
            sequence: checkpoint.sequence,
          });
        }
      }
    }

    return res.status(200).json(
      new ApiResponse(true, "QR codes for current shift", {
        shift: {
          _id: currentShift._id,
          shiftName: currentShift.shiftName,
          startTime: currentShift.startTime,
          endTime: currentShift.endTime,
          currentTime: now.format(),
          timezone: currentShift.timezone || "Asia/Kolkata",
          occurrenceDate: currentShift.occurrenceDate,
        },
        qrCodes,
      }),
    );
  } catch (err) {
    console.error("Error in getShiftQRCodes:", err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// exports.getGuardPerformanceReport = async (req, res) => {
//   try {
//     const { guardId, startDate, endDate, shiftId } = req.body;

//     console.log("req body of guard performance ", req.body);

//     if (!guardId)
//       return res.status(400).json(new ApiResponse(false, "Guard ID required"));

//     // Access control (unchanged)
//     let guard;
//     if (req.user.role === "employee") {
//       guard = await User.findOne({
//         _id: guardId,
//         role: "guard",
//         companyId: req.user.id,
//       });
//     } else if (req.user.role === "supervisor") {
//       guard = await User.findOne({
//         _id: guardId,
//         role: "guard",
//         supervisor: req.user.id,
//       });
//     }
//     if (!guard)
//       return res
//         .status(403)
//         .json(new ApiResponse(false, "No access to this guard"));

//     // Date range (unchanged)
//     // let start, end;
//     // if (startDate) {
//     //   start = moment.utc(startDate).startOf("day").toDate();
//     //   end = endDate
//     //     ? moment.utc(endDate).endOf("day").toDate()
//     //     : moment.utc(startDate).endOf("day").toDate();
//     // } else if (endDate) {
//     //   end = moment.utc(endDate).endOf("day").toDate();
//     //   start = moment.utc(endDate).startOf("day").toDate();
//     // } else {
//     //   end = moment.utc().endOf("day").toDate();
//     //   start = moment.utc().subtract(30, "days").startOf("day").toDate();
//     // }

//     //   console.log('start ', start);

//     //     console.log("Query date range (UTC):", {
//     //       start: start.toISOString(),
//     //       end: end.toISOString(),
//     //     });

//     //     const totalDays = moment.utc(end).diff(moment.utc(start), "days") + 1;

//     // ensure moment-timezone is required at top of file:
//     // const moment = require('moment-timezone');

//     // Timezone: default to Asia/Kolkata unless client sends another valid IANA tz
//     let timezone = (req.body.timezone || "Asia/Kolkata").toString().trim();
//     if (!moment.tz.zone(timezone)) {
//       console.warn(
//         `Invalid timezone "${timezone}" provided. Using Asia/Kolkata.`
//       );
//       timezone = "Asia/Kolkata";
//     }

//     // Date range (timezone-aware parsing)
//     // Interpret incoming YYYY-MM-DD strings in the provided timezone,
//     // compute timezone startOf('day') / endOf('day'), then convert to UTC for DB.
//     let userStart, userEnd; // moment objects in the specified timezone
//     if (startDate && startDate.toString().trim()) {
//       userStart = moment.tz(startDate, "YYYY-MM-DD", timezone).startOf("day");
//       userEnd =
//         endDate && endDate.toString().trim()
//           ? moment.tz(endDate, "YYYY-MM-DD", timezone).endOf("day")
//           : moment.tz(startDate, "YYYY-MM-DD", timezone).endOf("day");
//     } else if (endDate && endDate.toString().trim()) {
//       userEnd = moment.tz(endDate, "YYYY-MM-DD", timezone).endOf("day");
//       userStart = moment.tz(endDate, "YYYY-MM-DD", timezone).startOf("day");
//     } else {
//       // default: last 30 days in Asia/Kolkata
//       userEnd = moment.tz(timezone).endOf("day");
//       userStart = userEnd.clone().subtract(29, "days").startOf("day"); // inclusive 30 days
//     }

//     // Convert to UTC Date objects for DB queries
//     const start = userStart.clone().utc().toDate();
//     const end = userEnd.clone().utc().toDate();

//     console.log("Query date range (timezone-aware):", {
//       timezone,
//       userStart: userStart.format(),
//       userEnd: userEnd.format(),
//     });
//     console.log("Query date range (UTC for DB):", {
//       start: start.toISOString(),
//       end: end.toISOString(),
//     });

//     const totalDays = userEnd.diff(userStart, "days") + 1;

//     const scanQuery = {
//       guard: guardId,
//       createdAt: { $gte: start, $lte: end },
//     };

//     if (shiftId) {
//       scanQuery.shift = shiftId;
//     }

//     // ✅ FIX 1: Get only ACTIVE scans (exclude expired)
//     // const patrolScans = await Patrol.find({
//     //   ...scanQuery,
//     //   status: { $in: ["in_progress", "completed"] }, // ← ADDED
//     // })
//     const patrolScans = await Patrol.find({
//       ...scanQuery,
//       $or: [
//         { status: { $in: ["in_progress", "completed"] } }, // New scans with status
//         { status: { $exists: false } }, // Old scans without status field
//       ],
//     })
//       .populate("patrolPlanId", "planName rounds")
//       .populate("qrCodeId", "siteId description")
//       .populate("shift", "shiftName")
//       .sort({ createdAt: -1 });

//     console.log("patrol Scans", patrolScans);

//     console.log(
//       `Found ${patrolScans.length} active patrol scans (expired excluded)`
//     );

//     // ✅ FIX 2: Also get expired scans for reporting
//     const expiredScans = await Patrol.find({
//       ...scanQuery,
//       status: "expired",
//     }).sort({ createdAt: -1 });

//     console.log(`Found ${expiredScans.length} expired scans`);

//     // Get patrol plans (unchanged)
//     const patrolPlanIds = [
//       ...new Set(
//         patrolScans.map((scan) => scan.patrolPlanId?._id).filter(Boolean)
//       ),
//     ];

//     const patrolPlans = await PatrolPlan.find({
//       _id: { $in: patrolPlanIds },
//     }).populate("checkpoints.qrId", "siteId description");

//     // Initialize tracking (unchanged)
//     const roundsData = {};
//     let totalCompletedRounds = 0;
//     let totalExpectedRounds = 0;
//     let totalCompletedScans = 0;
//     let totalExpectedScans = 0;

//     patrolPlans.forEach((plan) => {
//       const planId = plan._id.toString();
//       const planRounds = plan.rounds || 1;
//       const planCheckpoints = plan.checkpoints.length;

//       totalExpectedRounds += planRounds;
//       totalExpectedScans += planRounds * planCheckpoints;

//       roundsData[planId] = {
//         planName: plan.planName,
//         totalRounds: planRounds,
//         totalCheckpoints: planCheckpoints,
//         completedRounds: 0,
//         completedScans: 0,
//         rounds: {},
//       };
//     });

//     // Group scans by plan and round (unchanged)
//     patrolScans.forEach((scan) => {
//       const planId = scan.patrolPlanId?._id?.toString();
//       const roundNumber = scan.roundNumber || 1;
//       const qrCodeId = scan.qrCodeId?._id?.toString();

//       if (!planId || !roundsData[planId] || !qrCodeId) return;

//       const roundKey = `round_${roundNumber}`;

//       if (!roundsData[planId].rounds[roundKey]) {
//         roundsData[planId].rounds[roundKey] = {
//           roundNumber: roundNumber,
//           scans: [],
//           scannedQRIds: new Set(),
//           completedCheckpoints: 0,
//           isComplete: false,
//         };
//       }

//       const roundData = roundsData[planId].rounds[roundKey];

//       if (!roundData.scannedQRIds.has(qrCodeId)) {
//         roundData.scannedQRIds.add(qrCodeId);
//         roundData.scans.push({
//           scanId: scan._id,
//           qrCodeId: qrCodeId,
//           siteId: scan.qrCodeId?.siteId,
//           checkpointName: scan.qrCodeId?.siteId,
//           checkpointDescription: scan.qrCodeId?.description,
//           actualTime: scan.createdAt,
//           distanceMeters: scan.distanceMeters,
//           isVerified: scan.isVerified,
//         });

//         roundData.completedCheckpoints++;

//         if (
//           roundData.completedCheckpoints >= roundsData[planId].totalCheckpoints
//         ) {
//           if (!roundData.isComplete) {
//             roundData.isComplete = true;
//             roundsData[planId].completedRounds++;
//             totalCompletedRounds++;
//           }
//         }

//         roundsData[planId].completedScans++;
//         totalCompletedScans++;
//       }
//     });

//     // Create detailed rounds data (unchanged)
//     const detailedRoundsData = [];

//     Object.entries(roundsData).forEach(([planId, planData]) => {
//       const patrolPlan = patrolPlans.find((p) => p._id.toString() === planId);

//       Object.values(planData.rounds).forEach((round) => {
//         round.scans.forEach((scan) => {
//           detailedRoundsData.push({
//             date: moment(scan.actualTime).format("YYYY-MM-DD"),
//             roundNumber: round.roundNumber,
//             planName: planData.planName,
//             checkpointName: scan.checkpointName,
//             checkpointDescription: scan.checkpointDescription,
//             actualTime: scan.actualTime,
//             status: "completed",
//             scanId: scan.scanId,
//             distanceMeters: scan.distanceMeters,
//             isVerified: scan.isVerified,
//           });
//         });

//         if (!round.isComplete && patrolPlan) {
//           patrolPlan.checkpoints.forEach((checkpoint) => {
//             const checkpointId = checkpoint.qrId._id.toString();

//             if (!round.scannedQRIds.has(checkpointId)) {
//               detailedRoundsData.push({
//                 date: round.scans[0]
//                   ? moment(round.scans[0].actualTime).format("YYYY-MM-DD")
//                   : moment().format("YYYY-MM-DD"),
//                 roundNumber: round.roundNumber,
//                 planName: planData.planName,
//                 checkpointName: checkpoint.qrId.siteId,
//                 checkpointDescription: checkpoint.qrId.description,
//                 actualTime: null,
//                 status: "missed",
//                 scanId: null,
//               });
//             }
//           });
//         }
//       });
//     });

//     detailedRoundsData.sort((a, b) => {
//       if (a.date === b.date) {
//         if (a.roundNumber === b.roundNumber) {
//           return a.checkpointName.localeCompare(b.checkpointName);
//         }
//         return a.roundNumber - b.roundNumber;
//       }
//       return new Date(b.date) - new Date(a.date);
//     });

//     // Calculate performance metrics (unchanged logic)
//     const missedRounds = totalExpectedRounds - totalCompletedRounds;
//     const missedScans = totalExpectedScans - totalCompletedScans;

//     const roundsCompletionRate =
//       totalExpectedRounds > 0
//         ? (totalCompletedRounds / totalExpectedRounds) * 100
//         : 0;

//     const scanCompletionRate =
//       totalExpectedScans > 0
//         ? (totalCompletedScans / totalExpectedScans) * 100
//         : 0;

//     // ✅ FIX 3: Process expired scans for reporting
//     const expiredRoundsData = {};
//     expiredScans.forEach((scan) => {
//       const key = `${scan.patrolPlanId?.toString()}_round_${scan.roundNumber}`;
//       if (!expiredRoundsData[key]) {
//         expiredRoundsData[key] = {
//           roundNumber: scan.roundNumber,
//           checkpointsScanned: 0,
//           expiryReason: scan.expiryReason,
//           firstScanTime: scan.firstScanAt,
//         };
//       }
//       expiredRoundsData[key].checkpointsScanned++;
//     });

//     // Get attendance (unchanged)
//     const attendanceRecords = await Attendance.find({
//       guard: guardId,
//       date: { $gte: start, $lte: end },
//     });

//     const attendanceTotalDays = attendanceRecords.length;
//     const presentDays = attendanceRecords.filter(
//       (record) =>
//         record.status === "present" ||
//         record.status === "on-duty" ||
//         record.status === "late"
//     ).length;

//     const attendanceRate =
//       attendanceTotalDays > 0 ? (presentDays / attendanceTotalDays) * 100 : 0;

//     const overallPerformance = roundsCompletionRate;

//     return res.status(200).json(
//       new ApiResponse(true, "Guard performance report generated", {
//         guard: {
//           _id: guard._id,
//           name: guard.name,
//           phone: guard.phone,
//         },

//         reportPeriod: {
//           startDate: start,
//           endDate: end,
//           totalDays: totalDays,
//         },

//         roundsPerformance: {
//           summary: {
//             totalExpectedRounds: totalExpectedRounds,
//             totalCompletedRounds: totalCompletedRounds,
//             totalMissedRounds: missedRounds,
//             totalExpectedScans: totalExpectedScans,
//             totalCompletedScans: totalCompletedScans,
//             totalMissedScans: missedScans,
//             roundsCompletionRate: roundsCompletionRate.toFixed(1) + "%",
//             scanCompletionRate: scanCompletionRate.toFixed(1) + "%",
//           },
//           planBreakdown: Object.values(roundsData).map((plan) => ({
//             planName: plan.planName,
//             totalRounds: plan.totalRounds,
//             completedRounds: plan.completedRounds,
//             totalCheckpoints: plan.totalCheckpoints,
//             completedScans: plan.completedScans,
//             completionRate:
//               ((plan.completedRounds / plan.totalRounds) * 100).toFixed(1) +
//               "%",
//           })),
//         },

//         detailedRounds: detailedRoundsData,

//         // ✅ NEW: Show expired rounds separately
//         expiredRounds: {
//           total: expiredScans.length,
//           rounds: Object.values(expiredRoundsData),
//           note: "These rounds exceeded 1 hour timeout without completing all checkpoints and were auto-cleared. Counts remain in history for audit trail.",
//         },

//         performance: {
//           overallScore: overallPerformance.toFixed(1),
//           rating: getPerformanceRating(overallPerformance),
//           breakdown: {
//             roundsCompletionRate: roundsCompletionRate.toFixed(1),
//             scanCompletionRate: scanCompletionRate.toFixed(1),
//           },
//         },

//         summary: {
//           progress: `${totalCompletedRounds}/${totalExpectedRounds} rounds completed`,
//           efficiency: roundsCompletionRate.toFixed(1) + "%",
//           status: overallPerformance >= 70 ? "Good" : "Needs Improvement",
//           expiredRoundsNote:
//             expiredScans.length > 0
//               ? `${expiredScans.length} scans from ${
//                   Object.keys(expiredRoundsData).length
//                 } rounds expired (not counted in metrics)`
//               : "No expired rounds",
//         },
//       })
//     );
//   } catch (err) {
//     console.error("Error in getGuardPerformanceReport:", err);
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };

// exports.getGuardPerformanceReport = async (req, res) => {
//   try {
//     const { guardId, startDate, endDate, shiftId } = req.body;
//     const moment = require("moment-timezone");
//     const mongoose = require("mongoose");

//     console.log("req body of guard performance ", req.body);

//     if (!guardId)
//       return res.status(400).json(new ApiResponse(false, "Guard ID required"));

//     // Access control (unchanged)
//     let guard;
//     if (req.user.role === "employee") {
//       guard = await User.findOne({
//         _id: guardId,
//         role: "guard",
//         companyId: req.user.id,
//       });
//     } else if (req.user.role === "supervisor") {
//       guard = await User.findOne({
//         _id: guardId,
//         role: "guard",
//         supervisor: req.user.id,
//       });
//     }
//     if (!guard)
//       return res
//         .status(403)
//         .json(new ApiResponse(false, "No access to this guard"));

//     // Timezone: default to Asia/Kolkata unless client sends another valid IANA tz
//     let timezone = (req.body.timezone || "Asia/Kolkata").toString().trim();
//     if (!moment.tz.zone(timezone)) {
//       console.warn(
//         `Invalid timezone "${timezone}" provided. Using Asia/Kolkata.`
//       );
//       timezone = "Asia/Kolkata";
//     }

//     // Date range (timezone-aware parsing)
//     let userStart, userEnd; // moment objects in the specified timezone
//     if (startDate && startDate.toString().trim()) {
//       userStart = moment.tz(startDate, "YYYY-MM-DD", timezone).startOf("day");
//       userEnd =
//         endDate && endDate.toString().trim()
//           ? moment.tz(endDate, "YYYY-MM-DD", timezone).endOf("day")
//           : moment.tz(startDate, "YYYY-MM-DD", timezone).endOf("day");
//     } else if (endDate && endDate.toString().trim()) {
//       userEnd = moment.tz(endDate, "YYYY-MM-DD", timezone).endOf("day");
//       userStart = moment.tz(endDate, "YYYY-MM-DD", timezone).startOf("day");
//     } else {
//       // default: last 30 days in Asia/Kolkata
//       userEnd = moment.tz(timezone).endOf("day");
//       userStart = userEnd.clone().subtract(29, "days").startOf("day"); // inclusive 30 days
//     }

//     // Convert to UTC Date objects for DB queries
//     const start = userStart.clone().utc().toDate();
//     const end = userEnd.clone().utc().toDate();

//     console.log("Query date range (timezone-aware):", {
//       timezone,
//       userStart: userStart.format(),
//       userEnd: userEnd.format(),
//     });
//     console.log("Query date range (UTC for DB):", {
//       start: start.toISOString(),
//       end: end.toISOString(),
//     });

//     const totalDays = userEnd.diff(userStart, "days") + 1;

//     const scanQuery = {
//       guard: guardId,
//       createdAt: { $gte: start, $lte: end },
//     };
//     if (shiftId) scanQuery.shift = shiftId;

//     // Patrol scans (unchanged)
//     const patrolScans = await Patrol.find({
//       ...scanQuery,
//       $or: [
//         { status: { $in: ["in_progress", "completed"] } },
//         { status: { $exists: false } },
//       ],
//     })
//       .populate("patrolPlanId", "planName rounds")
//       .populate("qrCodeId", "siteId description")
//       .populate("shift", "shiftName")
//       .sort({ createdAt: -1 });

//     console.log(
//       `Found ${patrolScans.length} active patrol scans (expired excluded)`
//     );

//     const expiredScans = await Patrol.find({
//       ...scanQuery,
//       status: "expired",
//     }).sort({ createdAt: -1 });

//     console.log(`Found ${expiredScans.length} expired scans`);

//     // patrolPlans, roundsData, grouping, detailedRoundsData unchanged...
//     // (kept exactly as in your function, omitted here for brevity in the block)
//     // --- BEGIN original logic (kept) ---
//     const patrolPlanIds = [
//       ...new Set(
//         patrolScans.map((scan) => scan.patrolPlanId?._id).filter(Boolean)
//       ),
//     ];

//     const patrolPlans = await PatrolPlan.find({
//       _id: { $in: patrolPlanIds },
//     }).populate("checkpoints.qrId", "siteId description");

//     const roundsData = {};
//     let totalCompletedRounds = 0;
//     let totalExpectedRounds = 0;
//     let totalCompletedScans = 0;
//     let totalExpectedScans = 0;

//     patrolPlans.forEach((plan) => {
//       const planId = plan._id.toString();
//       const planRounds = plan.rounds || 1;
//       const planCheckpoints = plan.checkpoints.length;

//       totalExpectedRounds += planRounds;
//       totalExpectedScans += planRounds * planCheckpoints;

//       roundsData[planId] = {
//         planName: plan.planName,
//         totalRounds: planRounds,
//         totalCheckpoints: planCheckpoints,
//         completedRounds: 0,
//         completedScans: 0,
//         rounds: {},
//       };
//     });

//     patrolScans.forEach((scan) => {
//       const planId = scan.patrolPlanId?._id?.toString();
//       const roundNumber = scan.roundNumber || 1;
//       const qrCodeId = scan.qrCodeId?._id?.toString();

//       if (!planId || !roundsData[planId] || !qrCodeId) return;

//       const roundKey = `round_${roundNumber}`;

//       if (!roundsData[planId].rounds[roundKey]) {
//         roundsData[planId].rounds[roundKey] = {
//           roundNumber: roundNumber,
//           scans: [],
//           scannedQRIds: new Set(),
//           completedCheckpoints: 0,
//           isComplete: false,
//         };
//       }

//       const roundData = roundsData[planId].rounds[roundKey];

//       if (!roundData.scannedQRIds.has(qrCodeId)) {
//         roundData.scannedQRIds.add(qrCodeId);
//         roundData.scans.push({
//           scanId: scan._id,
//           qrCodeId: qrCodeId,
//           siteId: scan.qrCodeId?.siteId,
//           checkpointName: scan.qrCodeId?.siteId,
//           checkpointDescription: scan.qrCodeId?.description,
//           actualTime: scan.createdAt,
//           distanceMeters: scan.distanceMeters,
//           isVerified: scan.isVerified,
//         });

//         roundData.completedCheckpoints++;

//         if (
//           roundData.completedCheckpoints >= roundsData[planId].totalCheckpoints
//         ) {
//           if (!roundData.isComplete) {
//             roundData.isComplete = true;
//             roundsData[planId].completedRounds++;
//             totalCompletedRounds++;
//           }
//         }

//         roundsData[planId].completedScans++;
//         totalCompletedScans++;
//       }
//     });

//     const detailedRoundsData = [];

//     Object.entries(roundsData).forEach(([planId, planData]) => {
//       const patrolPlan = patrolPlans.find((p) => p._id.toString() === planId);

//       Object.values(planData.rounds).forEach((round) => {
//         round.scans.forEach((scan) => {
//           detailedRoundsData.push({
//             date: moment(scan.actualTime).tz(timezone).format("YYYY-MM-DD"),
//             roundNumber: round.roundNumber,
//             planName: planData.planName,
//             checkpointName: scan.checkpointName,
//             checkpointDescription: scan.checkpointDescription,
//             actualTime: scan.actualTime,
//             status: "completed",
//             scanId: scan.scanId,
//             distanceMeters: scan.distanceMeters,
//             isVerified: scan.isVerified,
//           });
//         });

//         if (!round.isComplete && patrolPlan) {
//           patrolPlan.checkpoints.forEach((checkpoint) => {
//             const checkpointId = checkpoint.qrId._id.toString();

//             if (!round.scannedQRIds.has(checkpointId)) {
//               detailedRoundsData.push({
//                 date: round.scans[0]
//                   ? moment(round.scans[0].actualTime)
//                       .tz(timezone)
//                       .format("YYYY-MM-DD")
//                   : userStart.format("YYYY-MM-DD"),
//                 roundNumber: round.roundNumber,
//                 planName: planData.planName,
//                 checkpointName: checkpoint.qrId.siteId,
//                 checkpointDescription: checkpoint.qrId.description,
//                 actualTime: null,
//                 status: "missed",
//                 scanId: null,
//               });
//             }
//           });
//         }
//       });
//     });

//     detailedRoundsData.sort((a, b) => {
//       if (a.date === b.date) {
//         if (a.roundNumber === b.roundNumber) {
//           return a.checkpointName.localeCompare(b.checkpointName);
//         }
//         return a.roundNumber - b.roundNumber;
//       }
//       return new Date(b.date) - new Date(a.date);
//     });
//     // --- END original logic ---

//     // Attendance: robust lookup to handle Date or YYYY-MM-DD string storage
//     let attendanceRecords = await Attendance.find({
//       guard: guardId,
//       date: { $gte: start, $lte: end },
//     });

//     console.log(
//       `Attendance records by Date-range query: ${attendanceRecords.length}`
//     );

//     // Fallback: if no records, run aggregation that converts stored date -> YYYY-MM-DD in timezone
//     if (!attendanceRecords || attendanceRecords.length === 0) {
//       const startStr = userStart.format("YYYY-MM-DD");
//       const endStr = userEnd.format("YYYY-MM-DD");

//       console.log(
//         `Attendance fallback: trying aggregation match on local-date ${startStr} -> ${endStr}`
//       );

//       // Aggregation will work whether date is stored as Date or as string (if string, $dateToString will error,
//       // so handle that by attempting a string-match query too)
//       try {
//         attendanceRecords = await Attendance.aggregate([
//           { $match: { guard: mongoose.Types.ObjectId(guardId) } },
//           {
//             $addFields: {
//               dateLocal: {
//                 $dateToString: { format: "%Y-%m-%d", date: "$date", timezone },
//               },
//             },
//           },
//           { $match: { dateLocal: { $gte: startStr, $lte: endStr } } },
//           // bring back original fields
//           { $project: { dateLocal: 1, date: 1, status: 1 } },
//         ]);
//         console.log(
//           `Attendance records from aggregation: ${attendanceRecords.length}`
//         );
//       } catch (aggErr) {
//         // If aggregation fails (e.g., date is stored as plain string), try string-range query:
//         console.warn(
//           "Attendance aggregation failed (likely date field is string). Trying string-range query.",
//           aggErr
//         );
//         attendanceRecords = await Attendance.find({
//           guard: guardId,
//           date: { $gte: startStr, $lte: endStr },
//         });
//         console.log(
//           `Attendance records from string-range query: ${attendanceRecords.length}`
//         );
//       }
//     }

//     // Normalize attendanceRecords so we can compute unique local dates
//     // If we got aggregate results, they include dateLocal; if Mongoose docs, date may be Date or string
//     const attendanceDateSet = new Set();
//     const attendanceDocs = Array.isArray(attendanceRecords)
//       ? attendanceRecords
//       : [];

//     attendanceDocs.forEach((rec) => {
//       // prefer dateLocal if present (from aggregation)
//       let localDate;
//       if (rec.dateLocal) {
//         localDate = rec.dateLocal;
//       } else if (rec.date) {
//         // rec.date might be a Date or a YYYY-MM-DD string
//         if (rec.date instanceof Date) {
//           localDate = moment(rec.date).tz(timezone).format("YYYY-MM-DD");
//         } else {
//           // assume it's a YYYY-MM-DD string already
//           localDate = moment
//             .tz(rec.date.toString(), "YYYY-MM-DD", timezone)
//             .format("YYYY-MM-DD");
//         }
//       }
//       if (localDate) attendanceDateSet.add(localDate);
//     });

//     const attendanceTotalDays = attendanceDateSet.size;

//     // For presentDays, count unique local dates where there's at least one record with status present/on-duty/late
//     const presentDates = new Set();
//     attendanceDocs.forEach((rec) => {
//       let localDate;
//       if (rec.dateLocal) {
//         localDate = rec.dateLocal;
//       } else if (rec.date) {
//         if (rec.date instanceof Date) {
//           localDate = moment(rec.date).tz(timezone).format("YYYY-MM-DD");
//         } else {
//           localDate = moment
//             .tz(rec.date.toString(), "YYYY-MM-DD", timezone)
//             .format("YYYY-MM-DD");
//         }
//       }
//       const status = rec.status ? rec.status.toString().toLowerCase() : "";
//       if (
//         localDate &&
//         (status === "present" || status === "on-duty" || status === "late")
//       ) {
//         presentDates.add(localDate);
//       }
//     });

//     const presentDays = presentDates.size;
//     const attendanceRate =
//       attendanceTotalDays > 0 ? (presentDays / attendanceTotalDays) * 100 : 0;

//     console.log(
//       `Attendance unique days: ${attendanceTotalDays}, presentDays: ${presentDays}`
//     );

//     // Remaining calculations same as your original function
//     const missedRounds = totalExpectedRounds - totalCompletedRounds;
//     const missedScans = totalExpectedScans - totalCompletedScans;

//     const roundsCompletionRate =
//       totalExpectedRounds > 0
//         ? (totalCompletedRounds / totalExpectedRounds) * 100
//         : 0;

//     const scanCompletionRate =
//       totalExpectedScans > 0
//         ? (totalCompletedScans / totalExpectedScans) * 100
//         : 0;

//     const expiredRoundsData = {};
//     expiredScans.forEach((scan) => {
//       const key = `${scan.patrolPlanId?.toString()}_round_${scan.roundNumber}`;
//       if (!expiredRoundsData[key]) {
//         expiredRoundsData[key] = {
//           roundNumber: scan.roundNumber,
//           checkpointsScanned: 0,
//           expiryReason: scan.expiryReason,
//           firstScanTime: scan.firstScanAt,
//         };
//       }
//       expiredRoundsData[key].checkpointsScanned++;
//     });

//     const overallPerformance = roundsCompletionRate;

//     return res.status(200).json(
//       new ApiResponse(true, "Guard performance report generated", {
//         guard: {
//           _id: guard._id,
//           name: guard.name,
//           phone: guard.phone,
//         },

//         reportPeriod: {
//           startDateUtc: start,
//           endDateUtc: end,
//           startDateLocal: userStart.format(), // timezone-aware formatted start
//           endDateLocal: userEnd.format(), // timezone-aware formatted end
//           timezone,
//           totalDays: totalDays,
//         },

//         roundsPerformance: {
//           summary: {
//             totalExpectedRounds: totalExpectedRounds,
//             totalCompletedRounds: totalCompletedRounds,
//             totalMissedRounds: missedRounds,
//             totalExpectedScans: totalExpectedScans,
//             totalCompletedScans: totalCompletedScans,
//             totalMissedScans: missedScans,
//             roundsCompletionRate: roundsCompletionRate.toFixed(1) + "%",
//             scanCompletionRate: scanCompletionRate.toFixed(1) + "%",
//           },
//           planBreakdown: Object.values(roundsData).map((plan) => ({
//             planName: plan.planName,
//             totalRounds: plan.totalRounds,
//             completedRounds: plan.completedRounds,
//             totalCheckpoints: plan.totalCheckpoints,
//             completedScans: plan.completedScans,
//             completionRate:
//               ((plan.completedRounds / plan.totalRounds) * 100).toFixed(1) +
//               "%",
//           })),
//         },

//         detailedRounds: detailedRoundsData,

//         expiredRounds: {
//           total: expiredScans.length,
//           rounds: Object.values(expiredRoundsData),
//           note: "These rounds exceeded 1 hour timeout without completing all checkpoints and were auto-cleared. Counts remain in history for audit trail.",
//         },

//         performance: {
//           overallScore: overallPerformance.toFixed(1),
//           rating: getPerformanceRating(overallPerformance),
//           breakdown: {
//             roundsCompletionRate: roundsCompletionRate.toFixed(1),
//             scanCompletionRate: scanCompletionRate.toFixed(1),
//           },
//         },

//         summary: {
//           progress: `${totalCompletedRounds}/${totalExpectedRounds} rounds completed`,
//           efficiency: roundsCompletionRate.toFixed(1) + "%",
//           status: overallPerformance >= 70 ? "Good" : "Needs Improvement",
//           expiredRoundsNote:
//             expiredScans.length > 0
//               ? `${expiredScans.length} scans from ${
//                   Object.keys(expiredRoundsData).length
//                 } rounds expired (not counted in metrics)`
//               : "No expired rounds",
//         },

//         // Attendance summary
//         attendance: {
//           attendanceTotalDays,
//           presentDays,
//           attendanceRate: attendanceRate.toFixed(1) + "%",
//         },
//       })
//     );
//   } catch (err) {
//     console.error("Error in getGuardPerformanceReport:", err);
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };

// Full getGuardPerformanceReport function (uses moment-timezone and mongoose)
// Drop this into your controller file. Assumes models User, Patrol, PatrolPlan are available in scope.

// Updated getGuardPerformanceReport
// - Buckets scans by shift occurrence (shift-local date)
// - Deduplicates per QR per (occurrence, round)
// - Excludes expired scans from active metrics but reports expired counts separately
// - Adds raw counts (totalRawScans, activeScans, expiredScans)
// - Optionally computes expected rounds from scheduled shifts when req.body.expectedFromSchedule === true
//
// Requires: moment-timezone, mongoose, models: Patrol, PatrolPlan, Shift, User
// Usage: send timezone if needed, optional expectedFromSchedule boolean in req.body

// Updated getGuardPerformanceReport (no attendance, shift-occurrence bucketing)
// Changes in this file compared to previous version:
// - Keep a scannedQRIds set to compute missed checkpoints, BUT count every scan occurrence
//   toward totalCompletedScans (this handles your "no duplicate scans per round" data case
//   while still guarding missed-checkpoint logic).
// - Round distanceMeters to an integer in the response (Math.round).
// - Keep rawCounts and expected-from-schedule behavior as before.
//
// Requirements: moment-timezone, mongoose, and models Patrol, PatrolPlan, Shift, User, ApiResponse
// Drop this into your controller, replacing the previous getGuardPerformanceReport.

/*this is working function commented on 2june 12:01 pm */
exports.getGuardPerformanceReport = async (req, res) => {
  try {
    const { guardId, startDate, endDate, shiftId } = req.body;

    if (!guardId)
      return res.status(400).json(new ApiResponse(false, "Guard ID required"));

    // Access control
    let guard;
    if (req.user.role === "employee") {
      guard = await User.findOne({
        _id: guardId,
        role: "guard",
        companyId: req.user.id,
      });
    } else if (req.user.role === "supervisor") {
      guard = await User.findOne({
        _id: guardId,
        role: "guard",
        supervisor: req.user.id,
      });
    }
    if (!guard)
      return res
        .status(403)
        .json(new ApiResponse(false, "No access to this guard"));

    // Timezone setup
    let timezone = (req.body.timezone || "Asia/Kolkata").trim();
    if (!moment.tz.zone(timezone)) {
      timezone = "Asia/Kolkata";
    }

    // Date range handling
    let userStart, userEnd;
    if (startDate && startDate.trim()) {
      userStart = moment.tz(startDate, "YYYY-MM-DD", timezone).startOf("day");
      userEnd =
        endDate && endDate.trim()
          ? moment.tz(endDate, "YYYY-MM-DD", timezone).endOf("day")
          : moment.tz(startDate, "YYYY-MM-DD", timezone).endOf("day");
    } else if (endDate && endDate.trim()) {
      userEnd = moment.tz(endDate, "YYYY-MM-DD", timezone).endOf("day");
      userStart = moment.tz(endDate, "YYYY-MM-DD", timezone).startOf("day");
    } else {
      userEnd = moment.tz(timezone).endOf("day");
      userStart = userEnd.clone().subtract(29, "days").startOf("day");
    }

    const start = userStart.clone().utc().toDate();
    const end = userEnd.clone().utc().toDate();
    const totalDays = userEnd.diff(userStart, "days") + 1;

    // Base query - GET ALL SCANS (including expired)
    const baseQuery = {
      guard: new mongoose.Types.ObjectId(guardId),
      createdAt: { $gte: start, $lte: end },
    };
    if (shiftId) baseQuery.shift = new mongoose.Types.ObjectId(shiftId);

    // Get ALL scans (active + expired)
    const allScans = await Patrol.find(baseQuery)
      .populate("patrolPlanId", "planName rounds checkpoints")
      .populate("qrCodeId", "siteId description")
      .populate("shift", "shiftName startTime endTime timezone")
      .sort({ createdAt: 1 }); // Sort by time to process in order

    console.log(`📊 Found ${allScans.length} total scans (all statuses)`);

    // Get patrol plans assigned to this guard
    const patrolPlanQuery = {
      "assignedGuards.guardId": new mongoose.Types.ObjectId(guardId),
      isActive: true,
    };
    if (shiftId) {
      patrolPlanQuery["assignedGuards.assignedShifts"] =
        new mongoose.Types.ObjectId(shiftId);
    }

    const assignedPatrolPlans = await PatrolPlan.find(patrolPlanQuery).populate(
      "checkpoints.qrId",
      "siteId description",
    );

    console.log(`📋 Found ${assignedPatrolPlans.length} assigned patrol plans`);

    /**
     * CALCULATE EXPECTED VALUES BASED ON ASSIGNED PATROL PLANS
     */
    let totalExpectedRounds = 0;
    let totalExpectedScans = 0;

    for (const plan of assignedPatrolPlans) {
      const planCheckpointsCount = plan.checkpoints.length;
      const planRoundsPerDay = plan.rounds || 1;

      const planStartDate = plan.startDate
        ? moment(plan.startDate).tz(timezone)
        : userStart.clone();
      const planEndDate = plan.endDate
        ? moment(plan.endDate).tz(timezone)
        : userEnd.clone();

      const effectiveStart = moment.max(userStart, planStartDate);
      const effectiveEnd = moment.min(userEnd, planEndDate);

      if (effectiveStart.isAfter(effectiveEnd)) continue;

      const activeDays = effectiveEnd.diff(effectiveStart, "days") + 1;

      console.log(
        `📅 Plan "${plan.planName}": ${activeDays} days × ${planRoundsPerDay} rounds × ${planCheckpointsCount} checkpoints`,
      );

      totalExpectedRounds += activeDays * planRoundsPerDay;
      totalExpectedScans +=
        activeDays * planRoundsPerDay * planCheckpointsCount;
    }

    console.log(
      `✅ Total Expected: ${totalExpectedRounds} rounds, ${totalExpectedScans} scans`,
    );

    /**
     * GROUP SCANS AND COUNT UNIQUE CHECKPOINTS PER ROUND
     * Key insight: Only count each checkpoint ONCE per round, ignore duplicates
     */
    const roundsData = {};
    let totalCompletedRounds = 0;
    let totalUniqueScans = 0; // Count unique checkpoint scans only
    let totalActualScans = allScans.length; // All scans including duplicates

    allScans.forEach((scan) => {
      const planId = scan.patrolPlanId?._id?.toString();
      const roundNumber = scan.roundNumber || 1;
      const qrCodeId = scan.qrCodeId?._id?.toString();

      if (!planId || !qrCodeId) return;

      if (!roundsData[planId]) {
        const plan = assignedPatrolPlans.find(
          (p) => p._id.toString() === planId,
        );
        roundsData[planId] = {
          planName: scan.patrolPlanId?.planName || "Unknown Plan",
          totalRounds: scan.patrolPlanId?.rounds || 1,
          totalCheckpoints: scan.patrolPlanId?.checkpoints?.length || 0,
          completedRounds: 0,
          uniqueScans: 0, // Unique checkpoint scans
          totalScans: 0, // All scans including duplicates
          rounds: {},
        };
      }

      const dateKey = moment(scan.createdAt).format("YYYY-MM-DD");
      const roundKey = `date_${dateKey}_round_${roundNumber}`;

      if (!roundsData[planId].rounds[roundKey]) {
        roundsData[planId].rounds[roundKey] = {
          occurrenceDate: dateKey,
          roundNumber: roundNumber,
          scans: [],
          scannedQRIds: new Set(),
          completedCheckpoints: 0,
          isComplete: false,
          allScans: [], // Store all scans for detailed view
        };
      }

      const roundData = roundsData[planId].rounds[roundKey];
      roundsData[planId].totalScans++; // Count every scan

      // Track all scans for detailed view
      roundData.allScans.push({
        scanId: scan._id,
        qrCodeId: qrCodeId,
        siteId: scan.qrCodeId?.siteId,
        checkpointName: scan.qrCodeId?.siteId,
        checkpointDescription: scan.qrCodeId?.description,
        actualTime: scan.createdAt,
        distanceMeters: scan.distanceMeters,
        isVerified: scan.isVerified,
        status: scan.status || "completed",
      });

      // Only count UNIQUE checkpoints per round
      if (!roundData.scannedQRIds.has(qrCodeId)) {
        roundData.scannedQRIds.add(qrCodeId);
        roundData.completedCheckpoints++;
        roundsData[planId].uniqueScans++;
        totalUniqueScans++;

        // Store the FIRST scan of this checkpoint for detailed rounds
        roundData.scans.push({
          scanId: scan._id,
          qrCodeId: qrCodeId,
          siteId: scan.qrCodeId?.siteId,
          checkpointName: scan.qrCodeId?.siteId,
          checkpointDescription: scan.qrCodeId?.description,
          actualTime: scan.createdAt,
          distanceMeters: scan.distanceMeters,
          isVerified: scan.isVerified,
          status: scan.status || "completed",
        });

        // Check if round is complete
        const planTotalCheckpoints = roundsData[planId].totalCheckpoints || 0;
        if (
          roundData.completedCheckpoints >= planTotalCheckpoints &&
          !roundData.isComplete
        ) {
          roundData.isComplete = true;
          roundsData[planId].completedRounds++;
          totalCompletedRounds++;
        }
      }
    });

    console.log(
      `✅ Actual Performance: ${totalCompletedRounds} rounds, ${totalUniqueScans} unique scans, ${totalActualScans} total scans`,
    );

    /**
     * DETAILED ROUNDS DATA - Show only unique checkpoint scans
     */
    const detailedRoundsData = [];

    Object.entries(roundsData).forEach(([planId, planData]) => {
      const patrolPlan = assignedPatrolPlans.find(
        (p) => p._id.toString() === planId,
      );

      Object.values(planData.rounds).forEach((round) => {
        // Add unique scanned checkpoints
        round.scans.forEach((scan) => {
          detailedRoundsData.push({
            date: round.occurrenceDate,
            roundNumber: round.roundNumber,
            planName: planData.planName,
            checkpointName: scan.checkpointName,
            checkpointDescription: scan.checkpointDescription,
            actualTime: scan.actualTime,
            status: scan.status,
            scanId: scan.scanId,
            distanceMeters:
              scan.distanceMeters != null
                ? Math.round(Number(scan.distanceMeters) || 0)
                : null,
            isVerified: scan.isVerified,
          });
        });

        // Add missed checkpoints
        if (patrolPlan && !round.isComplete) {
          patrolPlan.checkpoints.forEach((checkpoint) => {
            const checkpointId = checkpoint.qrId._id.toString();

            if (!round.scannedQRIds.has(checkpointId)) {
              detailedRoundsData.push({
                date: round.occurrenceDate,
                roundNumber: round.roundNumber,
                planName: planData.planName,
                checkpointName: checkpoint.qrId.siteId,
                checkpointDescription: checkpoint.qrId.description,
                actualTime: null,
                status: "missed",
                scanId: null,
                distanceMeters: null,
                isVerified: false,
              });
            }
          });
        }
      });
    });

    detailedRoundsData.sort((a, b) => {
      if (a.date === b.date) {
        if (a.roundNumber === b.roundNumber) {
          return a.checkpointName.localeCompare(b.checkpointName);
        }
        return a.roundNumber - b.roundNumber;
      }
      return new Date(b.date) - new Date(a.date);
    });

    /**
     * EXPIRED ROUNDS DATA
     */
    const expiredScans = allScans.filter((scan) => scan.status === "expired");
    const expiredRoundsData = {};

    expiredScans.forEach((scan) => {
      const key = `${scan.patrolPlanId?.toString()}_${moment(
        scan.createdAt,
      ).format("YYYY-MM-DD")}_round_${scan.roundNumber}`;
      if (!expiredRoundsData[key]) {
        expiredRoundsData[key] = {
          date: moment(scan.createdAt).format("YYYY-MM-DD"),
          planName: scan.patrolPlanId?.planName,
          roundNumber: scan.roundNumber,
          uniqueCheckpointsScanned: new Set(),
          totalScans: 0,
          expiryReason: scan.expiryReason,
          firstScanTime: scan.firstScanAt || scan.createdAt,
        };
      }
      expiredRoundsData[key].totalScans++;
      if (scan.qrCodeId) {
        expiredRoundsData[key].uniqueCheckpointsScanned.add(
          scan.qrCodeId._id.toString(),
        );
      }
    });

    const expiredRoundsList = Object.values(expiredRoundsData).map((round) => ({
      date: round.date,
      planName: round.planName,
      roundNumber: round.roundNumber,
      checkpointsScanned: round.uniqueCheckpointsScanned.size,
      totalScans: round.totalScans,
      expiryReason: round.expiryReason,
      firstScanTime: round.firstScanTime,
    }));

    /**
     * PERFORMANCE METRICS
     */
    const missedRounds = Math.max(
      0,
      totalExpectedRounds - totalCompletedRounds,
    );
    const missedScans = Math.max(0, totalExpectedScans - totalUniqueScans);

    const roundsCompletionRate =
      totalExpectedRounds > 0
        ? (totalCompletedRounds / totalExpectedRounds) * 100
        : 0;

    const scanCompletionRate =
      totalExpectedScans > 0
        ? (totalUniqueScans / totalExpectedScans) * 100
        : 0;

    const overallPerformance = roundsCompletionRate;

    return res.status(200).json(
      new ApiResponse(true, "Guard performance report generated", {
        guard: {
          _id: guard._id,
          name: guard.name,
          phone: guard.phone,
        },

        reportPeriod: {
          startDateUtc: start,
          endDateUtc: end,
          startDateLocal: userStart.format(),
          endDateLocal: userEnd.format(),
          timezone,
          totalDays,
          startDate: userStart.format(),
          endDate: userEnd.format(),
        },

        roundsPerformance: {
          summary: {
            totalExpectedRounds: totalExpectedRounds,
            totalCompletedRounds: totalCompletedRounds,
            totalMissedRounds: missedRounds,
            totalExpectedScans: totalExpectedScans,
            totalCompletedScans: totalUniqueScans, // ← Unique scans only
            totalActualScans: totalActualScans, // ← All scans including duplicates
            totalMissedScans: missedScans,
            roundsCompletionRate: roundsCompletionRate.toFixed(1) + "%",
            scanCompletionRate: scanCompletionRate.toFixed(1) + "%",
          },
          planBreakdown: Object.values(roundsData).map((plan) => ({
            planName: plan.planName,
            totalRounds: plan.totalRounds,
            completedRounds: plan.completedRounds,
            totalCheckpoints: plan.totalCheckpoints,
            uniqueScans: plan.uniqueScans,
            totalScans: plan.totalScans,
            completionRate:
              plan.totalRounds > 0
                ? ((plan.completedRounds / plan.totalRounds) * 100).toFixed(1) +
                  "%"
                : "0.0%",
          })),
        },

        detailedRounds: detailedRoundsData,

        expiredRounds: {
          total: expiredScans.length,
          uniqueRounds: expiredRoundsList.length,
          rounds: expiredRoundsList,
          note: "Scans from expired rounds are counted in performance metrics.",
        },

        performance: {
          overallScore: overallPerformance.toFixed(1),
          rating: getPerformanceRating(overallPerformance),
          breakdown: {
            roundsCompletionRate: roundsCompletionRate.toFixed(1),
            scanCompletionRate: scanCompletionRate.toFixed(1),
          },
        },

        summary: {
          progress: `${totalCompletedRounds}/${totalExpectedRounds} rounds completed`,
          scansProgress: `${totalUniqueScans}/${totalExpectedScans} checkpoints scanned`,
          efficiency: roundsCompletionRate.toFixed(1) + "%",
          status: overallPerformance >= 70 ? "Good" : "Needs Improvement",
          expiredRoundsNote:
            expiredScans.length > 0
              ? `${expiredScans.length} scans were in ${expiredRoundsList.length} expired rounds`
              : "No expired rounds",
          duplicateScansNote:
            totalActualScans > totalUniqueScans
              ? `${
                  totalActualScans - totalUniqueScans
                } duplicate scans detected`
              : "No duplicate scans",
        },
      }),
    );
  } catch (err) {
    console.error("Error in getGuardPerformanceReport:", err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

/*this is new function in case sir wants to send the email at the generation time of report */
// exports.getGuardPerformanceReport = async (req, res) => {
//   try {
//     const { guardId, startDate, endDate, shiftId } = req.body;

//     if (!guardId)
//       return res.status(400).json(new ApiResponse(false, "Guard ID required"));

//     // Access control
//     let guard;
//     if (req.user.role === "employee") {
//       guard = await User.findOne({
//         _id: guardId,
//         role: "guard",
//         companyId: req.user.id,
//       });
//     } else if (req.user.role === "supervisor") {
//       guard = await User.findOne({
//         _id: guardId,
//         role: "guard",
//         supervisor: req.user.id,
//       });
//     }
//     // console.log(guard,"4823")
//     // return true;
//     if (!guard)
//       return res
//         .status(403)
//         .json(new ApiResponse(false, "No access to this guard"));

//     // Timezone setup
//     let timezone = (req.body.timezone || "Asia/Kolkata").trim();
//     if (!moment.tz.zone(timezone)) {
//       timezone = "Asia/Kolkata";
//     }

//     // Date range handling
//     let userStart, userEnd;
//     if (startDate && startDate.trim()) {
//       userStart = moment.tz(startDate, "YYYY-MM-DD", timezone).startOf("day");
//       userEnd =
//         endDate && endDate.trim()
//           ? moment.tz(endDate, "YYYY-MM-DD", timezone).endOf("day")
//           : moment.tz(startDate, "YYYY-MM-DD", timezone).endOf("day");
//     } else if (endDate && endDate.trim()) {
//       userEnd = moment.tz(endDate, "YYYY-MM-DD", timezone).endOf("day");
//       userStart = moment.tz(endDate, "YYYY-MM-DD", timezone).startOf("day");
//     } else {
//       userEnd = moment.tz(timezone).endOf("day");
//       userStart = userEnd.clone().subtract(29, "days").startOf("day");
//     }

//     const start = userStart.clone().utc().toDate();
//     const end = userEnd.clone().utc().toDate();
//     const totalDays = userEnd.diff(userStart, "days") + 1;

//     // Base query - GET ALL SCANS (including expired)
//     const baseQuery = {
//       guard: new mongoose.Types.ObjectId(guardId),
//       createdAt: { $gte: start, $lte: end },
//     };
//     if (shiftId) baseQuery.shift = new mongoose.Types.ObjectId(shiftId);

//     // Get ALL scans (active + expired)
//     const allScans = await Patrol.find(baseQuery)
//       .populate("patrolPlanId", "planName rounds checkpoints")
//       .populate("qrCodeId", "siteId description")
//       .populate("shift", "shiftName startTime endTime timezone")
//       .sort({ createdAt: 1 }); // Sort by time to process in order

//     console.log(`📊 Found ${allScans.length} total scans (all statuses)`);

//     // Get patrol plans assigned to this guard
//     const patrolPlanQuery = {
//       "assignedGuards.guardId": new mongoose.Types.ObjectId(guardId),
//       isActive: true,
//     };
//     if (shiftId) {
//       patrolPlanQuery["assignedGuards.assignedShifts"] =
//         new mongoose.Types.ObjectId(shiftId);
//     }

//     const assignedPatrolPlans = await PatrolPlan.find(patrolPlanQuery).populate(
//       "checkpoints.qrId",
//       "siteId description",
//     );

//     console.log(`📋 Found ${assignedPatrolPlans.length} assigned patrol plans`);

//     /**
//      * CALCULATE EXPECTED VALUES BASED ON ASSIGNED PATROL PLANS
//      */
//     let totalExpectedRounds = 0;
//     let totalExpectedScans = 0;

//     for (const plan of assignedPatrolPlans) {
//       const planCheckpointsCount = plan.checkpoints.length;
//       const planRoundsPerDay = plan.rounds || 1;

//       const planStartDate = plan.startDate
//         ? moment(plan.startDate).tz(timezone)
//         : userStart.clone();
//       const planEndDate = plan.endDate
//         ? moment(plan.endDate).tz(timezone)
//         : userEnd.clone();

//       const effectiveStart = moment.max(userStart, planStartDate);
//       const effectiveEnd = moment.min(userEnd, planEndDate);

//       if (effectiveStart.isAfter(effectiveEnd)) continue;

//       const activeDays = effectiveEnd.diff(effectiveStart, "days") + 1;

//       console.log(
//         `📅 Plan "${plan.planName}": ${activeDays} days × ${planRoundsPerDay} rounds × ${planCheckpointsCount} checkpoints`,
//       );

//       totalExpectedRounds += activeDays * planRoundsPerDay;
//       totalExpectedScans +=
//         activeDays * planRoundsPerDay * planCheckpointsCount;
//     }

//     console.log(
//       `✅ Total Expected: ${totalExpectedRounds} rounds, ${totalExpectedScans} scans`,
//     );

//     /**
//      * GROUP SCANS AND COUNT UNIQUE CHECKPOINTS PER ROUND
//      * Key insight: Only count each checkpoint ONCE per round, ignore duplicates
//      */
//     const roundsData = {};
//     let totalCompletedRounds = 0;
//     let totalUniqueScans = 0; // Count unique checkpoint scans only
//     let totalActualScans = allScans.length; // All scans including duplicates

//     allScans.forEach((scan) => {
//       const planId = scan.patrolPlanId?._id?.toString();
//       const roundNumber = scan.roundNumber || 1;
//       const qrCodeId = scan.qrCodeId?._id?.toString();

//       if (!planId || !qrCodeId) return;

//       if (!roundsData[planId]) {
//         const plan = assignedPatrolPlans.find(
//           (p) => p._id.toString() === planId,
//         );
//         roundsData[planId] = {
//           planName: scan.patrolPlanId?.planName || "Unknown Plan",
//           totalRounds: scan.patrolPlanId?.rounds || 1,
//           totalCheckpoints: scan.patrolPlanId?.checkpoints?.length || 0,
//           completedRounds: 0,
//           uniqueScans: 0, // Unique checkpoint scans
//           totalScans: 0, // All scans including duplicates
//           rounds: {},
//         };
//       }

//       const dateKey = moment(scan.createdAt).format("YYYY-MM-DD");
//       const roundKey = `date_${dateKey}_round_${roundNumber}`;

//       if (!roundsData[planId].rounds[roundKey]) {
//         roundsData[planId].rounds[roundKey] = {
//           occurrenceDate: dateKey,
//           roundNumber: roundNumber,
//           scans: [],
//           scannedQRIds: new Set(),
//           completedCheckpoints: 0,
//           isComplete: false,
//           allScans: [], // Store all scans for detailed view
//         };
//       }

//       const roundData = roundsData[planId].rounds[roundKey];
//       roundsData[planId].totalScans++; // Count every scan

//       // Track all scans for detailed view
//       roundData.allScans.push({
//         scanId: scan._id,
//         qrCodeId: qrCodeId,
//         siteId: scan.qrCodeId?.siteId,
//         checkpointName: scan.qrCodeId?.siteId,
//         checkpointDescription: scan.qrCodeId?.description,
//         actualTime: scan.createdAt,
//         distanceMeters: scan.distanceMeters,
//         isVerified: scan.isVerified,
//         status: scan.status || "completed",
//       });

//       // Only count UNIQUE checkpoints per round
//       if (!roundData.scannedQRIds.has(qrCodeId)) {
//         roundData.scannedQRIds.add(qrCodeId);
//         roundData.completedCheckpoints++;
//         roundsData[planId].uniqueScans++;
//         totalUniqueScans++;

//         // Store the FIRST scan of this checkpoint for detailed rounds
//         roundData.scans.push({
//           scanId: scan._id,
//           qrCodeId: qrCodeId,
//           siteId: scan.qrCodeId?.siteId,
//           checkpointName: scan.qrCodeId?.siteId,
//           checkpointDescription: scan.qrCodeId?.description,
//           actualTime: scan.createdAt,
//           distanceMeters: scan.distanceMeters,
//           isVerified: scan.isVerified,
//           status: scan.status || "completed",
//         });

//         // Check if round is complete
//         const planTotalCheckpoints = roundsData[planId].totalCheckpoints || 0;
//         if (
//           roundData.completedCheckpoints >= planTotalCheckpoints &&
//           !roundData.isComplete
//         ) {
//           roundData.isComplete = true;
//           roundsData[planId].completedRounds++;
//           totalCompletedRounds++;
//         }
//       }
//     });

//     console.log(
//       `✅ Actual Performance: ${totalCompletedRounds} rounds, ${totalUniqueScans} unique scans, ${totalActualScans} total scans`,
//     );

//     /**
//      * DETAILED ROUNDS DATA - Show only unique checkpoint scans
//      */
//     const detailedRoundsData = [];

//     Object.entries(roundsData).forEach(([planId, planData]) => {
//       const patrolPlan = assignedPatrolPlans.find(
//         (p) => p._id.toString() === planId,
//       );

//       Object.values(planData.rounds).forEach((round) => {
//         // Add unique scanned checkpoints
//         round.scans.forEach((scan) => {
//           detailedRoundsData.push({
//             date: round.occurrenceDate,
//             roundNumber: round.roundNumber,
//             planName: planData.planName,
//             checkpointName: scan.checkpointName,
//             checkpointDescription: scan.checkpointDescription,
//             actualTime: scan.actualTime,
//             status: scan.status,
//             scanId: scan.scanId,
//             distanceMeters:
//               scan.distanceMeters != null
//                 ? Math.round(Number(scan.distanceMeters) || 0)
//                 : null,
//             isVerified: scan.isVerified,
//           });
//         });

//         // Add missed checkpoints
//         if (patrolPlan && !round.isComplete) {
//           patrolPlan.checkpoints.forEach((checkpoint) => {
//             const checkpointId = checkpoint.qrId._id.toString();

//             if (!round.scannedQRIds.has(checkpointId)) {
//               detailedRoundsData.push({
//                 date: round.occurrenceDate,
//                 roundNumber: round.roundNumber,
//                 planName: planData.planName,
//                 checkpointName: checkpoint.qrId.siteId,
//                 checkpointDescription: checkpoint.qrId.description,
//                 actualTime: null,
//                 status: "missed",
//                 scanId: null,
//                 distanceMeters: null,
//                 isVerified: false,
//               });
//             }
//           });
//         }
//       });
//     });

//     detailedRoundsData.sort((a, b) => {
//       if (a.date === b.date) {
//         if (a.roundNumber === b.roundNumber) {
//           return a.checkpointName.localeCompare(b.checkpointName);
//         }
//         return a.roundNumber - b.roundNumber;
//       }
//       return new Date(b.date) - new Date(a.date);
//     });

//     /**
//      * EXPIRED ROUNDS DATA
//      */
//     const expiredScans = allScans.filter((scan) => scan.status === "expired");
//     const expiredRoundsData = {};

//     expiredScans.forEach((scan) => {
//       const key = `${scan.patrolPlanId?.toString()}_${moment(
//         scan.createdAt,
//       ).format("YYYY-MM-DD")}_round_${scan.roundNumber}`;
//       if (!expiredRoundsData[key]) {
//         expiredRoundsData[key] = {
//           date: moment(scan.createdAt).format("YYYY-MM-DD"),
//           planName: scan.patrolPlanId?.planName,
//           roundNumber: scan.roundNumber,
//           uniqueCheckpointsScanned: new Set(),
//           totalScans: 0,
//           expiryReason: scan.expiryReason,
//           firstScanTime: scan.firstScanAt || scan.createdAt,
//         };
//       }
//       expiredRoundsData[key].totalScans++;
//       if (scan.qrCodeId) {
//         expiredRoundsData[key].uniqueCheckpointsScanned.add(
//           scan.qrCodeId._id.toString(),
//         );
//       }
//     });

//     const expiredRoundsList = Object.values(expiredRoundsData).map((round) => ({
//       date: round.date,
//       planName: round.planName,
//       roundNumber: round.roundNumber,
//       checkpointsScanned: round.uniqueCheckpointsScanned.size,
//       totalScans: round.totalScans,
//       expiryReason: round.expiryReason,
//       firstScanTime: round.firstScanTime,
//     }));

//     /**
//      * PERFORMANCE METRICS
//      */
//     const missedRounds = Math.max(
//       0,
//       totalExpectedRounds - totalCompletedRounds,
//     );
//     const missedScans = Math.max(0, totalExpectedScans - totalUniqueScans);

//     const roundsCompletionRate =
//       totalExpectedRounds > 0
//         ? (totalCompletedRounds / totalExpectedRounds) * 100
//         : 0;

//     const scanCompletionRate =
//       totalExpectedScans > 0
//         ? (totalUniqueScans / totalExpectedScans) * 100
//         : 0;

//     const overallPerformance = roundsCompletionRate;

//     res.status(200).json(
//       new ApiResponse(true, "Guard performance report generated", {
//         guard: {
//           _id: guard._id,
//           name: guard.name,
//           phone: guard.phone,
//         },

//         reportPeriod: {
//           startDateUtc: start,
//           endDateUtc: end,
//           startDateLocal: userStart.format(),
//           endDateLocal: userEnd.format(),
//           timezone,
//           totalDays,
//           startDate: userStart.format(),
//           endDate: userEnd.format(),
//         },

//         roundsPerformance: {
//           summary: {
//             totalExpectedRounds: totalExpectedRounds,
//             totalCompletedRounds: totalCompletedRounds,
//             totalMissedRounds: missedRounds,
//             totalExpectedScans: totalExpectedScans,
//             totalCompletedScans: totalUniqueScans, // ← Unique scans only
//             totalActualScans: totalActualScans, // ← All scans including duplicates
//             totalMissedScans: missedScans,
//             roundsCompletionRate: roundsCompletionRate.toFixed(1) + "%",
//             scanCompletionRate: scanCompletionRate.toFixed(1) + "%",
//           },
//           planBreakdown: Object.values(roundsData).map((plan) => ({
//             planName: plan.planName,
//             totalRounds: plan.totalRounds,
//             completedRounds: plan.completedRounds,
//             totalCheckpoints: plan.totalCheckpoints,
//             uniqueScans: plan.uniqueScans,
//             totalScans: plan.totalScans,
//             completionRate:
//               plan.totalRounds > 0
//                 ? ((plan.completedRounds / plan.totalRounds) * 100).toFixed(1) +
//                   "%"
//                 : "0.0%",
//           })),
//         },

//         detailedRounds: detailedRoundsData,

//         expiredRounds: {
//           total: expiredScans.length,
//           uniqueRounds: expiredRoundsList.length,
//           rounds: expiredRoundsList,
//           note: "Scans from expired rounds are counted in performance metrics.",
//         },

//         performance: {
//           overallScore: overallPerformance.toFixed(1),
//           rating: getPerformanceRating(overallPerformance),
//           breakdown: {
//             roundsCompletionRate: roundsCompletionRate.toFixed(1),
//             scanCompletionRate: scanCompletionRate.toFixed(1),
//           },
//         },

//         summary: {
//           progress: `${totalCompletedRounds}/${totalExpectedRounds} rounds completed`,
//           scansProgress: `${totalUniqueScans}/${totalExpectedScans} checkpoints scanned`,
//           efficiency: roundsCompletionRate.toFixed(1) + "%",
//           status: overallPerformance >= 70 ? "Good" : "Needs Improvement",
//           expiredRoundsNote:
//             expiredScans.length > 0
//               ? `${expiredScans.length} scans were in ${expiredRoundsList.length} expired rounds`
//               : "No expired rounds",
//           duplicateScansNote:
//             totalActualScans > totalUniqueScans
//               ? `${
//                   totalActualScans - totalUniqueScans
//                 } duplicate scans detected`
//               : "No duplicate scans",
//         },
//       }),
//     );
//     let to = guard.email?guard.email:"monuprajapati3882@gmail.com"
//     setImmediate(
//       async () => {
//         try {
//           const data = await buildReportData({
//             guardId,
//             startDate,
//             endDate,
//             shiftId,
//             // timezone,
//           });
//           const excelBuffer = await buildExcel(guard, data);
//           const dateLabel = `${data.reportPeriod.startDate}_to_${data.reportPeriod.endDate}`;
//           const filename = `performance_report_${guard.name?.replace(/\s+/g, "_") || guardId}_${dateLabel}.xlsx`;
//           await sendEmail({
//             to,
//             subject: `Guard Performance Report — ${guard.name || guardId} (${data.reportPeriod.startDate} to ${data.reportPeriod.endDate})`,
//             html: `
//         <h2>Guard Performance Report</h2>
//         <p><strong>Guard:</strong> ${guard.name || "-"}</p>
//         <p><strong>Period:</strong> ${data.reportPeriod.startDate} to ${data.reportPeriod.endDate}</p>
//         <p><strong>Overall Score:</strong> ${data.summary.overallScore.toFixed(1)}% (${data.summary.rating})</p>
//         <p><strong>Completed Rounds:</strong> ${data.summary.totalCompletedRounds} / ${data.summary.totalExpectedRounds}</p>
//         <p>Please find the detailed Excel report attached.</p>
//       `,
//             attachments: [
//               {
//                 filename,
//                 content: excelBuffer,
//                 contentType:
//                   "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
//               },
//             ],
//           });
//         } catch (err) {
//           console.error("setImmediate function fails for send Email", err);
//           return res.status(500).json(new ApiResponse(false, err.message));
//         }
//       },
//     );
//   } catch (err) {
//     console.error("Error in getGuardPerformanceReport:", err);
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// };

function getPerformanceRating(score) {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Very Good";
  if (score >= 70) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 50) return "Poor";
  return "Very Poor";
}
