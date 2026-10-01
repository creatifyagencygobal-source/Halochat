const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const { register, login, logout, me } = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');
const router = express.Router();

const username = body('username').isString().withMessage('Username is required.').trim().toLowerCase()
  .isLength({ min: 3, max: 24 }).withMessage('Username must be between 3 and 24 characters.')
  .matches(/^[a-z0-9_]+$/).withMessage('Username may contain only letters, numbers, and underscores.');
const password = body('password').isString().withMessage('Password is required.')
  .isLength({ min: 8, max: 128 }).withMessage('Password must be at least 8 characters.');
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 25, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again later.' } });

router.post('/register', limiter, username, password,
  body('confirmPassword').isString().withMessage('Please confirm your password.')
    .custom((value, { req }) => value === req.body.password).withMessage('Passwords do not match.'), register);
router.post('/login', limiter, username, password, login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);
module.exports = router;
