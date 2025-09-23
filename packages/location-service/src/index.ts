import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import { logger } from './utils/logger';
import { connectRedis } from './config/redis';
import { connectDatabase } from './config/database';
import { LocationWebSocketHandler } from './websocket/locationHandler';
import { locationRoutes } from './routes/locationRoutes';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3007;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    service: 'location-service',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/location', authMiddleware, locationRoutes);

// WebSocket handler
const locationWsHandler = new LocationWebSocketHandler(io);

// Error handling middleware
app.use(errorHandler);

// Initialize connections and start server
async function startServer() {
  try {
    // Connect to Redis
    await connectRedis();
    logger.info('Connected to Redis');

    // Connect to Database
    await connectDatabase();
    logger.info('Connected to PostgreSQL');

    // Start server
    server.listen(PORT, () => {
      logger.info(`Location service running on port ${PORT}`);
      logger.info(`WebSocket server ready for real-time location tracking`);
    });

  } catch (error) {
    logger.error('Failed to start location service:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Location service shut down');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Location service shut down');
    process.exit(0);
  });
});

startServer();

export { app, server, io };
