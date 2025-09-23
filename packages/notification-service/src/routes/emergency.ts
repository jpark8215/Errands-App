import { Router } from 'express';
import Joi from 'joi';
import { renderTemplate } from '../services/templates';
import { redis, keys } from '../services/redis';
import { sendPush } from '../services/fcm';
import { logger } from '../utils/logger';

const router = Router();

const alertSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  userName: Joi.string().required(),
  lat: Joi.number().required(),
  lng: Joi.number().required(),
  taskId: Joi.string().uuid().optional(),
  notifyUserIds: Joi.array().items(Joi.string().uuid()).default([]),
});

router.post('/alert', async (req, res) => {
  const { error, value } = alertSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  const { userId, userName, lat, lng, taskId, notifyUserIds } = value;

  const location = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const { title, body } = renderTemplate('emergency.alert', { userName, location, taskId });

  // Push to each notify userId
  let total = 0;
  for (const uid of notifyUserIds) {
    const tokens = await redis.smembers(keys.deviceTokens(uid));
    if (!tokens.length) continue;
    try {
      await sendPush(
        tokens,
        {
          notification: { title, body },
          data: { eventType: 'emergency.alert', userId, taskId: taskId || '' },
        },
        { priority: 'high' }
      );
      total += tokens.length;
    } catch (e) {
      logger.error('Emergency push failed', { e });
    }
  }

  res.json({ success: true, deliveredToTokens: total });
});

const checkinSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  taskId: Joi.string().uuid().required(),
  status: Joi.string().valid('ok', 'help').required(),
});

router.post('/checkin', async (req, res) => {
  const { error, value } = checkinSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  const { userId, taskId, status } = value;

  // For now: broadcast to task room via WebSocket namespace if present (fire-and-forget)
  // A more robust approach would publish to Kafka for the task-service to handle.

  res.json({ success: true, userId, taskId, status });
});

export default router;
