// routes/youtubeRoutes.js
const express = require("express");
const router = express.Router();
const { analyzeChannel } = require("../services/youtubeServices");


router.get("/", (req, res) => {
    res.send("🎬 YouTube Analyzer API is running.");
  });
// POST /analyze-youtube
router.post("/analyze-youtube", async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: "Missing YouTube channel username" });
  }

  try {
    const result = await analyzeChannel(username);
    if (result.error) {
      return res.status(404).json({ error: result.error });
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error analyzing YouTube channel:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
