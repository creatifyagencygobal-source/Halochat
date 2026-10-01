const mongoose = require("mongoose");
const dns = require("dns");

dns.setServers(["1.1.1.1", "8.8.8.8"]);

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured.");

  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB connection disconnected.");
  });

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
}

module.exports = { connectDatabase, disconnectDatabase };
