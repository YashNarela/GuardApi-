const mongoose = require("mongoose");
const moment = require("moment-timezone");
const ExcelJS = require("exceljs");
const Patrol = require("../models/Patrol");
const PatrolPlan = require("../models/PatrolPlan");
const User = require("../models/User");
const ApiResponse = require("../utils/apiResponse");

// ─── helpers ──────────────────────────────────────────────────────────────────

function getPerformanceRating(score) {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Very Good";
  if (score >= 70) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 50) return "Poor";
  return "Very Poor";
}

async function buildReportData({
  guardId,
  startDate,
  endDate,
  shiftId,
  timezone = "Asia/Kolkata",
}) {
  if (!moment.tz.zone(timezone)) timezone = "Asia/Kolkata";

  let userStart, userEnd;
  if (startDate) {
    userStart = moment.tz(startDate, "YYYY-MM-DD", timezone).startOf("day");
    userEnd = endDate
      ? moment.tz(endDate, "YYYY-MM-DD", timezone).endOf("day")
      : moment.tz(startDate, "YYYY-MM-DD", timezone).endOf("day");
  } else if (endDate) {
    userEnd = moment.tz(endDate, "YYYY-MM-DD", timezone).endOf("day");
    userStart = moment.tz(endDate, "YYYY-MM-DD", timezone).startOf("day");
  } else {
    userEnd = moment.tz(timezone).endOf("day");
    userStart = userEnd.clone().subtract(29, "days").startOf("day");
  }

  const start = userStart.clone().utc().toDate();
  const end = userEnd.clone().utc().toDate();
  const totalDays = userEnd.diff(userStart, "days") + 1;

  const baseQuery = {
    guard: new mongoose.Types.ObjectId(guardId),
    createdAt: { $gte: start, $lte: end },
  };
  if (shiftId) baseQuery.shift = new mongoose.Types.ObjectId(shiftId);

  const allScans = await Patrol.find(baseQuery)
    .populate("patrolPlanId", "planName rounds checkpoints")
    .populate("qrCodeId", "siteId description")
    .populate("shift", "shiftName startTime endTime timezone")
    .sort({ createdAt: 1 });

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
    totalExpectedRounds += activeDays * planRoundsPerDay;
    totalExpectedScans += activeDays * planRoundsPerDay * planCheckpointsCount;
  }

  const roundsData = {};
  let totalCompletedRounds = 0;
  let totalUniqueScans = 0;
  const totalActualScans = allScans.length;

  allScans.forEach((scan) => {
    const planId = scan.patrolPlanId?._id?.toString();
    const roundNumber = scan.roundNumber || 1;
    const qrCodeId = scan.qrCodeId?._id?.toString();
    if (!planId || !qrCodeId) return;

    if (!roundsData[planId]) {
      roundsData[planId] = {
        planName: scan.patrolPlanId?.planName || "Unknown Plan",
        totalRounds: scan.patrolPlanId?.rounds || 1,
        totalCheckpoints: scan.patrolPlanId?.checkpoints?.length || 0,
        completedRounds: 0,
        uniqueScans: 0,
        totalScans: 0,
        rounds: {},
      };
    }

    const dateKey = moment(scan.createdAt).tz(timezone).format("YYYY-MM-DD");
    const roundKey = `date_${dateKey}_round_${roundNumber}`;

    if (!roundsData[planId].rounds[roundKey]) {
      roundsData[planId].rounds[roundKey] = {
        occurrenceDate: dateKey,
        roundNumber,
        scans: [],
        scannedQRIds: new Set(),
        completedCheckpoints: 0,
        isComplete: false,
      };
    }

    const roundData = roundsData[planId].rounds[roundKey];
    roundsData[planId].totalScans++;

    if (!roundData.scannedQRIds.has(qrCodeId)) {
      roundData.scannedQRIds.add(qrCodeId);
      roundData.completedCheckpoints++;
      roundsData[planId].uniqueScans++;
      totalUniqueScans++;

      roundData.scans.push({
        qrCodeId,
        siteId: scan.qrCodeId?.siteId,
        checkpointName: scan.qrCodeId?.siteId,
        checkpointDescription: scan.qrCodeId?.description,
        actualTime: scan.createdAt,
        distanceMeters:
          scan.distanceMeters != null
            ? Math.round(Number(scan.distanceMeters) || 0)
            : null,
        isVerified: scan.isVerified,
        status: scan.status || "completed",
      });

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

  // Build detailed rows
  const detailedRows = [];
  Object.entries(roundsData).forEach(([planId, planData]) => {
    const patrolPlan = assignedPatrolPlans.find(
      (p) => p._id.toString() === planId,
    );
    Object.values(planData.rounds).forEach((round) => {
      round.scans.forEach((scan) => {
        detailedRows.push({
          date: round.occurrenceDate,
          roundNumber: round.roundNumber,
          planName: planData.planName,
          checkpointName: scan.checkpointName || "-",
          checkpointDescription: scan.checkpointDescription || "-",
          actualTime: scan.actualTime,
          status: scan.status,
          distanceMeters: scan.distanceMeters,
          isVerified: scan.isVerified,
        });
      });

      if (patrolPlan && !round.isComplete) {
        patrolPlan.checkpoints.forEach((cp) => {
          if (!round.scannedQRIds.has(cp.qrId._id.toString())) {
            detailedRows.push({
              date: round.occurrenceDate,
              roundNumber: round.roundNumber,
              planName: planData.planName,
              checkpointName: cp.qrId.siteId || "-",
              checkpointDescription: cp.qrId.description || "-",
              actualTime: null,
              status: "missed",
              distanceMeters: null,
              isVerified: false,
            });
          }
        });
      }
    });
  });

  detailedRows.sort((a, b) => {
    if (a.date === b.date) {
      return a.roundNumber - b.roundNumber;
    }
    return new Date(b.date) - new Date(a.date);
  });

  // Expired rounds
  const expiredScans = allScans.filter((s) => s.status === "expired");
  const expiredMap = {};
  expiredScans.forEach((scan) => {
    const key = `${scan.patrolPlanId?.toString()}_${moment(scan.createdAt).format("YYYY-MM-DD")}_round_${scan.roundNumber}`;
    if (!expiredMap[key]) {
      expiredMap[key] = {
        date: moment(scan.createdAt).tz(timezone).format("YYYY-MM-DD"),
        planName: scan.patrolPlanId?.planName || "-",
        roundNumber: scan.roundNumber,
        uniqueCheckpoints: new Set(),
        expiryReason: scan.expiryReason,
        firstScanTime: scan.firstScanAt || scan.createdAt,
      };
    }
    if (scan.qrCodeId)
      expiredMap[key].uniqueCheckpoints.add(scan.qrCodeId._id.toString());
  });

  const expiredRows = Object.values(expiredMap).map((r) => ({
    date: r.date,
    planName: r.planName,
    roundNumber: r.roundNumber,
    checkpointsScanned: r.uniqueCheckpoints.size,
    expiryReason: r.expiryReason || "-",
    firstScanTime: r.firstScanTime,
  }));

  const missedRounds = Math.max(0, totalExpectedRounds - totalCompletedRounds);
  const roundsCompletionRate =
    totalExpectedRounds > 0
      ? (totalCompletedRounds / totalExpectedRounds) * 100
      : 0;
  const scanCompletionRate =
    totalExpectedScans > 0 ? (totalUniqueScans / totalExpectedScans) * 100 : 0;

  return {
    reportPeriod: {
      startDate: userStart.format("YYYY-MM-DD"),
      endDate: userEnd.format("YYYY-MM-DD"),
      timezone,
      totalDays,
    },
    summary: {
      totalExpectedRounds,
      totalCompletedRounds,
      totalMissedRounds: missedRounds,
      totalExpectedScans,
      totalCompletedScans: totalUniqueScans,
      roundsCompletionRate,
      scanCompletionRate,
      overallScore: roundsCompletionRate,
      rating: getPerformanceRating(roundsCompletionRate),
    },
    planBreakdown: Object.values(roundsData).map((p) => ({
      planName: p.planName,
      totalRounds: p.totalRounds,
      completedRounds: p.completedRounds,
      totalCheckpoints: p.totalCheckpoints,
      uniqueScans: p.uniqueScans,
      completionRate:
        p.totalRounds > 0
          ? ((p.completedRounds / p.totalRounds) * 100).toFixed(1) + "%"
          : "0.0%",
    })),
    detailedRows,
    expiredRows,
  };
}

// ─── Excel builder ─────────────────────────────────────────────────────────────

async function buildExcel(guard, data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Guard Patrol System";
  wb.created = new Date();

  const headerFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E79" },
  };
  const headerFont = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  const borderStyle = { style: "thin", color: { argb: "FFD0D0D0" } };
  const allBorders = {
    top: borderStyle,
    left: borderStyle,
    bottom: borderStyle,
    right: borderStyle,
  };

  function styleHeader(row) {
    row.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = allBorders;
    });
    row.height = 22;
  }

  // ── Sheet 1: Summary ──
  const ws1 = wb.addWorksheet("Summary");
  ws1.columns = [
    { header: "Field", key: "field", width: 32 },
    { header: "Value", key: "value", width: 40 },
  ];
  styleHeader(ws1.getRow(1));

  const rows1 = [
    ["Guard Name", guard.name || "-"],
    ["Guard Phone", guard.phone || "-"],
    [
      "Report Period",
      `${data.reportPeriod.startDate} → ${data.reportPeriod.endDate}`,
    ],
    ["Timezone", data.reportPeriod.timezone],
    ["Total Days", data.reportPeriod.totalDays],
    ["", ""],
    ["Expected Rounds", data.summary.totalExpectedRounds],
    ["Completed Rounds", data.summary.totalCompletedRounds],
    ["Missed Rounds", data.summary.totalMissedRounds],
    ["Expected Scans", data.summary.totalExpectedScans],
    ["Completed Scans", data.summary.totalCompletedScans],
    [
      "Rounds Completion Rate",
      data.summary.roundsCompletionRate.toFixed(1) + "%",
    ],
    ["Scan Completion Rate", data.summary.scanCompletionRate.toFixed(1) + "%"],
    ["Overall Score", data.summary.overallScore.toFixed(1) + "%"],
    ["Performance Rating", data.summary.rating],
  ];

  rows1.forEach(([field, value]) => {
    const row = ws1.addRow({ field, value });
    row.eachCell((cell) => {
      cell.border = allBorders;
      cell.alignment = { vertical: "middle" };
    });
  });

  // ── Sheet 2: Plan Breakdown ──
  const ws2 = wb.addWorksheet("Plan Breakdown");
  ws2.columns = [
    { header: "Plan Name", key: "planName", width: 28 },
    { header: "Total Rounds", key: "totalRounds", width: 16 },
    { header: "Completed Rounds", key: "completedRounds", width: 20 },
    { header: "Total Checkpoints", key: "totalCheckpoints", width: 20 },
    { header: "Unique Scans", key: "uniqueScans", width: 16 },
    { header: "Completion Rate", key: "completionRate", width: 18 },
  ];
  styleHeader(ws2.getRow(1));
  data.planBreakdown.forEach((p) => {
    const row = ws2.addRow(p);
    row.eachCell((cell) => {
      cell.border = allBorders;
      cell.alignment = { vertical: "middle" };
    });
  });

  // ── Sheet 3: Detailed Rounds ──
  const ws3 = wb.addWorksheet("Detailed Rounds");
  ws3.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Round #", key: "roundNumber", width: 10 },
    { header: "Plan Name", key: "planName", width: 26 },
    { header: "Checkpoint", key: "checkpointName", width: 22 },
    { header: "Description", key: "checkpointDescription", width: 28 },
    { header: "Scan Time", key: "actualTime", width: 22 },
    { header: "Status", key: "status", width: 14 },
    { header: "Distance (m)", key: "distanceMeters", width: 15 },
    { header: "Verified", key: "isVerified", width: 12 },
  ];
  styleHeader(ws3.getRow(1));
  data.detailedRows.forEach((r) => {
    const row = ws3.addRow({
      ...r,
      actualTime: r.actualTime
        ? moment(r.actualTime)
            .tz(data.reportPeriod.timezone)
            .format("YYYY-MM-DD HH:mm:ss")
        : "-",
      isVerified: r.isVerified ? "Yes" : "No",
      distanceMeters: r.distanceMeters != null ? r.distanceMeters : "-",
    });
    const statusCell = row.getCell("status");
    if (r.status === "missed") {
      statusCell.font = { color: { argb: "FFCC0000" }, bold: true };
    } else if (r.status === "completed") {
      statusCell.font = { color: { argb: "FF1A7A4A" }, bold: true };
    } else if (r.status === "expired") {
      statusCell.font = { color: { argb: "FFFF8C00" }, bold: true };
    }
    row.eachCell((cell) => {
      cell.border = allBorders;
      cell.alignment = { vertical: "middle" };
    });
  });

  // ── Sheet 4: Expired Rounds ──
  if (data.expiredRows.length > 0) {
    const ws4 = wb.addWorksheet("Expired Rounds");
    ws4.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Plan Name", key: "planName", width: 26 },
      { header: "Round #", key: "roundNumber", width: 10 },
      { header: "Checkpoints Scanned", key: "checkpointsScanned", width: 22 },
      { header: "First Scan Time", key: "firstScanTime", width: 22 },
      { header: "Expiry Reason", key: "expiryReason", width: 40 },
    ];
    styleHeader(ws4.getRow(1));
    data.expiredRows.forEach((r) => {
      const row = ws4.addRow({
        ...r,
        firstScanTime: r.firstScanTime
          ? moment(r.firstScanTime)
              .tz(data.reportPeriod.timezone)
              .format("YYYY-MM-DD HH:mm:ss")
          : "-",
      });
      row.eachCell((cell) => {
        cell.border = allBorders;
        cell.alignment = { vertical: "middle" };
      });
    });
  }

  return wb.xlsx.writeBuffer();
}

// ─── Controller — generates and downloads report (no email) ────────────────────

const sendPerformanceReportEmail = async (req, res) => {
  try {
    const { guardId, startDate, endDate, shiftId, timezone } = req.body;

    if (!guardId)
      return res.status(400).json(new ApiResponse(false, "guardId is required"));
    if (!mongoose.Types.ObjectId.isValid(guardId))
      return res.status(400).json(new ApiResponse(false, "Invalid guardId"));

    const guard = await User.findOne({ _id: guardId, role: "guard" }).select("name phone email");
    if (!guard)
      return res.status(404).json(new ApiResponse(false, "Guard not found"));

    const data = await buildReportData({ guardId, startDate, endDate, shiftId, timezone });
    const excelBuffer = await buildExcel(guard, data);

    const dateLabel = `${data.reportPeriod.startDate}_to_${data.reportPeriod.endDate}`;
    const filename = `performance_report_${guard.name?.replace(/\s+/g, "_") || guardId}_${dateLabel}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(excelBuffer);
  } catch (err) {
    console.error("Error in generatePerformanceReport:", err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// /* change the  export for reusing it */
module.exports = {
  sendPerformanceReportEmail,
  buildReportData,
  buildExcel
}