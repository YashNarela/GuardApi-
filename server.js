const express = require("express");
const mongoose = require("mongoose");
const cors=require("cors")
const app = express();
const path = require("path");
const bodyParser = require('body-parser')

const connectDB = require("./config/connection");
require('dotenv').config()
app.use(cors({
    origin: "*", 
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }));
app.use(express.json());

const port=process.env.PORT||2042
app.use(express.json()); // parse application/json
app.use(express.urlencoded({ extended: true })); // parse application/x-www-form-urlencoded

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/employees", require("./routes/employeeRoutes"));
app.use("/api/guards", require("./routes/guardRoutes"));
app.use("/api/qr", require("./routes/qrRoutes"));
app.use("/api/patrol", require("./routes/patrolRoutes"));
app.use("/api/supervisors", require("./routes/supervisorRoutes")); 
app.use("/api/shift",require("./routes/shiftRoutes"));
app.use("/api/plans",require("./routes/patrolPlanRoutes"));
app.use("/api/incidents", require("./routes/incidentRoutes"));
app.use("/api/scheduler", require("./routes/schedulerRoutes"));
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.listen(port, () => console.log(`Server running on ${port}`));

connectDB();