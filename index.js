const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const youtubeRoutes = require("./route/youtubeRoute");
const instagramRoutes = require("./route/instagramRoute"); // ✅ Add this line

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api", youtubeRoutes);
app.use("/instagram", instagramRoutes); // ✅ Enable the route here

app.get("/", (req, res) => {
  res.send("🎬 YouTube Analyzer API is running.");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
