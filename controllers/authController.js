
// controllers/authController.js
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/keys");
const ApiResponse = require("../utils/apiResponse");
const Shift=require("../models/Shift")
const Attendance=require("../models/Attendance")






exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, address, role = "guard" } = req.body;


    // console.log('req.user in the register  ', req.body);
    
    if (!name || !password || (!email && !phone)) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            false,
            "Name, password, and either email or phone are required"
          )
        );
    }

    const emailLower = email ? email.toLowerCase() : undefined;

    // Check duplicates only if email or phone exists
    const orConditions = [];
    if (emailLower) orConditions.push({ email: emailLower });
    if (phone) orConditions.push({ phone });

    if (orConditions.length > 0) {
      const exists = await User.findOne({ $or: orConditions });
      if (exists) {
        const duplicateField = exists.email === emailLower ? "email" : "phone";
        return res
          .status(400)
          .json(
            new ApiResponse(
              false,
              `The ${duplicateField} "${exists[duplicateField]}" is already in use`
            )
          );
      }
    }

    const hash = await bcrypt.hash(password, 10);

    let createdBy = null;
    let parent = null;
    let supervisor = null;
    let companyId = null;

    // if (req.user) {
    //   if (role === "employee" && req.user.role === "admin") {
    //     createdBy = req.user.id;
    //     companyId = null;
    //   }
    //   if (req.user.role === "employee" && role === "supervisor") {
    //     createdBy = req.user.id;
    //     parent = req.user.id;
    //     companyId = req.user.id;
    //   }
    //   if (req.user.role === "supervisor" && role === "guard") {
    //     createdBy = req.user.id;
    //     parent = req.user.id;
    //     supervisor = req.user.id;
    //     companyId = req.user.companyId;
    //   }
    // }

    // Only include email/phone if they exist
    
    
    if (req.user) {
      switch (req.user.role) {
        case "admin":
          createdBy = req.user.id;
          // companyId = null; // top-level
          // parent = null;
          // supervisor = null;
          break;

        case "employee":
          if (role === "supervisor") {
            createdBy = req.user.id;
            parent = req.user.id;
            companyId = req.user.id;
          } else if (role === "employee") {
            createdBy = req.user.id;
            parent = null;
            companyId = null;
          }
          break;

        case "supervisor":
          if (role === "guard") {
            createdBy = req.user.id;
            parent = req.user.id;
            supervisor = req.user.id;
            companyId = req.user.companyId;
          }
          break;
      }
    }



    const userData = {
      name,
      password: hash,
      role,
      createdBy,
      parent,
      supervisor,
      companyId,
      ...(emailLower && { email: emailLower }),
      ...(phone && { phone }),
      ...(address && { address }),
    };

    const user = await User.create(userData);

    // Update hierarchy arrays
   if (req.user?.role === "admin" && role === "employee") {
     await User.findByIdAndUpdate(user._id, { companyId: user._id });
     user.companyId = user._id;
   }



    if (role === "supervisor" && parent) {
      await User.findByIdAndUpdate(parent, {
        $push: { supervisors: user._id },
      });
    }
    if (role === "guard" && parent) {
      await User.findByIdAndUpdate(parent, { $push: { guards: user._id } });
    }

    const out = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };

    return res
      .status(201)
      .json(
        new ApiResponse(true, " registered successfully", { user: out })
      );
  } catch (err) {
    console.error("Register error:", err);

    // Handle duplicate key gracefully
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


exports.login = async (req, res) => {
  try {
    const { email, phone, password, deviceToken, lat, lng } = req.body;

    if ((!email && !phone) || !password) {
      return res
        .status(400)
        .json(new ApiResponse(false, "Email/Phone and password are required"));
    }

    // Determine identifier
    const identifier = email || phone;

    // Build query
    let query;
    if (email) {
      // Email login: convert to lowercase for case-insensitive match
      query = { email: email.toLowerCase() };
    } else {
      // Phone login
      query = { phone: phone };
    }

    const user = await User.findOne(query);

    if (!user) {
      return res
        .status(401)
        .json(new ApiResponse(false, "Invalid credentials"));
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res
        .status(401)
        .json(new ApiResponse(false, "Invalid credentials"));
    }

    // Update device token if provided
    if (deviceToken) {
      user.deviceToken = deviceToken;
      await user.save();
    }

    let shiftData = null;
    let attendanceRecord = null;

    // ===== Guard-specific login =====
    if (user.role === "guard") {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const activeShift = await Shift.findOne({
        assignedGuards: user._id,
        startTime: { $lte: now },
        endTime: { $gte: now },
        isActive: true,
      });

      if (activeShift) {
        shiftData = {
          id: activeShift._id,
          shiftName: activeShift.shiftName,
          startTime: activeShift.startTime,
          endTime: activeShift.endTime,
          shiftType: activeShift.shiftType,
        };

        const existingAttendance = await Attendance.findOne({
          guard: user._id,
          date: todayStart,
          logoutTime: null,
        });

        if (!existingAttendance) {
          const shiftStart = new Date(activeShift.startTime);
          const shiftEnd = new Date(activeShift.endTime);
          const expectedHours = (shiftEnd - shiftStart) / (1000 * 60 * 60);

          let lateBy = 0;
          let status = "on-duty";

          if (now > shiftStart) {
            lateBy = Math.floor((now - shiftStart) / (1000 * 60));
            status = "late";
          }

          const attendanceData = {
            guard: user._id,
            shift: activeShift._id,
            date: todayStart,
            loginTime: now,
            expectedLoginTime: activeShift.startTime,
            expectedLogoutTime: activeShift.endTime,
            expectedHours,
            status,
            lateBy,
          };

          if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
            attendanceData.location = {
              login: { lat: Number(lat), lng: Number(lng) },
            };
          }

          attendanceRecord = await Attendance.create(attendanceData);
        }
      }
    }

    // Sign JWT token
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        companyId: user.companyId,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
      jwtSecret,
      { expiresIn: "7d" }
    );

    const out = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      companyId: user.companyId,
      shift: shiftData,
      attendance: attendanceRecord
        ? {
            id: attendanceRecord._id,
            loginTime: attendanceRecord.loginTime,
            expectedLoginTime: attendanceRecord.expectedLoginTime,
            lateBy: attendanceRecord.lateBy,
            status: attendanceRecord.status,
          }
        : null,
    };

    return res
      .status(200)
      .json(
        new ApiResponse(true, "Logged in successfully", { user: out, token })
      );
  } catch (err) {
    return res
      .status(500)
      .json(new ApiResponse(false, "Server error: " + err.message));
  }
};



exports.guardLogout = async (req, res) => {
  try {
    const guardId = req.user.id;
    const { lat, lng } = req.body;

    // Only guards can logout
    if (req.user.role !== "guard") {
      return res
        .status(403)
        .json(new ApiResponse(false, "Only guards can use this endpoint"));
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Find today's active attendance
    const attendance = await Attendance.findOne({
      guard: guardId,
      date: todayStart,
      logoutTime: null,
    });

    if (!attendance) {
      return res
        .status(400)
        .json(new ApiResponse(false, "No active login found for today"));
    }

    // Calculate total hours worked
    const totalHours = (now - attendance.loginTime) / (1000 * 60 * 60);

    // Check for early leave
    let earlyLeave = 0;
    if (
      attendance.expectedLogoutTime &&
      now < new Date(attendance.expectedLogoutTime)
    ) {
      earlyLeave = Math.floor(
        (new Date(attendance.expectedLogoutTime) - now) / (1000 * 60)
      );
    }

    // Update attendance
    attendance.logoutTime = now;
    attendance.totalHours = Number(totalHours.toFixed(2));
    attendance.status = "off-duty";
    attendance.earlyLeave = earlyLeave;

    // ✅ Save logout location only if provided and valid
    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
      attendance.location.logout = { lat: Number(lat), lng: Number(lng) };
    }

    await attendance.save();

    return res.status(200).json(
      new ApiResponse(true, "Logged out successfully", {
        attendanceId: attendance._id,
        loginTime: attendance.loginTime,
        logoutTime: attendance.logoutTime,
        totalHours: attendance.totalHours,
        expectedHours: attendance.expectedHours,
        earlyLeave: earlyLeave > 0 ? earlyLeave : 0,
        location: attendance.location?.logout || null,
      })
    );
  } catch (err) {
    console.error("Error in guardLogout:", err);
    return res.status(500).json(new ApiResponse(false, err.message));
  }
};
