import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authController } from '../controllers/authController';
import { validateRequest } from '../middleware/validateRequest';

const router = Router();

// Validation middleware
const registerValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('phoneNumber').isMobilePhone(),
  body('userType').isIn(['requester', 'tasker', 'both']),
  body('firstName').trim().isLength({ min: 1 }),
  body('lastName').trim().isLength({ min: 1 })
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
];

const refreshTokenValidation = [
  body('refreshToken').notEmpty()
];

// Routes
router.post('/register', registerValidation, validateRequest, authController.register);
router.post('/login', loginValidation, validateRequest, authController.login);
router.post('/refresh', refreshTokenValidation, validateRequest, authController.refreshToken);
router.post('/logout', authController.logout);
router.post('/verify-phone', authController.verifyPhone);
router.post('/verify-identity', authController.verifyIdentity);

export { router as authRoutes };
