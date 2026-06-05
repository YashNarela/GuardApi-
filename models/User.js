
const mongoose = require("mongoose");
const Shift=require("./Shift")

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, sparse: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "employee", "supervisor", "guard"],
      required: true,
    },

    phone: { type: String, unique: true, sparse: true },
    address: String,
    isActive: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    photo: String,
    company: String,
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // direct supervisor or employee
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // top-level employee
    supervisors: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    guards: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    supervisor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    deviceToken: String, // FCM token
  },
  { timestamps: true }
);

// userSchema.index({ email: 1 }, { unique: true, sparse: true });

userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } }
);

// userSchema.index({ phone: 1 }, { unique: true, sparse: true });

userSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: "string" } } }
);


module.exports = mongoose.model("User", userSchema);
