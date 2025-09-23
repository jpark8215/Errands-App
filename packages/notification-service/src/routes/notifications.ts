import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { redis, keys } from '../services/redis';
import { renderTemplate } from '../services/templates';
import { sendPush } from '../services/fcm';
import { logger } from '../utils/logger';

const router = Router();

const sendSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  eventType: Joi.string().required(),
  data: Joi.object().default({}),
});

router.post('/send', async (req: Request, res: Response) => {
  const { error, value } = sendSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  const { userId, eventType, data } = value;
  const tokenSet = await redis.smembers(keys.deviceTokens(userId));
  if (!tokenSet.length) return res.status(202).json({ message: 'No devices registered' });

  const { title, body } = renderTemplate(eventType, data);

  try {
    const result = await sendPush(
      tokenSet,
      {
        notification: { title, body },
        data: { eventType, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) },
      },
      { priority: 'high' }
    );
    res.json({ success: true, result });
  } catch (err: any) {
    logger.error('Failed to send push', { err });
    res.status(500).json({ error: 'Failed to send push' });
  }
});

export default router;
