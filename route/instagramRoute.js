const express = require("express");
const router = express.Router();
const { analyzeInstagramUser } = require("../services/instagramService");
const { loginInstagram } = require("../services/loginInstagram");


router.get("/login-instagram", async (req, res) => {
  const result = await loginInstagram();
  res.status(result.success ? 200 : 500).json(result);
});


router.post("/analyze", async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: "Missing 'username' in request body" });
  }

  try {
    const result = await analyzeInstagramUser(username);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: "Instagram analysis failed",
      message: error.message,
    });
  }
});

module.exports = router;
