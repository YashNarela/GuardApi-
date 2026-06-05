// const mongoose = require("mongoose");
// const moment = require("moment-timezone");

// const shiftSchema = new mongoose.Schema(
//   {
//     shiftName: { type: String, required: true },
//     assignedGuards: [
//       {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "User",
//       },
//     ],
//     isActive: { type: Boolean, default: true },
//     startTime: { type: Date, required: true },
//     endTime: { type: Date, required: true },
//     timezone: {
//       type: String,
//       default: "UTC",
//       required: true,
//     },

//     companyId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//     },

//     shiftType: { type: String, enum: ["day", "night", "both"], default: "day" },
//     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

//     // ******

//     // NEW: Recurrence configuration
//     recurrence: {
//       enabled: { type: Boolean, default: false },
//       frequency: {
//         type: String,
//         enum: ["daily", "weekly", "monthly", "custom"],
//         default: "daily",
//       },
//       // For weekly: [0,1,2,3,4,5,6] where 0=Sunday, 1=Monday, etc.
//       daysOfWeek: [{ type: Number, min: 0, max: 6 }],
//       // For monthly: [1,2,3...31] - specific dates
//       datesOfMonth: [{ type: Number, min: 1, max: 31 }],
//       // Custom interval (e.g., every 3 days)
//       customInterval: { type: Number, default: 1 },
//       // When does recurrence end?
//       endDate: { type: Date }, // null = never ends
//       endAfterOccurrences: { type: Number }, // null = never ends
//     },

//     // Track if this is a parent shift (template) or instance
//     isTemplate: { type: Boolean, default: false },
//     parentShiftId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Shift",
//     },

//     // ******
//   },

//   { timestamps: true }
// );

// // Virtual for local start time
// shiftSchema.virtual("localStartTime").get(function () {
//   return moment(this.startTime).tz(this.timezone).format();
// });

// // Virtual for local end time
// shiftSchema.virtual("localEndTime").get(function () {
//   return moment(this.endTime).tz(this.timezone).format();
// });

// // Method to check if shift is currently active
// shiftSchema.methods.isCurrentlyActive = function () {
//   const now = moment().tz(this.timezone);
//   const start = moment(this.startTime).tz(this.timezone);
//   const end = moment(this.endTime).tz(this.timezone);

//   return now.isBetween(start, end);
// };

// // Static method to find active shifts
// //  original without 
// // shiftSchema.statics.findActiveShifts = function () {
// //   const now = moment().toDate(); // Current time in UTC
// //   return this.find({
// //     isActive: true,
// //     startTime: { $lte: now },
// //     endTime: { $gte: now },
// //   });
// // };
// shiftSchema.statics.findActiveShifts = function () {
//   const now = moment();

//   return this.find({
//     isActive: true,
//     $or: [
//       // Non-recurring shifts
//       {
//         "recurrence.enabled": false,
//         startTime: { $lte: now.toDate() },
//         endTime: { $gte: now.toDate() },
//       },
//       // Recurring shifts - we'll filter these after fetching
//       {
//         "recurrence.enabled": true,
//       },
//     ],
//   }).then((shifts) => {
//     return shifts.filter((shift) => {
//       if (!shift.recurrence.enabled) return true;

//       // For recurring shifts, check if they should be active now
//       const timezone = shift.timezone || "UTC";
//       const nowInTz = now.clone().tz(timezone);

//       if (!shift.shouldOccurOnDate(nowInTz.toDate())) return false;

//       // Check time window for today
//       const originalStart = moment(shift.startTime).tz(timezone);
//       const originalEnd = moment(shift.endTime).tz(timezone);

//       const todayStart = nowInTz
//         .clone()
//         .startOf("day")
//         .hour(originalStart.hour())
//         .minute(originalStart.minute())
//         .second(originalStart.second());

//       let todayEnd = nowInTz
//         .clone()
//         .startOf("day")
//         .hour(originalEnd.hour())
//         .minute(originalEnd.minute())
//         .second(originalEnd.second());

//       if (todayEnd.isBefore(todayStart)) {
//         todayEnd.add(1, "day");
//       }

//       return nowInTz.isBetween(todayStart, todayEnd, null, "[]");
//     });
//   });
// };

// // ***********

// // Method to check if shift is currently active
// shiftSchema.methods.isCurrentlyActive = function () {
//   const now = moment().tz(this.timezone);
//   const start = moment(this.startTime).tz(this.timezone);
//   const end = moment(this.endTime).tz(this.timezone);

//   return now.isBetween(start, end);
// };

// // NEW: Method to generate next occurrence date
// shiftSchema.methods.getNextOccurrence = function (fromDate = new Date()) {
//   if (!this.recurrence.enabled) return null;

//   const current = moment(fromDate).tz(this.timezone);
//   let next = null;

//   switch (this.recurrence.frequency) {
//     case "daily":
//       next = current.clone().add(this.recurrence.customInterval || 1, "days");
//       break;

//     case "weekly":
//       // Find next occurrence based on days of week
//       for (let i = 1; i <= 7; i++) {
//         const candidate = current.clone().add(i, "days");
//         if (this.recurrence.daysOfWeek.includes(candidate.day())) {
//           next = candidate;
//           break;
//         }
//       }
//       break;

//     case "monthly":
//       // Find next occurrence based on dates of month
//       const currentDate = current.date();
//       const nextValidDate = this.recurrence.datesOfMonth.find(
//         (d) => d > currentDate
//       );

//       if (nextValidDate) {
//         next = current.clone().date(nextValidDate);
//       } else {
//         // Move to next month
//         next = current
//           .clone()
//           .add(1, "month")
//           .date(this.recurrence.datesOfMonth[0]);
//       }
//       break;

//     case "custom":
//       next = current
//         .clone()
//         .add(this.recurrence.customInterval || 1, "days");
//       break;
//   }

//   // Check if we've exceeded end date or occurrences
//   if (
//     this.recurrence.endDate &&
//     next &&
//     next.isAfter(moment(this.recurrence.endDate))
//   ) {
//     return null;
//   }

//   return next ? next.toDate() : null;
// };

// // NEW: Check if shift should occur on a specific date
// // shiftSchema.methods.shouldOccurOnDate = function (checkDate) {
// //   if (!this.recurrence.enabled) {
// //     // Non-recurring shift - check if date is between start and end
// //     const check = moment(checkDate).tz(this.timezone).startOf("day");
// //     const start = moment(this.startTime).tz(this.timezone).startOf("day");
// //     const end = moment(this.endTime).tz(this.timezone).startOf("day");
// //     return check.isSameOrAfter(start) && check.isSameOrBefore(end);
// //   }

// //   const check = moment(checkDate).tz(this.timezone);

// //   // Check if before shift starts
// //   if (check.isBefore(moment(this.startTime).tz(this.timezone))) {
// //     return false;
// //   }

// //   // Check if after recurrence ends
// //   if (
// //     this.recurrence.endDate &&
// //     check.isAfter(moment(this.recurrence.endDate).tz(this.timezone))
// //   ) {
// //     return false;
// //   }

// //   switch (this.recurrence.frequency) {
// //     case "daily":
// //       return true;

// //     case "weekly":
// //       return this.recurrence.daysOfWeek.includes(check.day());

// //     case "monthly":
// //       return this.recurrence.datesOfMonth.includes(check.date());

// //     case "custom":
// //       const daysSinceStart = check.diff(
// //         moment(this.startTime).tz(this.timezone),
// //         "days"
// //       );
// //       return daysSinceStart % (this.recurrence.customInterval || 1) === 0;

// //     default:
// //       return false;
// //   }
// // };
// // Add this to your shift schema methods
// shiftSchema.methods.shouldOccurOnDate = function (checkDate) {
//   if (!this.recurrence.enabled) {
//     // Non-recurring shift - check if date is between start and end
//     const check = moment(checkDate).tz(this.timezone).startOf("day");
//     const start = moment(this.startTime).tz(this.timezone).startOf("day");
//     const end = moment(this.endTime).tz(this.timezone).startOf("day");
//     return check.isSameOrAfter(start) && check.isSameOrBefore(end);
//   }

//   const check = moment(checkDate).tz(this.timezone);
//   const start = moment(this.startTime).tz(this.timezone);

//   // Check if before shift starts
//   if (check.isBefore(start.startOf('day'))) {
//     return false;
//   }

//   // Check if after recurrence ends
//   if (
//     this.recurrence.endDate &&
//     check.isAfter(moment(this.recurrence.endDate).tz(this.timezone))
//   ) {
//     return false;
//   }

//   switch (this.recurrence.frequency) {
//     case "daily":
//       const daysSinceStart = check.diff(start.startOf('day'), 'days');
//       return daysSinceStart % (this.recurrence.customInterval || 1) === 0;

//     case "weekly":
//       return this.recurrence.daysOfWeek.includes(check.day());

//     case "monthly":
//       return this.recurrence.datesOfMonth.includes(check.date());

//     case "custom":
//       const customDaysSinceStart = check.diff(start.startOf('day'), 'days');
//       return customDaysSinceStart % (this.recurrence.customInterval || 1) === 0;

//     default:
//       return false;
//   }
// };
// // Static method to find active shifts for a specific date/time
// shiftSchema.statics.findActiveShiftsForDate = async function (
//   targetDate,
//   companyId
// ) {
//   const target = moment(targetDate);
//   const shifts = await this.find({
//     isActive: true,
//     companyId: companyId,
//     isTemplate: { $ne: true }, // Exclude templates
//     startTime: { $lte: target.toDate() },
//     $or: [
//       { "recurrence.enabled": false, endTime: { $gte: target.toDate() } },
//       { "recurrence.enabled": true },
//     ],
//   });

//   // Filter shifts that should occur on this date
//   return shifts.filter((shift) => shift.shouldOccurOnDate(targetDate));
// };

// // Static method to get shifts for a date range
// shiftSchema.statics.findShiftsInRange = async function (
//   startDate,
//   endDate,
//   companyId,
//   guardId = null
// ) {
//   const query = {
//     isActive: true,
//     companyId: companyId,
//     isTemplate: { $ne: true },
//   };

//   if (guardId) {
//     query.assignedGuards = guardId;
//   }

//   const shifts = await this.find(query).populate("assignedGuards", "name email");

//   // Expand recurring shifts into individual occurrences
//   const expandedShifts = [];
//   const start = moment(startDate);
//   const end = moment(endDate);

//   for (const shift of shifts) {
//     if (!shift.recurrence.enabled) {
//       // Non-recurring shift
//       expandedShifts.push(shift);
//     } else {
//       // Recurring shift - generate occurrences
//       let current = moment(shift.startTime);

//       while (current.isSameOrBefore(end)) {
//         if (
//           current.isSameOrAfter(start) &&
//           shift.shouldOccurOnDate(current.toDate())
//         ) {
//           // Create a virtual occurrence
//           expandedShifts.push({
//             ...shift.toObject(),
//             _id: `${shift._id}_${current.format("YYYY-MM-DD")}`,
//             occurrenceDate: current.toDate(),
//             startTime: current
//               .clone()
//               .hour(moment(shift.startTime).hour())
//               .minute(moment(shift.startTime).minute())
//               .toDate(),
//             endTime: current
//               .clone()
//               .hour(moment(shift.endTime).hour())
//               .minute(moment(shift.endTime).minute())
//               .toDate(),
//             parentShiftId: shift._id,
//           });
//         }
//         current.add(1, "day");
//       }
//     }
//   }

//   return expandedShifts;
// };









// // ********







// module.exports = mongoose.model("Shift", shiftSchema);

const mongoose = require("mongoose");
const moment = require("moment-timezone");

const shiftSchema = new mongoose.Schema(
  {
    shiftName: { type: String, required: true },
    assignedGuards: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isActive: { type: Boolean, default: true },
    startTime: { type: Date, required: true }, // Always UTC
    endTime: { type: Date, required: true }, // Always UTC
    timezone: {
      type: String,
      default: "UTC",
      required: true,
    },

    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    shiftType: { type: String, enum: ["day", "night", "both"], default: "day" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Recurrence configuration
    recurrence: {
      enabled: { type: Boolean, default: false },
      frequency: {
        type: String,
        enum: ["daily", "weekly", "monthly"],
        default: "daily",
      },
      // For weekly: [0,1,2,3,4,5,6] where 0=Sunday, 1=Monday, etc.
      daysOfWeek: [{ type: Number, min: 0, max: 6 }],
      // For monthly: [1,2,3...31] - specific dates
      datesOfMonth: [{ type: Number, min: 1, max: 31 }],
      // Custom interval (e.g., every 2 days, every 3 weeks)
      customInterval: { type: Number, default: 1, min: 1 },
      // When does recurrence end?
      endDate: { type: Date }, // null = never ends (UTC)
      endAfterOccurrences: { type: Number }, // null = never ends
      occurrenceCount: { type: Number, default: 0 }, // Track occurrences
    },

    // Track if this is a parent shift (template) or instance
    isTemplate: { type: Boolean, default: false },
    parentShiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shift",
    },
  },
  { timestamps: true }
);

// Virtual for local start time
shiftSchema.virtual("localStartTime").get(function () {
  return moment(this.startTime).tz(this.timezone).format();
});

// Virtual for local end time
shiftSchema.virtual("localEndTime").get(function () {
  return moment(this.endTime).tz(this.timezone).format();
});

// Method to check if shift is currently active
shiftSchema.methods.isCurrentlyActive = function () {
  const timezone = this.timezone || "UTC";
  const now = moment().tz(timezone);
  const start = moment(this.startTime).tz(timezone);
  const end = moment(this.endTime).tz(timezone);

  return now.isBetween(start, end, null, "[]");
};

// NEW: Check if shift should occur on a specific date
shiftSchema.methods.shouldOccurOnDate = function (checkDate) {
  const timezone = this.timezone || "UTC";
  const check = moment(checkDate).tz(timezone).startOf("day");
  const shiftStart = moment(this.startTime).tz(timezone).startOf("day");

  console.log(
    `[shouldOccurOnDate] Checking ${check.format("YYYY-MM-DD")} for shift ${
      this.shiftName
    }`
  );

  if (!this.recurrence?.enabled) {
    // Non-recurring shift - check if date is between start and end
    const shiftEnd = moment(this.endTime).tz(timezone).startOf("day");
    const result =
      check.isSameOrAfter(shiftStart) && check.isSameOrBefore(shiftEnd);
    console.log(`[shouldOccurOnDate] Non-recurring: ${result}`);
    return result;
  }

  // Check if before recurrence starts
  if (check.isBefore(shiftStart)) {
    console.log(`[shouldOccurOnDate] Before start date`);
    return false;
  }

  // Check if after recurrence ends (by date)
  if (
    this.recurrence.endDate &&
    check.isAfter(moment(this.recurrence.endDate).tz(timezone).startOf("day"))
  ) {
    console.log(`[shouldOccurOnDate] After end date`);
    return false;
  }

  // Calculate days elapsed since shift start
  const daysSinceStart = check.diff(shiftStart, "days");
  console.log(`[shouldOccurOnDate] Days since start: ${daysSinceStart}`);

  let result = false;

  switch (this.recurrence.frequency) {
    case "daily": {
      const interval = this.recurrence.customInterval || 1;
      // FIX: Check if should occur based on interval from start date
      result = daysSinceStart % interval === 0;
      console.log(
        `[shouldOccurOnDate] Daily (interval=${interval}, daysSinceStart=${daysSinceStart}): ${result}`
      );
      break;
    }

    case "weekly": {
      const interval = this.recurrence.customInterval || 1;
      const dayOfWeek = check.day(); // 0=Sunday, 1=Monday, etc.
      const matchesDay =
        this.recurrence.daysOfWeek &&
        this.recurrence.daysOfWeek.includes(dayOfWeek);

      if (!matchesDay) {
        console.log(
          `[shouldOccurOnDate] Weekly: wrong day (${dayOfWeek}), expected ${this.recurrence.daysOfWeek}`
        );
        result = false;
        break;
      }

      // FIX: Calculate weeks from start date properly
      const weeksSinceStart = Math.floor(daysSinceStart / 7);
      result = weeksSinceStart % interval === 0;
      console.log(
        `[shouldOccurOnDate] Weekly (interval=${interval}, weeks=${weeksSinceStart}): ${result}`
      );
      break;
    }

    case "monthly": {
      const interval = this.recurrence.customInterval || 1;
      const dateOfMonth = check.date();
      const matchesDate =
        this.recurrence.datesOfMonth &&
        this.recurrence.datesOfMonth.includes(dateOfMonth);

      if (!matchesDate) {
        console.log(
          `[shouldOccurOnDate] Monthly: wrong date (${dateOfMonth}), expected ${this.recurrence.datesOfMonth}`
        );
        result = false;
        break;
      }

      // FIX: Calculate months since start properly
      const monthsSinceStart = check.diff(shiftStart, "months");
      result = monthsSinceStart % interval === 0;
      console.log(
        `[shouldOccurOnDate] Monthly (interval=${interval}, months=${monthsSinceStart}): ${result}`
      );
      break;
    }

    default:
      result = false;
  }

  console.log(`[shouldOccurOnDate] Final result: ${result}`);
  return result;
};

// Method to generate next occurrence date
shiftSchema.methods.getNextOccurrence = function (fromDate = new Date()) {
  if (!this.recurrence.enabled) return null;

  const timezone = this.timezone || "UTC";
  const current = moment(fromDate).tz(timezone).startOf("day");
  const shiftStart = moment(this.startTime).tz(timezone).startOf("day");
  let next = null;

  console.log(
    `[getNextOccurrence] Finding next for ${
      this.shiftName
    } from ${current.format("YYYY-MM-DD")}`
  );

  // Check occurrence limit
  if (
    this.recurrence.endAfterOccurrences &&
    this.recurrence.occurrenceCount >= this.recurrence.endAfterOccurrences
  ) {
    console.log(`[getNextOccurrence] Max occurrences reached`);
    return null;
  }

  switch (this.recurrence.frequency) {
    case "daily": {
      const interval = this.recurrence.customInterval || 1;
      // Find next valid day
      for (let i = 1; i <= 365; i++) {
        const candidate = current.clone().add(i, "days");
        const daysSinceStart = candidate.diff(shiftStart, "days");

        if (daysSinceStart >= 0 && daysSinceStart % interval === 0) {
          next = candidate;
          console.log(
            `[getNextOccurrence] Daily: Found ${next.format("YYYY-MM-DD")}`
          );
          break;
        }
      }
      break;
    }

    case "weekly": {
      const interval = this.recurrence.customInterval || 1;
      // Find next occurrence on specified day
      for (let i = 1; i <= 365; i++) {
        const candidate = current.clone().add(i, "days");

        if (!this.recurrence.daysOfWeek.includes(candidate.day())) continue;

        const daysSinceStart = candidate.diff(shiftStart, "days");
        const weeksSinceStart = Math.floor(daysSinceStart / 7);

        if (weeksSinceStart >= 0 && weeksSinceStart % interval === 0) {
          next = candidate;
          console.log(
            `[getNextOccurrence] Weekly: Found ${next.format("YYYY-MM-DD")}`
          );
          break;
        }
      }
      break;
    }

    case "monthly": {
      const interval = this.recurrence.customInterval || 1;
      let candidate = current.clone();

      for (let i = 0; i < 365; i++) {
        if (this.recurrence.datesOfMonth.includes(candidate.date())) {
          const daysSinceStart = candidate.diff(shiftStart, "days");
          const monthsSinceStart = candidate.diff(shiftStart, "months");

          if (daysSinceStart >= 0 && monthsSinceStart % interval === 0) {
            next = candidate;
            console.log(
              `[getNextOccurrence] Monthly: Found ${next.format("YYYY-MM-DD")}`
            );
            break;
          }
        }
        candidate.add(1, "day");
      }
      break;
    }

    default:
      return null;
  }

  // Verify end date not exceeded
  if (
    next &&
    this.recurrence.endDate &&
    next.isAfter(moment(this.recurrence.endDate).tz(timezone).startOf("day"))
  ) {
    console.log(`[getNextOccurrence] End date exceeded`);
    return null;
  }

  return next ? next.toDate() : null;
};

// Static method to find active shifts for current time
shiftSchema.statics.findActiveShifts = function () {
  const now = moment();

  return this.find({
    isActive: true,
    isTemplate: { $ne: true },
    $or: [
      // Non-recurring shifts - simple time check
      {
        "recurrence.enabled": false,
        startTime: { $lte: now.toDate() },
        endTime: { $gte: now.toDate() },
      },
      // Recurring shifts - check if started
      {
        "recurrence.enabled": true,
        startTime: { $lte: now.toDate() },
      },
    ],
  }).then((shifts) => {
    return shifts.filter((shift) => {
      if (!shift.recurrence.enabled) return true;

      const timezone = shift.timezone || "UTC";
      const nowInTz = now.clone().tz(timezone);

      if (!shift.shouldOccurOnDate(nowInTz.toDate())) return false;

      // Check time window for today
      const originalStart = moment(shift.startTime).tz(timezone);
      const originalEnd = moment(shift.endTime).tz(timezone);

      const todayStart = nowInTz
        .clone()
        .startOf("day")
        .hour(originalStart.hour())
        .minute(originalStart.minute())
        .second(originalStart.second());

      let todayEnd = nowInTz
        .clone()
        .startOf("day")
        .hour(originalEnd.hour())
        .minute(originalEnd.minute())
        .second(originalEnd.second());

      if (todayEnd.isBefore(todayStart)) {
        todayEnd.add(1, "day");
      }

      return nowInTz.isBetween(todayStart, todayEnd, null, "[]");
    });
  });
};

// Static method to find active shifts for a specific date
shiftSchema.statics.findActiveShiftsForDate = async function (
  targetDate,
  companyId
) {
  const target = moment(targetDate);
  const targetDateOnly = target.clone().startOf("day");

  console.log(
    `[findActiveShiftsForDate] Searching for ${targetDateOnly.format(
      "YYYY-MM-DD"
    )}`
  );

  const shifts = await this.find({
    isActive: true,
    companyId: companyId,
    isTemplate: { $ne: true },
    $or: [
      // Non-recurring: check if target is between start and end
      {
        "recurrence.enabled": false,
        startTime: { $lte: target.toDate() },
        endTime: { $gte: target.toDate() },
      },
      // Recurring: check if shift started and not ended
      {
        "recurrence.enabled": true,
        startTime: { $lte: target.toDate() },
        $or: [
          { "recurrence.endDate": { $exists: false } },
          { "recurrence.endDate": { $gte: targetDateOnly.toDate() } },
        ],
      },
    ],
  });

  console.log(
    `[findActiveShiftsForDate] Found ${shifts.length} potential shifts`
  );

  const filtered = shifts.filter((shift) =>
    shift.shouldOccurOnDate(targetDate)
  );
  console.log(
    `[findActiveShiftsForDate] After filtering: ${filtered.length} shifts`
  );

  return filtered;
};

// Static method to get shifts for a date range (expands recurring shifts)
shiftSchema.statics.findShiftsInRange = async function (
  startDate,
  endDate,
  companyId,
  guardId = null
) {
  const query = {
    isActive: true,
    companyId: companyId,
    isTemplate: { $ne: true },
  };

  if (guardId) {
    query.assignedGuards = guardId;
  }

  const shifts = await this.find(query).populate(
    "assignedGuards",
    "name email"
  );

  // Expand recurring shifts into individual occurrences
  const expandedShifts = [];
  const start = moment(startDate).startOf("day");
  const end = moment(endDate).endOf("day");

  for (const shift of shifts) {
    if (!shift.recurrence.enabled) {
      // Non-recurring shift
      expandedShifts.push(shift);
    } else {
      // Recurring shift - generate occurrences
      let current = moment(shift.startTime)
        .tz(shift.timezone || "UTC")
        .startOf("day");

      while (current.isSameOrBefore(end)) {
        if (
          current.isSameOrAfter(start) &&
          shift.shouldOccurOnDate(current.toDate())
        ) {
          // Create a virtual occurrence
          const originalStart = moment(shift.startTime).tz(
            shift.timezone || "UTC"
          );
          const originalEnd = moment(shift.endTime).tz(shift.timezone || "UTC");

          const occurrenceStart = current
            .clone()
            .hour(originalStart.hour())
            .minute(originalStart.minute())
            .second(originalStart.second());

          let occurrenceEnd = current
            .clone()
            .hour(originalEnd.hour())
            .minute(originalEnd.minute())
            .second(originalEnd.second());

          if (occurrenceEnd.isBefore(occurrenceStart)) {
            occurrenceEnd.add(1, "day");
          }

          expandedShifts.push({
            ...shift.toObject(),
            _id: `${shift._id}_${current.format("YYYY-MM-DD")}`,
            occurrenceDate: current.toDate(),
            startTime: occurrenceStart.toDate(),
            endTime: occurrenceEnd.toDate(),
            parentShiftId: shift._id,
            isRecurringInstance: true,
          });
        }
        current.add(1, "day");
      }
    }
  }

  return expandedShifts;
};

module.exports = mongoose.model("Shift", shiftSchema);