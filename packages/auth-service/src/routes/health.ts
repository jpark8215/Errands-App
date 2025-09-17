import { Router } from 'express';
import { healthCheck } from '../services/healthService';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const health = await healthCheck();
    res.status(200).json({
      success: true,
      data: health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Health check failed'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export { router as healthRoutes };
