// index.js
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const youtubeRoutes = require("./route/youtubeRoute");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api", youtubeRoutes);
// Root
app.get("/", (req, res) => {
  res.send("🎬 YouTube Analyzer API is running.");
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
