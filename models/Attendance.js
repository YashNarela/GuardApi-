const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    guard: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shift",
    },
    date: {
      type: Date,
      required: true,
    },
    loginTime: {
      type: Date,
      required: true,
    },
    logoutTime: {
      type: Date,
    },
    expectedLoginTime: {
      type: Date,
    },
    expectedLogoutTime: {
      type: Date,
    },
    totalHours: {
      type: Number,
      default: 0,
    },
    expectedHours: {
      type: Number,
    },
    status: {
      type: String,
      enum: ["on-duty", "off-duty", "absent", "late"],
      default: "on-duty",
    },
    lateBy: {
      type: Number, // minutes
      default: 0,
    },
    earlyLeave: {
      type: Number, // minutes
      default: 0,
    },
    location: {
      login: { lat: Number, lng: Number },
      logout: { lat: Number, lng: Number },
    },
  },
  { timestamps: true }
);

// attendanceSchema.index({ guard: 1, date: 1 });
// attendanceSchema.index({ shift: 1, date: 1 });

module.exports = mongoose.model("Attendance", attendanceSchema);
  