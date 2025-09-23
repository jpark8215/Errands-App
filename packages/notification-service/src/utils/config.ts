import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const config = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3006),
  REDIS_URL: required('REDIS_URL', 'redis://localhost:6379'),

  // Firebase Admin (use individual fields rather than file path for container friendliness)
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),

  // Twilio
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_PROXY_SERVICE_SID: process.env.TWILIO_PROXY_SERVICE_SID,

  // JWT for socket auth
  JWT_SECRET: required('JWT_SECRET', 'dev-secret'),

  // Messaging encryption (optional symmetric)
  MSG_ENCRYPTION_KEY_BASE64: process.env.MSG_ENCRYPTION_KEY_BASE64,
};
