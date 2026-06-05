// controllers/guardController.js
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const ApiResponse = require("../utils/apiResponse");
const Shift = require("../models/Shift");
const Patrol = require("../models/Patrol");
const QR = require("../models/QR");

const PatrolPlan=require("../models/PatrolPlan")
const mongoose = require("mongoose");


// ✅ Create Guard (Employee role)
exports.createGuard = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json(new ApiResponse(false, "All fields are required"));
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res
        .status(400)
        .json(new ApiResponse(false, "Email already exists"));
    }

    const hash = await bcrypt.hash(password, 10);

    const guard = await User.create({
      name,
      email,
      password: hash,
      role: "guard",
      createdBy: req.user.id,
    });

    const out = {
      id: guard._id,
      name: guard.name,
      email: guard.email,
      role: guard.role,
    };

    return res
      .status(201) // ✅ resource created
      .json(
        new ApiResponse(true, "Guard created successfully", { guard: out })
      );
  } catch (err) {
    return res
      .status(500)
      .json(new ApiResponse(false, "Server error: " + err.message));
  }
};

// ✅ Get Guards (with search, pagination, sort)
exports.getGuards = async (req, res) => {
  try {
    const { name, page = 1, limit = 20, sort = "desc" } = req.query;

    const q = { role: "guard" };
    if (name) q.name = { $regex: name, $options: "i" };

       // Only show guards created by this employee
    if (req.user.role === "supervisor") {
      q.createdBy = new mongoose.Types.ObjectId(req.user.id);
    } else if (req.user.role === "employee") {
      q.companyId = new mongoose.Types.ObjectId(req.user.id);
    }


    if (name) q.name = { $regex: name, $options: "i" };


    const sortObj = { createdAt: sort === "asc" ? 1 : -1 };

    const guards = await User.find(q)
     
      .sort(sortObj)
      .skip((page - 1) * limit)
      .limit(Number(limit)).populate("supervisor", "name email role").select("+password"); 

    const total = await User.countDocuments(q);

    return res.status(200).json(
      new ApiResponse(true, "Guards fetched successfully", {
        guards,
        total,
        page: Number(page),
        limit: Number(limit),
      })
    );
  } catch (err) {
    return res
      .status(500)
      .json(new ApiResponse(false, "Server error: " + err.message));
  }
};
// exports.updateGuard = async (req, res) => {
//   try {
//     let updateData = { ...req.body };

//     // ✅ If password is provided, hash it
//     if (updateData.password) {
//       const salt = await bcrypt.genSalt(10);
//       updateData.password = await bcrypt.hash(updateData.password, salt);
//     }

//     const guard = await User.findOneAndUpdate(
//       { _id: req.params.id, createdBy: req.user.id },
//       updateData,
//       { new: true }
//     ).select("-password"); // ✅ Don't expose password in response

//     if (!guard) {
//       return res.status(404).json(new ApiResponse(false, "Guard not found"));
//     }

//     return res
//       .status(200)
//       .json(new ApiResponse(true, "Guard updated successfully", { guard }));
//   } catch (err) {
//     return res
//       .status(500)
//       .json(new ApiResponse(false, "Server error: " + err.message));
//   }
// };





// exports.deleteGuard = async (req, res) => {
//   try {
//     const guard = await User.findById(req.params.id);
//     if (!guard || guard.role !== "guard") {
//       return res.status(404).json(new ApiResponse(false, "Guard not found"));
//     }

//     // delete related shifts
//     await Shift.deleteMany({ guard: guard._id });

//     // delete related patrol logs
//     await Patrol.deleteMany({ guard: guard._id });

//     // delete guard itself
//     await User.findByIdAndDelete(guard._id);

//     return res
//       .status(200)
//       .json(new ApiResponse(true, "Guard and related data deleted"));
//   } catch (err) {
//     return res.status(500).json(new ApiResponse(false, err.message));
//   }
// }; 
exports.updateGuard = async (req, res) => {
  try {
    let updateData = { ...req.body };

    // Only hash password if provided
    if (updateData.password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(updateData.password, salt);
    } else {
      delete updateData.password; // remove it so Mongoose won't validate it
    }

    const filter = { _id: req.params.id };

 
if (req.user.role === "supervisor") {
  // Supervisor can update only guards they created
  filter.createdBy = req.user.id;
} else if (req.user.role === "employee") {
  // Employee can update guards in their company
  // For employee, their own _id is the companyId
  filter.companyId = req.user.id;
}

    const guard = await User.findOneAndUpdate(
      filter,
      updateData,
      { new: true, runValidators: true } // ✅ validate only provided fields
    ).select("-password");

    if (!guard) {
      return res.status(404).json(new ApiResponse(false, "Guard not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(true, "Guard updated successfully", { guard }));
  } catch (err) {
    if (err.code === 11000) {
      const duplicateField = Object.keys(err.keyValue)[0];
      return res
        .status(400)
        .json(
          new ApiResponse(
            false,
            `The ${duplicateField} "${err.keyValue[duplicateField]}" is already in use`
          )
        );
    }
    return res
      .status(500)
      .json(new ApiResponse(false, "Server error: " + err.message));
  }
};


exports.deleteGuard = async (req, res) => {
  try {
    const guard = await User.findById(req.params.id);
    if (!guard || guard.role !== "guard") {
      return res.status(404).json(new ApiResponse(false, "Guard not found"));
    }

    // 1. Remove guard from PatrolPlans
    await PatrolPlan.updateMany(
      { "assignedGuards.guardId": guard._id },
      { $pull: { assignedGuards: { guardId: guard._id } } }
    );

    // 2. Remove guard from Shifts
    await Shift.updateMany(
      { assignedGuards: guard._id },
      { $pull: { assignedGuards: guard._id } }
    );

    // 3. Remove guard from supervisor(s).guards arrays
    await User.updateMany(
      { guards: guard._id },
      { $pull: { guards: guard._id } }
    );

    // 4. Remove guard from supervisors arrays (if stored as reverse mapping)
    await User.updateMany(
      { supervisors: guard._id },
      { $pull: { supervisors: guard._id } }
    );

    // 5. Delete related patrol logs
    await Patrol.deleteMany({ guard: guard._id });

    // 6. Finally, delete guard
    await User.findByIdAndDelete(guard._id);

    return res
      .status(200)
      .json(new ApiResponse(true, "Guard and related references deleted"));
  } catch (err) {
    console.error("Error deleting guard:", err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};


exports.reportIncident = async (req, res) => {
  try {
    const { title, description, type, severity = "medium", location, assignedTo = [] } = req.body;

    if (!title || !description || !type) {
      return res.status(400).json({ success: false, msg: "Title, description, and type are required" });
    }

    const photos = [];
    let video = null;

    if (req.files) {
      req.files.forEach(file => {
        if (file.mimetype.startsWith("image")) photos.push(file.path);
        if (file.mimetype.startsWith("video")) video = file.path;
      });
    }

    const incident = await Incident.create({
      title,
      description,
      type,
      severity,
      location: location ? JSON.parse(location) : null,
      reportedBy: req.user.id,
      assignedTo: assignedTo.length ? JSON.parse(assignedTo) : [],
      photos,
      video
    });

    return res.status(201).json({ success: true, msg: "Incident reported successfully", data: { incident } });
  } catch (err) {
    return res.status(500).json({ success: false, msg: err.message });
  }
};
