import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { createMaskedSession } from '../services/twilioProxy';

const router = Router();

const maskedSchema = Joi.object({
  requesterPhone: Joi.string().required(),
  runnerPhone: Joi.string().required(),
});

router.post('/masked', async (req: Request, res: Response) => {
  const { error, value } = maskedSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  const { requesterPhone, runnerPhone } = value;
  const session = await createMaskedSession(requesterPhone, runnerPhone);
  res.json({ success: true, ...session });
});

export default router;
