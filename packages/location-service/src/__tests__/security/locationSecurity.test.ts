import request from 'supertest';
import { app } from '../../index';
import jwt from 'jsonwebtoken';
import { LocationPrivacyService } from '../../services/locationPrivacyService';

describe('Location Service Security Tests', () => {
  let validToken: string;
  let expiredToken: string;
  let invalidToken: string;
  let testUserId: string;

  beforeAll(() => {
    testUserId = '123e4567-e89b-12d3-a456-426614174000';
    
    // Valid token
    validToken = jwt.sign(
      { userId: testUserId, email: 'test@example.com', role: 'tasker' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Expired token
    expiredToken = jwt.sign(
      { userId: testUserId, email: 'test@example.com', role: 'tasker' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '-1h' }
    );

    // Invalid token
    invalidToken = 'invalid.token.here';
  });

  describe('Authentication Security', () => {
    test('should reject requests without authentication token', async () => {
      const response = await request(app)
        .post('/api/location/update')
        .send({
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Access denied');
    });

    test('should reject requests with invalid token', async () => {
      const response = await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${invalidToken}`)
        .send({
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid token');
    });

    test('should reject requests with expired token', async () => {
      const response = await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10
        });

      expect(response.status).toBe(401);
    });

    test('should accept requests with valid token', async () => {
      const response = await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10
        });

      expect(response.status).toBe(200);
    });
  });

  describe('Input Validation Security', () => {
    test('should reject malicious coordinate values', async () => {
      const maliciousInputs = [
        { latitude: 'DROP TABLE users;', longitude: -74.0060 },
        { latitude: 40.7128, longitude: '<script>alert("xss")</script>' },
        { latitude: '../../etc/passwd', longitude: -74.0060 },
        { latitude: 40.7128, longitude: 'javascript:alert(1)' }
      ];

      for (const input of maliciousInputs) {
        const response = await request(app)
          .post('/api/location/update')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            ...input,
            accuracy: 10
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Validation failed');
      }
    });

    test('should reject out-of-bounds coordinates', async () => {
      const invalidCoordinates = [
        { latitude: 91, longitude: -74.0060 }, // Invalid latitude
        { latitude: -91, longitude: -74.0060 }, // Invalid latitude
        { latitude: 40.7128, longitude: 181 }, // Invalid longitude
        { latitude: 40.7128, longitude: -181 }, // Invalid longitude
      ];

      for (const coords of invalidCoordinates) {
        const response = await request(app)
          .post('/api/location/update')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            ...coords,
            accuracy: 10
          });

        expect(response.status).toBe(400);
      }
    });

    test('should sanitize and validate accuracy values', async () => {
      const invalidAccuracies = [
        -1, // Negative accuracy
        10001, // Too high accuracy
        'invalid', // Non-numeric
        null, // Null value
      ];

      for (const accuracy of invalidAccuracies) {
        const response = await request(app)
          .post('/api/location/update')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            latitude: 40.7128,
            longitude: -74.0060,
            accuracy
          });

        expect(response.status).toBe(400);
      }
    });

    test('should validate UUID format for task IDs', async () => {
      const invalidTaskIds = [
        'not-a-uuid',
        '123',
        'DROP TABLE tasks;',
        '<script>alert("xss")</script>'
      ];

      for (const taskId of invalidTaskIds) {
        const response = await request(app)
          .post('/api/location/tracking/start')
          .set('Authorization', `Bearer ${validToken}`)
          .send({ taskId });

        expect(response.status).toBe(400);
      }
    });
  });

  describe('Authorization Security', () => {
    test('should prevent access to other users location without permission', async () => {
      const otherUserId = '987e6543-e21b-12d3-a456-426614174999';
      
      const response = await request(app)
        .get(`/api/location/current/${otherUserId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Access denied');
    });

    test('should prevent unauthorized route access', async () => {
      const otherUserId = '987e6543-e21b-12d3-a456-426614174999';
      const taskId = '123e4567-e89b-12d3-a456-426614174001';
      
      const response = await request(app)
        .get(`/api/location/tracking/route/${taskId}/${otherUserId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Access denied');
    });

    test('should enforce emergency access permissions', async () => {
      const targetUserId = '987e6543-e21b-12d3-a456-426614174999';
      
      const response = await request(app)
        .post('/api/location/emergency/locate')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          targetUserId,
          emergencyType: 'medical',
          reason: 'User reported medical emergency'
        });

      // Should fail if user doesn't have emergency access permissions
      expect([403, 404]).toContain(response.status);
    });
  });

  describe('Rate Limiting Security', () => {
    test('should enforce rate limits on location updates', async () => {
      const requests = Array(65).fill(null).map(() =>
        request(app)
          .post('/api/location/update')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            latitude: 40.7128,
            longitude: -74.0060,
            accuracy: 10
          })
      );

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    test('should enforce rate limits on API endpoints', async () => {
      const requests = Array(105).fill(null).map(() =>
        request(app)
          .get('/api/location/privacy/settings')
          .set('Authorization', `Bearer ${validToken}`)
      );

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Data Privacy Security', () => {
    test('should respect location sharing disabled setting', async () => {
      // First disable location sharing
      await request(app)
        .put('/api/location/privacy/settings')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ locationSharingEnabled: false });

      // Try to update location
      const response = await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Location sharing is disabled');
    });

    test('should apply precision level filtering', async () => {
      // Set precision to city level
      await request(app)
        .put('/api/location/privacy/settings')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ 
          locationSharingEnabled: true,
          precisionLevel: 'city' 
        });

      // Update location
      await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10
        });

      // Get location - should be anonymized
      const response = await request(app)
        .get('/api/location/current')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.location).toHaveProperty('isAnonymized', true);
      expect(response.body.location).toHaveProperty('accuracyRadius', 5000);
    });

    test('should not leak sensitive data in error messages', async () => {
      const response = await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          latitude: 'invalid',
          longitude: -74.0060,
          accuracy: 10
        });

      expect(response.status).toBe(400);
      expect(response.body.error).not.toContain('invalid');
      expect(response.body.error).not.toContain('DROP');
      expect(response.body.error).not.toContain('<script>');
    });
  });

  describe('Encryption Security', () => {
    test('should encrypt sensitive location data', async () => {
      const privacyService = new LocationPrivacyService();
      const location = {
        latitude: 40.7128,
        longitude: -74.0060,
        accuracy: 10,
        timestamp: new Date()
      };

      const encrypted = await privacyService.encryptLocationData(testUserId, location);
      
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toContain('40.7128');
      expect(encrypted).not.toContain('-74.0060');
      
      // Should be valid JSON
      const parsed = JSON.parse(encrypted);
      expect(parsed).toHaveProperty('encrypted');
      expect(parsed).toHaveProperty('iv');
      expect(parsed).toHaveProperty('authTag');
    });

    test('should decrypt location data correctly', async () => {
      const privacyService = new LocationPrivacyService();
      const originalLocation = {
        latitude: 40.7128,
        longitude: -74.0060,
        accuracy: 10,
        timestamp: new Date()
      };

      const encrypted = await privacyService.encryptLocationData(testUserId, originalLocation);
      const decrypted = await privacyService.decryptLocationData(testUserId, encrypted);

      expect(decrypted.latitude).toBe(originalLocation.latitude);
      expect(decrypted.longitude).toBe(originalLocation.longitude);
      expect(decrypted.accuracy).toBe(originalLocation.accuracy);
    });

    test('should fail decryption with wrong user ID', async () => {
      const privacyService = new LocationPrivacyService();
      const location = {
        latitude: 40.7128,
        longitude: -74.0060,
        accuracy: 10,
        timestamp: new Date()
      };

      const encrypted = await privacyService.encryptLocationData(testUserId, location);
      
      await expect(
        privacyService.decryptLocationData('wrong-user-id', encrypted)
      ).rejects.toThrow();
    });
  });

  describe('SQL Injection Prevention', () => {
    test('should prevent SQL injection in location queries', async () => {
      const maliciousUserId = "'; DROP TABLE route_points; --";
      
      const response = await request(app)
        .get(`/api/location/current/${maliciousUserId}`)
        .set('Authorization', `Bearer ${validToken}`);

      // Should fail validation, not execute SQL
      expect(response.status).toBe(400);
    });

    test('should prevent SQL injection in task ID parameters', async () => {
      const maliciousTaskId = "'; DELETE FROM tasks; --";
      
      const response = await request(app)
        .get(`/api/location/geofence/task/${maliciousTaskId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(400);
    });
  });

  describe('Cross-Site Scripting (XSS) Prevention', () => {
    test('should sanitize location metadata', async () => {
      const xssPayload = '<script>alert("xss")</script>';
      
      const response = await request(app)
        .post('/api/location/geofence/create')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          taskId: '123e4567-e89b-12d3-a456-426614174001',
          type: 'pickup',
          center: {
            latitude: 40.7128,
            longitude: -74.0060,
            accuracy: 10,
            timestamp: new Date()
          },
          radius: 100,
          metadata: {
            description: xssPayload,
            address: xssPayload
          }
        });

      // Should either reject or sanitize the input
      if (response.status === 200) {
        // If accepted, verify XSS payload is sanitized
        const geofenceResponse = await request(app)
          .get(`/api/location/geofence/task/123e4567-e89b-12d3-a456-426614174001`)
          .set('Authorization', `Bearer ${validToken}`);

        expect(JSON.stringify(geofenceResponse.body)).not.toContain('<script>');
      } else {
        expect(response.status).toBe(400);
      }
    });
  });

  describe('Information Disclosure Prevention', () => {
    test('should not expose internal error details in production', async () => {
      // Temporarily set NODE_ENV to production
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const response = await request(app)
          .post('/api/location/update')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            latitude: 'force-error',
            longitude: -74.0060,
            accuracy: 10
          });

        expect(response.status).toBe(400);
        expect(response.body).not.toHaveProperty('stack');
        expect(response.body.error).not.toContain('ValidationError');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    test('should not expose database connection details in errors', async () => {
      // This test would require mocking database errors
      // For now, we'll test that error messages don't contain sensitive info
      const response = await request(app)
        .get('/api/location/current/invalid-uuid')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).not.toContain('postgres');
      expect(response.body.error).not.toContain('localhost');
      expect(response.body.error).not.toContain('password');
    });
  });

  describe('Session Security', () => {
    test('should handle concurrent location updates securely', async () => {
      const concurrentRequests = Array(10).fill(null).map((_, index) =>
        request(app)
          .post('/api/location/update')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            latitude: 40.7128 + (index * 0.001),
            longitude: -74.0060 + (index * 0.001),
            accuracy: 10
          })
      );

      const responses = await Promise.all(concurrentRequests);
      const successfulResponses = responses.filter(r => r.status === 200);
      
      // All requests should succeed (no race conditions)
      expect(successfulResponses.length).toBe(10);
    });

    test('should properly clean up tracking sessions on disconnect', async () => {
      const taskId = '123e4567-e89b-12d3-a456-426614174001';
      
      // Start tracking
      await request(app)
        .post('/api/location/tracking/start')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ taskId });

      // Stop tracking
      const response = await request(app)
        .post('/api/location/tracking/stop')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ taskId });

      expect(response.status).toBe(200);
    });
  });
});
