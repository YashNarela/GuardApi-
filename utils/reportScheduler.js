const cron = require("node-cron");
const User = require("../models/User");
const sendEmail = require("./sendEmail");
const { buildReportData, buildExcel } = require("../controllers/schedulerController");
const moment = require("moment-timezone");

const REPORT_RECIPIENTS = [
  "srivatsan@rajratan.co.in",
  "selvaraju@rajratan.co.in",
  "it.ch@rajratan.co.in",
  "santosh@rajratan.co.in",
  "security.ch@rajratan.co.in",
  "yashnarela01@gmail.com",
  "skukreja@flair-solution.com",
];

const TIMEZONE = "Asia/Kolkata";
let isRunning = false; // prevent overlapping runs

async function sendDailyReports() {
  if (isRunning) {
    console.log("[ReportScheduler] Already running, skipping this trigger.");
    return;
  }
  isRunning = true;

  try {
    // At midnight the day just ended — report on that completed day
    const reportDate = moment.tz(TIMEZONE).subtract(1, "day").format("YYYY-MM-DD");
    console.log(`[ReportScheduler] Building daily report for ${reportDate}`);

    const guards = await User.find({ role: "guard", isActive: true }).select("_id name phone email");

    if (!guards.length) {
      console.log("[ReportScheduler] No active guards found, skipping.");
      return;
    }

    const attachments = [];
    const summaryRows = [];

    for (const guard of guards) {
      try {
        const data = await buildReportData({
          guardId: guard._id.toString(),
          startDate: reportDate,
          endDate: reportDate,
          timezone: TIMEZONE,
        });

        const excelBuffer = await buildExcel(guard, data);
        const filename = `report_${guard.name?.replace(/\s+/g, "_") || guard._id}_${reportDate}.xlsx`;

        attachments.push({
          filename,
          content: excelBuffer,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        summaryRows.push(`
          <tr>
            <td style="padding:6px 12px;border:1px solid #ddd;">${guard.name || "-"}</td>
            <td style="padding:6px 12px;border:1px solid #ddd;text-align:center;">${data.summary.totalCompletedRounds} / ${data.summary.totalExpectedRounds}</td>
            <td style="padding:6px 12px;border:1px solid #ddd;text-align:center;">${data.summary.overallScore.toFixed(1)}%</td>
            <td style="padding:6px 12px;border:1px solid #ddd;text-align:center;">${data.summary.rating}</td>
          </tr>
        `);

        console.log(`[ReportScheduler] Built report for: ${guard.name}`);
      } catch (err) {
        console.error(`[ReportScheduler] Failed for guard ${guard.name}:`, err.message);
      }
    }

    if (!attachments.length) {
      console.log("[ReportScheduler] No reports generated, skipping email.");
      return;
    }

    await sendEmail({
      to: REPORT_RECIPIENTS,
      subject: `Daily Guard Performance Report — ${reportDate}`,
      html: `
        <h2 style="color:#1F4E79;">Daily Guard Performance Report</h2>
        <p><strong>Date:</strong> ${reportDate}</p>
        <p><strong>Total Guards:</strong> ${attachments.length}</p>
        <br/>
        <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px;">
          <thead>
            <tr style="background:#1F4E79;color:#fff;">
              <th style="padding:8px 12px;border:1px solid #ddd;">Guard Name</th>
              <th style="padding:8px 12px;border:1px solid #ddd;">Rounds (Done/Expected)</th>
              <th style="padding:8px 12px;border:1px solid #ddd;">Score</th>
              <th style="padding:8px 12px;border:1px solid #ddd;">Rating</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows.join("")}
          </tbody>
        </table>
        <br/>
        <p style="color:#555;">Individual Excel reports for each guard are attached.</p>
      `,
      attachments,
    });

    console.log(`[ReportScheduler] One email sent with ${attachments.length} attachments.`);
  } finally {
    isRunning = false;
  }
}

function startReportScheduler() {
  // Runs every day at 12:00 AM IST (midnight)
  cron.schedule("0 0 * * *", sendDailyReports, {
    timezone: TIMEZONE,
  });

  console.log("[ReportScheduler] Scheduled: daily reports at 12:00 AM IST (midnight)");
}

module.exports = { startReportScheduler, sendDailyReports };
