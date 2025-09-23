import { Router } from 'express';
import Joi from 'joi';
import { redis, keys } from '../services/redis';

const router = Router();

// Preferences structure example
// {
//   push: { task: true, message: true, safety: true },
//   email: { task: false, message: false, safety: true },
//   sms: { task: false, message: false, safety: true }
// }

const prefsSchema = Joi.object({
  push: Joi.object({ task: Joi.boolean(), message: Joi.boolean(), safety: Joi.boolean() }),
  email: Joi.object({ task: Joi.boolean(), message: Joi.boolean(), safety: Joi.boolean() }),
  sms: Joi.object({ task: Joi.boolean(), message: Joi.boolean(), safety: Joi.boolean() }),
}).unknown(false);

router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  const raw = await redis.get(keys.preferences(userId));
  const prefs = raw ? JSON.parse(raw) : null;
  res.json({ userId, preferences: prefs });
});

router.put('/:userId', async (req, res) => {
  const { userId } = req.params;
  const { error, value } = prefsSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  await redis.set(keys.preferences(userId), JSON.stringify(value));
  res.json({ success: true });
});

export default router;
