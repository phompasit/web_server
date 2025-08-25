const mongoose = require("mongoose");

const options = {
//  useNewUrlParser: true,
//  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  autoIndex: false,
  family: 4,
};

const connectDB = async (url) => {
  try {
    console.log("🌐 Connecting to MongoDB:", url);
    await mongoose.connect(url,  options);
    console.log("✅ MongoDB Connected Successfully");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
  }
};

module.exports = connectDB;
