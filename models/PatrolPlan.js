const mongoose = require("mongoose");



const patrolPlanSchema = new mongoose.Schema(
  {
    planName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    checkpoints: [
      {
        qrId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "QR",
          required: true,
        },
        siteId: {
          type: String,
        },
        expectedTime: {
          type: Number, // minutes
          default: 5,
        },
        sequence: {
          type: Number, // order of checkpoint
          required: true,
        },
      },
    ],

    // Guards assigned to this patrol plan
    assignedGuards: [
      {
        guardId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        // Track which shifts this guard will patrol during
        assignedShifts: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Shift",
          },
        ],
      },
    ],

    frequency: {
      type: String,
      enum: ["daily", "weekly", "monthly", "custom"],
      default: "daily",
    },

    // Custom frequency settings
    customFrequency: {
      days: [
        {
          type: String,
          enum: [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
          ],
        },
      ],
      interval: { type: Number }, // every X days/weeks/months
    },

    isActive: {
      type: Boolean,
      default: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Date range for the patrol plan
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    rounds: { type: Number, default: 1 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PatrolPlan", patrolPlanSchema);