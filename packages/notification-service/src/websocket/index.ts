import { Server as SocketIOServer, Namespace, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { encryptMessage } from '../services/messaging';
import { redis, keys } from '../services/redis';

interface JWTPayload {
  userId: string;
}

function authenticateSocket(socket: Socket): string | null {
  const token = socket.handshake.auth?.token || socket.handshake.headers['x-auth-token'];
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
    return payload.userId;
  } catch (e) {
    return null;
  }
}

export function setupMessagingNamespace(io: SocketIOServer) {
  const nsp: Namespace = io.of('/messaging');

  nsp.use(async (socket, next) => {
    const userId = authenticateSocket(socket);
    if (!userId) return next(new Error('unauthorized'));
    // attach userId to socket
    (socket as any).userId = userId;
    await redis.set(keys.socketUser(socket.id), userId);
    next();
  });

  nsp.on('connection', (socket) => {
    const userId: string = (socket as any).userId;
    logger.debug(`Socket connected ${socket.id} as user ${userId}`);

    // Join personal room
    socket.join(`user:${userId}`);

    // Join task room upon request
    socket.on('join_task', (taskId: string) => {
      if (typeof taskId !== 'string') return;
      socket.join(`task:${taskId}`);
    });

    // Relay messages within a task room
    socket.on('message', (msg: { taskId: string; toUserId?: string; text: string }) => {
      if (!msg?.taskId || typeof msg.text !== 'string') return;
      const enc = encryptMessage(msg.text);
      const payload = { fromUserId: userId, taskId: msg.taskId, ...enc };
      if (msg.toUserId) {
        nsp.to(`user:${msg.toUserId}`).emit('message', payload);
      } else {
        nsp.to(`task:${msg.taskId}`).emit('message', payload);
      }
    });

    socket.on('disconnect', async () => {
      await redis.del(keys.socketUser(socket.id));
      logger.debug(`Socket disconnected ${socket.id}`);
    });
  });
}
