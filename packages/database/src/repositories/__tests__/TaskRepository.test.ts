import { TaskRepository } from '../TaskRepository';
import { TaskCategory, TaskStatus } from '@errands-buddy/shared-types';

// Mock the database connection
jest.mock('../../config/database', () => ({
  getPostgresPool: jest.fn(() => ({
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn()
  }))
}));

describe('TaskRepository', () => {
  let taskRepository: TaskRepository;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    taskRepository = new TaskRepository();
    mockQuery = jest.fn();
    (taskRepository as any).query = mockQuery;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createWithLocation', () => {
    it('should create task with location data', async () => {
      const taskData = {
        requesterId: 'user-1',
        title: 'Test Task',
        description: 'Test Description',
        category: TaskCategory.SHOPPING,
        compensation: 25.00,
        deadline: new Date('2024-12-31'),
        isUrgent: false,
        estimatedDuration: 60,
        pickupLocation: {
          latitude: 40.7128,
          longitude: -74.0059,
          accuracy: 5,
          timestamp: new Date(),
          address: '123 Main St, New York, NY'
        }
      };

      const mockTask = {
        id: 'task-1',
        requester_id: taskData.requesterId,
        title: taskData.title,
        description: taskData.description,
        category: taskData.category,
        compensation: taskData.compensation,
        deadline: taskData.deadline,
        is_urgent: taskData.isUrgent,
        estimated_duration: taskData.estimatedDuration,
        status: 'draft',
        created_at: new Date(),
        updated_at: new Date()
      };

      // Mock transaction
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [mockTask] }) // Task creation
          .mockResolvedValueOnce({ rows: [] }) // Location creation
      };

      (taskRepository as any).transaction = jest.fn().mockImplementation(async (callback) => {
        return await callback(mockClient);
      });

      // Mock findByIdWithLocation
      jest.spyOn(taskRepository, 'findByIdWithLocation').mockResolvedValue({
        id: 'task-1',
        requesterId: taskData.requesterId,
        title: taskData.title,
        description: taskData.description,
        category: taskData.category,
        compensation: taskData.compensation,
        deadline: taskData.deadline,
        status: 'draft',
        isUrgent: taskData.isUrgent,
        estimatedDuration: taskData.estimatedDuration,
        requirements: [],
        createdAt: mockTask.created_at,
        updatedAt: mockTask.updated_at,
        location: {
          pickup: taskData.pickupLocation
        }
      });

      const result = await taskRepository.createWithLocation(taskData);

      expect(result).toBeDefined();
      expect(result.title).toBe(taskData.title);
      expect(result.location.pickup).toEqual(taskData.pickupLocation);

      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('findNearbyTasks', () => {
    it('should find tasks within radius', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          requester_id: 'user-1',
          title: 'Nearby Task',
          description: 'Task description',
          category: 'shopping',
          compensation: 25.00,
          deadline: new Date(),
          is_urgent: false,
          estimated_duration: 60,
          status: 'posted',
          created_at: new Date(),
          updated_at: new Date(),
          pickup_location: { x: -74.0059, y: 40.7128 },
          pickup_address: '123 Main St',
          delivery_location: null,
          delivery_address: null,
          service_area: null,
          distance: 1000
        }
      ];

      mockQuery.mockResolvedValue({ rows: mockTasks });

      const options = {
        centerLat: 40.7128,
        centerLng: -74.0059,
        radiusKm: 5,
        limit: 10
      };

      const result = await taskRepository.findNearbyTasks(options);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Nearby Task');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ST_DWithin'),
        expect.arrayContaining([
          'POINT(-74.0059 40.7128)',
          5000, // 5km in meters
          10
        ])
      );
    });

    it('should filter by category when provided', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const options = {
        centerLat: 40.7128,
        centerLng: -74.0059,
        radiusKm: 5,
        category: TaskCategory.SHOPPING,
        limit: 10
      };

      await taskRepository.findNearbyTasks(options);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('t.category = $'),
        expect.arrayContaining([TaskCategory.SHOPPING])
      );
    });
  });

  describe('findTasksByRequester', () => {
    it('should find tasks by requester ID', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          requester_id: 'user-1',
          title: 'Task 1',
          description: 'Description 1',
          category: 'shopping',
          compensation: 25.00,
          deadline: new Date(),
          is_urgent: false,
          estimated_duration: 60,
          status: 'posted',
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockQuery.mockResolvedValue({ rows: mockTasks });

      const result = await taskRepository.findTasksByRequester('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].requesterId).toBe('user-1');

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM tasks WHERE requester_id = $1 ORDER BY created_at DESC',
        ['user-1']
      );
    });

    it('should filter by status when provided', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await taskRepository.findTasksByRequester('user-1', [TaskStatus.POSTED, TaskStatus.ASSIGNED]);

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM tasks WHERE requester_id = $1 AND status = ANY($2) ORDER BY created_at DESC',
        ['user-1', [TaskStatus.POSTED, TaskStatus.ASSIGNED]]
      );
    });
  });

  describe('updateStatus', () => {
    it('should update task status', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await taskRepository.updateStatus('task-1', TaskStatus.COMPLETED);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2',
        [TaskStatus.COMPLETED, 'task-1']
      );
    });

    it('should return false when task not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await taskRepository.updateStatus('nonexistent', TaskStatus.COMPLETED);

      expect(result).toBe(false);
    });
  });

  describe('assignTask', () => {
    it('should assign task to tasker', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rowCount: 1 }) // Update task status
          .mockResolvedValueOnce({ rows: [] }) // Create assignment
      };

      (taskRepository as any).transaction = jest.fn().mockImplementation(async (callback) => {
        return await callback(mockClient);
      });

      const result = await taskRepository.assignTask('task-1', 'tasker-1');

      expect(result).toBe(true);
      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('completeTask', () => {
    it('should complete task', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rowCount: 1 }) // Update assignment
          .mockResolvedValueOnce({ rowCount: 1 }) // Update task status
      };

      (taskRepository as any).transaction = jest.fn().mockImplementation(async (callback) => {
        return await callback(mockClient);
      });

      const result = await taskRepository.completeTask('task-1', 'tasker-1');

      expect(result).toBe(true);
      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });

    it('should return false when assignment not found', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rowCount: 0 }) // Update assignment fails
      };

      (taskRepository as any).transaction = jest.fn().mockImplementation(async (callback) => {
        return await callback(mockClient);
      });

      const result = await taskRepository.completeTask('task-1', 'tasker-1');

      expect(result).toBe(false);
    });
  });

  describe('getTaskStats', () => {
    it('should return task statistics', async () => {
      const mockStats = {
        total_tasks: 100,
        posted_tasks: 20,
        completed_tasks: 70,
        cancelled_tasks: 10,
        average_compensation: 22.50
      };

      mockQuery.mockResolvedValue({ rows: [mockStats] });

      const result = await taskRepository.getTaskStats();

      expect(result).toEqual({
        totalTasks: 100,
        postedTasks: 20,
        completedTasks: 70,
        cancelledTasks: 10,
        averageCompensation: 22.50
      });
    });
  });

  describe('searchTasks', () => {
    it('should search tasks with filters', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          requester_id: 'user-1',
          title: 'Shopping Task',
          description: 'Buy groceries',
          category: 'shopping',
          compensation: 25.00,
          deadline: new Date(),
          is_urgent: false,
          estimated_duration: 60,
          status: 'posted',
          created_at: new Date(),
          updated_at: new Date(),
          pickup_location: { x: -74.0059, y: 40.7128 },
          pickup_address: '123 Main St',
          delivery_location: null,
          delivery_address: null,
          service_area: null
        }
      ];

      mockQuery.mockResolvedValue({ rows: mockTasks });

      const filters = {
        category: TaskCategory.SHOPPING,
        minCompensation: 20,
        maxCompensation: 50,
        center: {
          latitude: 40.7128,
          longitude: -74.0059,
          accuracy: 5,
          timestamp: new Date()
        },
        radius: 5,
        isUrgent: false
      };

      const result = await taskRepository.searchTasks(filters);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Shopping Task');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('t.category = $'),
        expect.arrayContaining([TaskCategory.SHOPPING, 20, 50, false])
      );
    });
  });
});
