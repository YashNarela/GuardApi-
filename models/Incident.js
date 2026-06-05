const mongoose = require("mongoose");

const incidentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      // required: true
    },
    description: {
      type: String,
      // required: true
    },
    type: {
      type: String,
      enum: [
        "security",
        "safety",
        "maintenance",
        "medical",
        "fire",
        "theft",
        "vandalism",
        "other",
      ],

      default: "other",
      // required: true
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    location: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String },
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // supervisor(s) /
      },
    ],

    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: ["reported", "investigating", "in-progress", "resolved", "closed"],
      default: "reported",
    },

    //  added two things in the incident
    qrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QR",
    },
    siteInfo: {
      siteId: String,
      description: String,
      lat: Number,
      lng: Number,
      radius: Number,
    },

    isFromQRScan: {
      type: Boolean,
      default: false,
    },

    // ⬆️
    photos: [
      {
        type: String,
      },
    ],

    video: {
      type: String,
    },

    resolutionNotes: {
      type: String,
    },
    resolvedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Incident", incidentSchema);

