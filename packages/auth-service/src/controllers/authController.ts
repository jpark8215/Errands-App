import { Request, Response } from 'express';
import { authService } from '../services/authService';
import { logger } from '../utils/logger';

export const authController = {
  async register(req: Request, res: Response) {
    try {
      const { email, password, phoneNumber, userType, firstName, lastName } = req.body;
      
      const result = await authService.register({
        email,
        password,
        phoneNumber,
        userType,
        firstName,
        lastName
      });

      logger.info(`User registered successfully: ${email}`);
      
      res.status(201).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Registration failed:', error);
      throw error;
    }
  },

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      
      const result = await authService.login({ email, password });

      logger.info(`User logged in successfully: ${email}`);
      
      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Login failed:', error);
      throw error;
    }
  },

  async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;
      
      const result = await authService.refreshToken(refreshToken);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Token refresh failed:', error);
      throw error;
    }
  },

  async logout(req: Request, res: Response) {
    try {
      const { userId } = req.body;
      
      await authService.logout(userId);

      logger.info(`User logged out: ${userId}`);
      
      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Logout failed:', error);
      throw error;
    }
  },

  async verifyPhone(req: Request, res: Response) {
    try {
      const { phoneNumber, code } = req.body;
      
      const result = await authService.verifyPhone(phoneNumber, code);

      res.status(200).json({
        success: true,
        data: { verified: result },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Phone verification failed:', error);
      throw error;
    }
  },

  async verifyIdentity(req: Request, res: Response) {
    try {
      const { documents } = req.body;
      
      const result = await authService.verifyIdentity(documents);

      res.status(200).json({
        success: true,
        data: { status: result },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Identity verification failed:', error);
      throw error;
    }
  }
};
