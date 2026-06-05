const mongoose = require("mongoose");
const guardSchema = new mongoose.Schema({
  name: {type:String, required:true },
  photo: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });
module.exports = mongoose.model("Guard", guardSchema);
