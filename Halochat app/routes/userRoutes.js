const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const rateLimit = require("express-rate-limit");
const { searchUsers, updateProfile, changePassword, updateSettings } = require("../controllers/userController");
const { avatarUpload, validateAvatar, uploadErrorHandler } = require("../middleware/uploadMiddleware");
const { uploadAvatar, removeAvatar } = require("../controllers/mediaController");
const router = express.Router();
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many security changes. Try again later." },
});
router.get("/search", requireAuth, searchUsers);
router.patch("/me", requireAuth, sensitiveLimiter, updateProfile);
router.patch("/me/password", requireAuth, sensitiveLimiter, changePassword);
router.patch("/me/settings", requireAuth, updateSettings);
router.post("/avatar", requireAuth, avatarUpload, validateAvatar, uploadAvatar);
router.delete("/avatar", requireAuth, removeAvatar);
module.exports = router;
