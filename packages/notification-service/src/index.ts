import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './utils/config';
import { logger } from './utils/logger';
import healthRouter from './routes/health';
import notificationsRouter from './routes/notifications';
import preferencesRouter from './routes/preferences';
import devicesRouter from './routes/devices';
import emergencyRouter from './routes/emergency';
import callsRouter from './routes/calls';
import { setupMessagingNamespace } from './websocket';
import { initFirebase } from './services/fcm';

const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet());

// Initialize external providers (non-fatal if not configured)
initFirebase();

// Basic rate limit for APIs
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-7',
  })
);

// Routes
app.use('/health', healthRouter);
app.use('/notifications', notificationsRouter);
app.use('/preferences', preferencesRouter);
app.use('/devices', devicesRouter);
app.use('/emergency', emergencyRouter);
app.use('/calls', callsRouter);

const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
  },
});

setupMessagingNamespace(io);

if (config.NODE_ENV !== 'test') {
  const port = config.PORT;
  server.listen(port, () => {
    logger.info(`notification-service listening on port ${port}`);
  });
}

export { app, server, io };
