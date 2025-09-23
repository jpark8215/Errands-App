import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { redis, keys } from '../services/redis';

const router = Router();

const registerSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  token: Joi.string().required(),
});

router.post('/register', async (req: Request, res: Response) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  const { userId, token } = value;
  await redis.sadd(keys.deviceTokens(userId), token);
  res.json({ success: true });
});

router.post('/unregister', async (req: Request, res: Response) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  const { userId, token } = value;
  await redis.srem(keys.deviceTokens(userId), token);
  res.json({ success: true });
});

export default router;
