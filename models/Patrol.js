const mongoose = require("mongoose");
const patrolSchema = new mongoose.Schema(
  {
    patrolPlanId: { type: mongoose.Schema.Types.ObjectId, ref: "PatrolPlan" },
    guard: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    shift: { type: mongoose.Schema.Types.ObjectId, ref: "Shift" },
    qrCodeId: { type: mongoose.Schema.Types.ObjectId, ref: "QR" },
    roundNumber: { type: Number, required: true }, // ✅ controller sets this
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    location: { lat: Number, lng: Number },
    distanceMeters: Number,
    photo: String,
    isVerified: Boolean,

    firstScanAt: { type: Date },
    lastScanAt: { type: Date },
    scanCount: { type: Number, default: 1 },

    // ******

    roundStartTime: { type: Date, default: null }, // When first checkpoint of round was scanned (UTC)
    status: {
      type: String,
      enum: ["in_progress", "completed", "expired"],
      default: "in_progress",
    },
    expiryReason: String,

    // ******
  },
  { timestamps: true }
);
module.exports = mongoose.model("Patrol", patrolSchema);
  