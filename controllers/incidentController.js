// controllers/incidentController.js
const Incident = require("../models/Incident");
const User = require("../models/User");
const ApiResponse = require("../utils/apiResponse");
const fs = require("fs").promises;
const path = require("path");
const { uploadDir } = require("../middleware/multer");
const mongoose=require("mongoose")
const QR=require("../models/QR")


exports.reportIncident = async (req, res) => {
  try {
    let {
      title,
      description,
      type,
      severity = "medium",
      location,
      qrId,
      assignedTo = [],
    } = req.body;

    console.log("req---body", req.body);

    let siteInfo = null;
    let isFromQRScan = false;

    if (qrId) {
      try {
        if (!mongoose.Types.ObjectId.isValid(qrId)) {
          return res
            .status(400)
            .json(new ApiResponse(false, "Invalid QR ID format"));
        }

        const qrObjectId = new mongoose.Types.ObjectId(qrId);
        const siteData = await QR.findById(qrObjectId);

        console.log("site data is ", siteData);

        if (siteData) {
          siteInfo = {
            siteId: siteData.siteId,
            description: siteData.description,
            lat: siteData.lat,
            lng: siteData.lng,
            radius: siteData.radius,
          };

          isFromQRScan = true; // Set to true since incident was created from QR scan
        }
      } catch (qrError) {
        return res.status(500).json(new ApiResponse(false, qrError.message));
      }
    }



    console.log("req.user", req.user);

    // Process uploaded files
    const photos = [];
    let video = null;

    console.log("req---files", req.files);

    // if (req.files && req.files.length > 0) {
    //   for (const file of req.files) {
    //     const fileData = await fs.readFile(file.path);
    //     const base64Data = fileData.toString("base64");

    //     if (file.mimetype.startsWith("image")) {
    //       photos.push(`data:${file.mimetype};base64,${base64Data}`);
    //     } else if (file.mimetype.startsWith("video")) {

    //            const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
    //            if (file.size > MAX_VIDEO_SIZE) {
    //              await fs.unlink(file.path);
    //              return res
    //                .status(400)
    //                .json(
    //                  new ApiResponse(
    //                    false,
    //                    "Video file too large. Maximum size is 50MB"
    //                  )
    //                );
    //            }

    //       video = `data:${file.mimetype};base64,${base64Data}`;
    //     }

    //     // Remove temp file
    //     await fs
    //       .unlink(file.path)
    //       .catch((e) => console.warn("File cleanup failed:", e.message));
    //   }
    // }
    // Process uploaded files - Add error handling
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const fileData = await fs.readFile(file.path);
          const base64Data = fileData.toString("base64");

          if (file.mimetype.startsWith("image")) {
            photos.push(`data:${file.mimetype};base64,${base64Data}`);
          } else if (file.mimetype.startsWith("video")) {
            // Add video validation
            const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
            if (file.size > MAX_VIDEO_SIZE) {
              await fs.unlink(file.path);
              return res
                .status(400)
                .json(
                  new ApiResponse(
                    false,
                    "Video file too large. Maximum size is 50MB"
                  )
                );
            }
            video = `data:${file.mimetype};base64,${base64Data}`;
          }

          // Remove temp file
          await fs
            .unlink(file.path)
            .catch((e) => console.warn("File cleanup failed:", e.message));
        } catch (fileError) {
          console.error("Error processing file:", fileError);
          await fs.unlink(file.path).catch(() => {});
          return res
            .status(500)
            .json(
              new ApiResponse(
                false,
                `Error processing file: ${fileError.message}`
              )
            );
        }
      }
    }

    // Set defaults if missing - FIXED: Ensure type has a valid default
    if (!title) title = "Untitled Incident";
    if (!description) description = "No description provided";
    if (!type || type === "undefined") type = "other"; // Use valid enum value

    // Parse location
    let parsedLocation = null;
    if (location) {
      try {
        parsedLocation =
          typeof location === "string" ? JSON.parse(location) : location;
      } catch (e) {
        parsedLocation = null;
      }
    }

    // Get guard info

    const guard = await User.findById(new mongoose.Types.ObjectId(req.user.id));

    if (!guard) {
      return res.status(404).json(new ApiResponse(false, "User not found"));
    }
    // Assign supervisor or provided users
    let assignedToArray = [];
    if (assignedTo && assignedTo.length > 0) {
      assignedToArray = Array.isArray(assignedTo)
        ? assignedTo
        : JSON.parse(assignedTo);
    } else if (guard.supervisor) {
      assignedToArray = [guard.supervisor];
    }

    // Assign companyId
    const companyId = guard.companyId || null;

    // Create incident
    const incident = await Incident.create({
      title,
      description,
      type, // Now this will always be a valid enum value
      severity,
      location: parsedLocation,
      reportedBy: req.user.id,
      assignedTo: assignedToArray,
      photos,
      video,
      qrId: qrId ? new mongoose.Types.ObjectId(qrId) : null,
      isFromQRScan: isFromQRScan,
      siteInfo: siteInfo,
      status: "reported",
      companyId,
    });

    const populatedIncident = await Incident.findById(incident._id)
      .populate("reportedBy", "name email role")
      .populate("assignedTo", "name email role")
      .populate("companyId", "name email role")
      .populate("qrId", "siteId description lat lng radius");

    return res.status(201).json(
      new ApiResponse(true, "Incident reported successfully", {
        incident: populatedIncident,
        // isFromQRScan: isFromQRScan,
      })
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

exports.getIncidents = async (req, res) => {


  console.log('-----req.user----', req.user);
  
  try {
    const { status, type, severity, page = 1, limit = 20 } = req.query;
    const filter = {};

    // Role-based filtering
    if (req.user.role === "guard") {
      filter.reportedBy = req.user.id;
    } else if (req.user.role === "supervisor") {
      filter.assignedTo = req.user.id;
    } else if (req.user.role === "employee") {
      // Employee can see all incidents from their guards and supervisors
      // const guards = await User.find({ createdBy: req.user.id, role: "guard" });
      // const supervisors = await User.find({
      //   createdBy: req.user.id,
      //   role: "supervisor",
      // });

        const guards = await User.find({
          companyId: req.user.id,
          role: "guard",
        });
        const supervisors = await User.find({
          companyId: req.user.id,
          role: "supervisor",
        });

      const guardIds = guards.map((g) => g._id);
      const supervisorIds = supervisors.map((s) => s._id);

      filter.$or = [
        { reportedBy: { $in: guardIds } },
        { assignedTo: { $in: supervisorIds } },
        { companyId: req.user.id },
      ];
    }

    // Apply additional filters
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (severity) filter.severity = severity;

    const incidents = await Incident.find(filter)
      .populate("reportedBy", "name email role")
      .populate("assignedTo", "name email role")
      .populate("companyId", "name email role")
      .populate("qrId", "siteId description lat lng radius")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Incident.countDocuments(filter);

    return res
      .status(200)
      .json(
        new ApiResponse(true, "Incidents fetched successfully", {
          incidents,
          total,
          page,
          limit,
        })
      );
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// Update Incident Status (Supervisor/Employee)
exports.updateIncidentStatus = async (req, res) => {
  try {
    const { status, resolutionNotes } = req.body;
    const incidentId = req.params.id;

    if (!status) {
      return res.status(400).json(new ApiResponse(false, "Status is required"));
    }

    const updateData = { status };

    if (status === "resolved" || status === "closed") {
      updateData.resolvedAt = new Date();
      if (resolutionNotes) {
        updateData.resolutionNotes = resolutionNotes;
      }
    }

    // Check if user has permission to update this incident
    const filter = { _id: incidentId };
    if (req.user.role === "supervisor") {
      filter.assignedTo = req.user.id;
    } else if (req.user.role === "employee") {
      // Employee can update incidents from their team
      const guards = await User.find({ createdBy: req.user.id, role: "guard" });
      const supervisors = await User.find({
        createdBy: req.user.id,
        role: "supervisor",
      });

      const guardIds = guards.map((g) => g._id);
      const supervisorIds = supervisors.map((s) => s._id);

      filter.$or = [
        { reportedBy: { $in: guardIds } },
        { assignedTo: { $in: supervisorIds } },
      ];
    }

    const incident = await Incident.findOneAndUpdate(filter, updateData, {
      new: true,
    })
      .populate("reportedBy", "name email role")
      .populate("assignedTo", "name email role");

    if (!incident) {
      return res
        .status(404)
        .json(new ApiResponse(false, "Incident not found or access denied"));
    }

    return res
      .status(200)
      .json(
        new ApiResponse(true, "Incident updated successfully", { incident })
      );
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};

// Get Incident Statistics
exports.getIncidentStats = async (req, res) => {
  try {
    const { period = "month" } = req.query;
    let startDate;

    const now = new Date();
    switch (period) {
      case "week":
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case "month":
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case "year":
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        startDate = new Date(now.setMonth(now.getMonth() - 1));
    }

    // Build filter based on user role
    // let matchFilter = { createdAt: { $gte: startDate } };
    let matchFilter = {};
console.log("Match filter:", matchFilter);

    if (req.user.role === "supervisor") {
      // assignedTo is an array → must use $in
     matchFilter.assignedTo = { $in: [ new mongoose.Types.ObjectId(req.user.id)] };
    } else if (req.user.role === "employee") {
      const guards = await User.find({ createdBy: req.user.id, role: "guard" });
      const supervisors = await User.find({
        createdBy: req.user.id,
        role: "supervisor",
      });
  
      console.log("supervisot is ", supervisors);
      
      const guardIds = guards.map((g) => g._id);
      const supervisorIds = supervisors.map((s) => s._id);

      matchFilter.$or = [
        { reportedBy: { $in: guardIds } },
        { assignedTo: { $in: supervisorIds } },
      ];
    }

    const stats = await Incident.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$status", // group by status
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$count" },
          statusBreakdown: {
            $push: { k: "$_id", v: "$count" },
          },
        },
      },
      {
        $project: {
          _id: 0,
          total: 1,
          statusBreakdown: { $arrayToObject: "$statusBreakdown" },
        },
      },
    ]);

    return res.status(200).json(
      new ApiResponse(true, "Incident statistics", {
        stats: stats[0] || { total: 0, statusBreakdown: {} },
      })
    );
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};
