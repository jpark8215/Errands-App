import request from 'supertest';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { io as Client } from 'socket.io-client';
import { app } from '../../index';
import { connectRedis, getRedisClient } from '../../config/redis';
import { connectDatabase, getDatabase } from '../../config/database';
import jwt from 'jsonwebtoken';

describe('Location Tracking Integration Tests', () => {
  let server: any;
  let clientSocket: any;
  let serverSocket: any;
  let authToken: string;
  let testUserId: string;
  let testTaskId: string;

  beforeAll(async () => {
    // Connect to test databases
    await connectRedis();
    await connectDatabase();

    // Create test server
    const httpServer = createServer(app);
    const io = new Server(httpServer);
    
    server = httpServer.listen(0); // Use random port
    const port = server.address().port;

    // Generate test auth token
    testUserId = '123e4567-e89b-12d3-a456-426614174000';
    testTaskId = '123e4567-e89b-12d3-a456-426614174001';
    
    authToken = jwt.sign(
      { userId: testUserId, email: 'test@example.com', role: 'tasker' },
      process.env.JWT_SECRET || 'test-secret'
    );

    // Set up socket connection
    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token: authToken }
    });

    io.on('connection', (socket) => {
      serverSocket = socket;
    });

    await new Promise((resolve) => {
      clientSocket.on('connect', resolve);
    });
  });

  afterAll(async () => {
    // Clean up
    if (clientSocket) clientSocket.close();
    if (server) server.close();
    
    // Clean up test data
    const redis = getRedisClient();
    const db = getDatabase();
    
    await redis.flushdb();
    await db.query('DELETE FROM route_points WHERE user_id = $1', [testUserId]);
    await db.query('DELETE FROM location_tracking_sessions WHERE user_id = $1', [testUserId]);
  });

  describe('WebSocket Location Updates', () => {
    test('should handle location update via WebSocket', (done) => {
      const locationData = {
        latitude: 40.7128,
        longitude: -74.0060,
        accuracy: 10,
        taskId: testTaskId
      };

      clientSocket.emit('location:update', locationData);

      clientSocket.on('location:update-success', (response: any) => {
        expect(response).toHaveProperty('timestamp');
        done();
      });

      clientSocket.on('location:error', (error: any) => {
        done(new Error(error.message));
      });
    });

    test('should start location tracking session', (done) => {
      clientSocket.emit('location:start-tracking', { taskId: testTaskId });

      clientSocket.on('location:tracking-started', (response: any) => {
        expect(response.taskId).toBe(testTaskId);
        done();
      });

      clientSocket.on('location:error', (error: any) => {
        done(new Error(error.message));
      });
    });

    test('should stop location tracking session', (done) => {
      clientSocket.emit('location:stop-tracking', { taskId: testTaskId });

      clientSocket.on('location:tracking-stopped', (response: any) => {
        expect(response.taskId).toBe(testTaskId);
        done();
      });

      clientSocket.on('location:error', (error: any) => {
        done(new Error(error.message));
      });
    });
  });

  describe('REST API Location Endpoints', () => {
    test('should update location via REST API', async () => {
      const locationData = {
        latitude: 40.7128,
        longitude: -74.0060,
        accuracy: 15
      };

      const response = await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${authToken}`)
        .send(locationData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should get current location', async () => {
      const response = await request(app)
        .get('/api/location/current')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('userId', testUserId);
      expect(response.body).toHaveProperty('location');
      expect(response.body.location).toHaveProperty('latitude');
      expect(response.body.location).toHaveProperty('longitude');
    });

    test('should get nearby users', async () => {
      const response = await request(app)
        .get('/api/location/nearby')
        .query({
          latitude: 40.7128,
          longitude: -74.0060,
          radius: 5000
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('nearbyUsers');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.nearbyUsers)).toBe(true);
    });

    test('should start tracking via REST API', async () => {
      const response = await request(app)
        .post('/api/location/tracking/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ taskId: testTaskId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.taskId).toBe(testTaskId);
    });

    test('should get route tracking data', async () => {
      // First add some route points
      await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10,
          taskId: testTaskId
        });

      const response = await request(app)
        .get(`/api/location/tracking/route/${testTaskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('taskId', testTaskId);
      expect(response.body).toHaveProperty('route');
      expect(Array.isArray(response.body.route)).toBe(true);
    });

    test('should stop tracking via REST API', async () => {
      const response = await request(app)
        .post('/api/location/tracking/stop')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ taskId: testTaskId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.taskId).toBe(testTaskId);
    });
  });

  describe('Privacy Settings', () => {
    test('should get privacy settings', async () => {
      const response = await request(app)
        .get('/api/location/privacy/settings')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('userId', testUserId);
      expect(response.body).toHaveProperty('locationSharingEnabled');
      expect(response.body).toHaveProperty('precisionLevel');
    });

    test('should update privacy settings', async () => {
      const privacyUpdates = {
        locationSharingEnabled: true,
        precisionLevel: 'approximate',
        shareWithTaskers: true,
        shareHistoryDuration: 14
      };

      const response = await request(app)
        .put('/api/location/privacy/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(privacyUpdates);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should respect privacy settings when sharing location', async () => {
      // First disable location sharing
      await request(app)
        .put('/api/location/privacy/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ locationSharingEnabled: false });

      // Try to update location
      const response = await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Location sharing is disabled');
    });
  });

  describe('Geofencing', () => {
    let geofenceId: string;

    test('should create a geofence', async () => {
      const geofenceData = {
        taskId: testTaskId,
        type: 'pickup',
        center: {
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10,
          timestamp: new Date()
        },
        radius: 100
      };

      const response = await request(app)
        .post('/api/location/geofence/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(geofenceData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('geofenceId');
      
      geofenceId = response.body.geofenceId;
    });

    test('should get task geofences', async () => {
      const response = await request(app)
        .get(`/api/location/geofence/task/${testTaskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('taskId', testTaskId);
      expect(response.body).toHaveProperty('geofenceIds');
      expect(Array.isArray(response.body.geofenceIds)).toBe(true);
    });

    test('should trigger geofence events', (done) => {
      // Start tracking first
      clientSocket.emit('location:start-tracking', { taskId: testTaskId });

      clientSocket.on('location:tracking-started', () => {
        // Send location update that should trigger geofence entry
        clientSocket.emit('location:update', {
          latitude: 40.7128, // Same as geofence center
          longitude: -74.0060,
          accuracy: 5,
          taskId: testTaskId
        });
      });

      clientSocket.on('geofence:event', (event: any) => {
        expect(event).toHaveProperty('eventType');
        expect(event).toHaveProperty('geofenceId');
        expect(event).toHaveProperty('userId', testUserId);
        done();
      });

      // Set timeout to prevent hanging
      setTimeout(() => {
        done(new Error('Geofence event not received within timeout'));
      }, 5000);
    });

    test('should get geofence events', async () => {
      const response = await request(app)
        .get(`/api/location/geofence/events/${testTaskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('taskId', testTaskId);
      expect(response.body).toHaveProperty('events');
      expect(Array.isArray(response.body.events)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid coordinates', async () => {
      const response = await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          latitude: 91, // Invalid latitude
          longitude: -74.0060,
          accuracy: 10
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Validation failed');
    });

    test('should handle missing authentication', async () => {
      const response = await request(app)
        .post('/api/location/update')
        .send({
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10
        });

      expect(response.status).toBe(401);
    });

    test('should handle invalid task ID', async () => {
      const response = await request(app)
        .post('/api/location/tracking/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ taskId: 'invalid-uuid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Validation failed');
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits on location updates', async () => {
      const locationData = {
        latitude: 40.7128,
        longitude: -74.0060,
        accuracy: 10
      };

      // Send many requests quickly
      const promises = Array(70).fill(null).map(() =>
        request(app)
          .post('/api/location/update')
          .set('Authorization', `Bearer ${authToken}`)
          .send(locationData)
      );

      const responses = await Promise.all(promises);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Data Persistence', () => {
    test('should persist location data in database', async () => {
      const db = getDatabase();
      
      // Update location
      await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10,
          taskId: testTaskId
        });

      // Check if data is persisted
      const result = await db.query(
        'SELECT * FROM route_points WHERE user_id = $1 AND task_id = $2',
        [testUserId, testTaskId]
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].latitude).toBe('40.71280000');
      expect(result.rows[0].longitude).toBe('-74.00600000');
    });

    test('should persist tracking sessions', async () => {
      const db = getDatabase();
      
      // Start tracking
      await request(app)
        .post('/api/location/tracking/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ taskId: testTaskId });

      // Check if session is persisted
      const result = await db.query(
        'SELECT * FROM location_tracking_sessions WHERE user_id = $1 AND task_id = $2',
        [testUserId, testTaskId]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].status).toBe('active');
    });
  });

  describe('Redis Caching', () => {
    test('should cache location data in Redis', async () => {
      const redis = getRedisClient();
      
      // Update location
      await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10
        });

      // Check if data is cached
      const cachedData = await redis.get(`location:user:${testUserId}`);
      expect(cachedData).toBeTruthy();
      
      const parsed = JSON.parse(cachedData!);
      expect(parsed.latitude).toBe(40.7128);
      expect(parsed.longitude).toBe(-74.0060);
    });

    test('should add user to geospatial index', async () => {
      const redis = getRedisClient();
      
      // Update location
      await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10
        });

      // Check if user is in geospatial index
      const nearbyUsers = await redis.geoRadius(
        'taskers:active',
        -74.0060,
        40.7128,
        1000,
        'm'
      );

      expect(nearbyUsers.some(user => user.member === testUserId)).toBe(true);
    });
  });
});
