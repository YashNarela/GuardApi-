const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");
require("dotenv").config()
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB Connected");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1); 
  }
};

connectDB()

async function seed(){
  const exists = await User.findOne({ email: "admin@company.com" });
  if(exists){ console.log("Admin exists"); return process.exit(); }
  const hash = await bcrypt.hash("123456", 10);
  await User.create({
    name: "admin",
    email: "admin@company.com",
    password: hash,
    role: "admin",
  });
  console.log("Admin created: admin@company.com / admin123");
  process.exit();
}
seed();
