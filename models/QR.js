// models/QR.js
const mongoose = require("mongoose");
const qrSchema = new mongoose.Schema(
  {
    siteId: { type: String, default: null },
    description: { type: String, default: null },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    radius: { type: Number, required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    sig: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    qrImageBase64: String, // stored optionally if you want to keep the generated QR image in DB
    isScanned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

qrSchema.index({ siteId: 1, lat: 1, lng: 1 }, { unique: true });
module.exports = mongoose.model("QR", qrSchema);
