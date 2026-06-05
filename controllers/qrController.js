
const QR = require("../models/QR");
const { generateQR } = require("../utils/qrGenerator");
const ApiResponse = require("../utils/apiResponse");
 const PatrolPlan = require("../models/PatrolPlan");
const User=require("../models/User")
const mongoose = require("mongoose");




exports.createQR = async (req, res) => {
  try {
    const { siteId, description, lat, lng, radius } = req.body;

    // First, try to find or create the QR.
    let qrDoc;
    try {
      qrDoc = await QR.findOneAndUpdate(
        { siteId, lat: Number(lat), lng: Number(lng) }, // unique combination
        {
          $setOnInsert: {
            description: description || null,
            radius: Number(radius),
            createdBy: req.user.id,
            companyId: req.user.companyId,
          },
        },
        { new: true, upsert: true }
      );
    } catch (err) {
      // Duplicate key error (E11000): fetch the existing QR and continue
      if (err.code === 11000) {
        qrDoc = await QR.findOne({
          siteId,
          lat: Number(lat),
          lng: Number(lng),
        });
      } else {
        throw err;
      }
    }

    // Generate QR image if missing
    if (!qrDoc.qrImageBase64) {
      const { qrImageBase64 } = await generateQR(
        qrDoc.lat,
        qrDoc.lng,
        qrDoc.radius,
        qrDoc._id,
        qrDoc.siteId
      );
      qrDoc.qrImageBase64 = qrImageBase64;
      await qrDoc.save();
    }

    return res.status(200).json(
      new ApiResponse(true, "QR created or already exists", {
        qr: qrDoc,
        qrImageDataUrl: qrDoc.qrImageBase64,
      })
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};
exports.getAllQR = async (req, res) => {
  try {
    let filter = {};

    // if logged in user is employee, restrict to his own QR codes
    // if (req.user.role === "supervisor") {
    //   filter = { createdBy: req.user.id };
    // }

    if (req.user.role === "supervisor") {
      // See all company QRs
      filter = { companyId: req.user.companyId };
    } else if (req.user.role === "employee") {
      // Company sees all QRs under them
      filter = { companyId: req.user.id };
    } else if (req.user.role === "guard") {
      // Guard sees only assigned QRs (via patrol plan)
      filter = { _id: { $in: assignedCheckpoints } };
    }

    // admins can see all QRs
    const qrs = await QR.find(filter).populate("createdBy", "name email");

    return res.status(200).json(new ApiResponse(true, "QRs fetched", { qrs }));
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};


exports.deleteQR = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json(new ApiResponse(false, "Invalid QR ID format", null, 400));
    }

    const existingQR = await QR.findById(id);
    if (!existingQR) {
      return res
        .status(404)
        .json(new ApiResponse(false, "QR code not found", null, 404));
    }

   
    const updateResult = await PatrolPlan.updateMany(
      { "checkpoints.qrId": id },
      {
        $pull: {
          checkpoints: { qrId: id },
        },
      }
    );

    console.log(
      `Removed checkpoints from ${updateResult.modifiedCount} patrol plans`
    );


          // Deactivate patrol plans with no checkpoints
      const deactivatedPlans = await PatrolPlan.updateMany(
        { 
          "checkpoints": { $size: 0 },
          "isActive": true
        },
        { 
          $set: { "isActive": false } 
        }
      );

      if (deactivatedPlans.modifiedCount > 0) {
        console.log(`Deactivated ${deactivatedPlans.modifiedCount} patrol plans with no checkpoints`);
      }
    
        let qrDeleted =await QR.findByIdAndDelete(id);




    console.log("deleteing the Qr",qrDeleted);



    return res.status(200).json(new ApiResponse(true, "QR deleted"));
  } catch (err) {
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};





exports.getQRForGuard = async (req, res) => {
  try {


    console.log('Qr  ',req.user );
    


    if (req.user.role !== "guard") {
      return res.status(403).json(new ApiResponse(false, "Only guards can access this"));
    }

    // find guard’s employer (the employee who created this guard)
    const guard = await User.findById(req.user.id);
    if (!guard || !guard.createdBy) {
      return res.status(404).json(new ApiResponse(false, "Employer not found for this guard"));
    }

    // fetch only QR codes created by that employer
    // const qrs = await QR.find({ createdBy: guard.createdBy }).select(
    //   "_id lat lng radius siteId description createdAt"
    // );

    const qrs = await QR.find({ createdBy: guard.createdBy });


    return res.status(200).json(new ApiResponse(true, "QR list for guard", { qrs }));
  } catch (err) {
    console.error(err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};
