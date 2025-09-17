import { BaseRepository } from '../BaseRepository';

// Mock the database connection
jest.mock('../../config/database', () => ({
  getPostgresPool: jest.fn(() => ({
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn()
  }))
}));

// Create a test repository class
class TestRepository extends BaseRepository<any> {
  constructor() {
    super('test_table', 'id');
  }
}

describe('BaseRepository', () => {
  let repository: TestRepository;
  let mockQuery: jest.Mock;
  let mockTransaction: jest.Mock;

  beforeEach(() => {
    repository = new TestRepository();
    mockQuery = jest.fn();
    mockTransaction = jest.fn();
    (repository as any).query = mockQuery;
    (repository as any).transaction = mockTransaction;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('should return entity when found', async () => {
      const mockEntity = { id: '1', name: 'Test Entity' };
      mockQuery.mockResolvedValue({ rows: [mockEntity] });

      const result = await repository.findById('1');

      expect(result).toEqual(mockEntity);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM test_table WHERE id = $1',
        ['1']
      );
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await repository.findById('1');

      expect(result).toBeNull();
    });
  });

  describe('findByIds', () => {
    it('should return entities for multiple IDs', async () => {
      const mockEntities = [
        { id: '1', name: 'Entity 1' },
        { id: '2', name: 'Entity 2' }
      ];
      mockQuery.mockResolvedValue({ rows: mockEntities });

      const result = await repository.findByIds(['1', '2']);

      expect(result).toEqual(mockEntities);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM test_table WHERE id IN ($1, $2)',
        ['1', '2']
      );
    });

    it('should return empty array for empty IDs', async () => {
      const result = await repository.findByIds([]);

      expect(result).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all entities with default options', async () => {
      const mockEntities = [
        { id: '1', name: 'Entity 1' },
        { id: '2', name: 'Entity 2' }
      ];
      mockQuery.mockResolvedValue({ rows: mockEntities });

      const result = await repository.findAll();

      expect(result).toEqual(mockEntities);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM test_table',
        []
      );
    });

    it('should apply limit and offset', async () => {
      const mockEntities = [{ id: '1', name: 'Entity 1' }];
      mockQuery.mockResolvedValue({ rows: mockEntities });

      const result = await repository.findAll({
        limit: 10,
        offset: 20,
        orderBy: 'name',
        orderDirection: 'DESC'
      });

      expect(result).toEqual(mockEntities);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM test_table ORDER BY name DESC LIMIT $1 OFFSET $2',
        [10, 20]
      );
    });
  });

  describe('findPaginated', () => {
    it('should return paginated results', async () => {
      const mockEntities = [{ id: '1', name: 'Entity 1' }];
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '25' }] }) // Count query
        .mockResolvedValueOnce({ rows: mockEntities }); // Data query

      const result = await repository.findPaginated(2, 10);

      expect(result).toEqual({
        data: mockEntities,
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3
      });

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('create', () => {
    it('should create new entity', async () => {
      const entityData = { name: 'New Entity', value: 100 };
      const createdEntity = { id: '1', ...entityData };
      mockQuery.mockResolvedValue({ rows: [createdEntity] });

      const result = await repository.create(entityData);

      expect(result).toEqual(createdEntity);
      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO test_table (name,value) VALUES ($1,$2) RETURNING *',
        ['New Entity', 100]
      );
    });
  });

  describe('update', () => {
    it('should update existing entity', async () => {
      const updateData = { name: 'Updated Entity' };
      const updatedEntity = { id: '1', ...updateData };
      mockQuery.mockResolvedValue({ rows: [updatedEntity] });

      const result = await repository.update('1', updateData);

      expect(result).toEqual(updatedEntity);
      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE test_table SET name = $1 WHERE id = $2 RETURNING *',
        ['Updated Entity', '1']
      );
    });

    it('should return null when entity not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await repository.update('1', { name: 'Updated' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete entity and return true', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await repository.delete('1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM test_table WHERE id = $1',
        ['1']
      );
    });

    it('should return false when entity not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await repository.delete('1');

      expect(result).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return true when entity exists', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: '1' }] });

      const result = await repository.exists('1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT 1 FROM test_table WHERE id = $1 LIMIT 1',
        ['1']
      );
    });

    it('should return false when entity does not exist', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await repository.exists('1');

      expect(result).toBe(false);
    });
  });

  describe('count', () => {
    it('should return count without where clause', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '10' }] });

      const result = await repository.count();

      expect(result).toBe(10);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT COUNT(*) FROM test_table',
        []
      );
    });

    it('should return count with where clause', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '5' }] });

      const result = await repository.count('status = $1', ['active']);

      expect(result).toBe(5);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT COUNT(*) FROM test_table WHERE status = $1',
        ['active']
      );
    });
  });

  describe('findOne', () => {
    it('should return first matching entity', async () => {
      const mockEntity = { id: '1', name: 'Entity 1' };
      mockQuery.mockResolvedValue({ rows: [mockEntity] });

      const result = await repository.findOne('status = $1', ['active']);

      expect(result).toEqual(mockEntity);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM test_table WHERE status = $1 LIMIT 1',
        ['active']
      );
    });

    it('should return null when no match', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await repository.findOne('status = $1', ['inactive']);

      expect(result).toBeNull();
    });
  });

  describe('findMany', () => {
    it('should return matching entities', async () => {
      const mockEntities = [
        { id: '1', name: 'Entity 1' },
        { id: '2', name: 'Entity 2' }
      ];
      mockQuery.mockResolvedValue({ rows: mockEntities });

      const result = await repository.findMany('status = $1', ['active']);

      expect(result).toEqual(mockEntities);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM test_table WHERE status = $1',
        ['active']
      );
    });

    it('should apply options when provided', async () => {
      const mockEntities = [{ id: '1', name: 'Entity 1' }];
      mockQuery.mockResolvedValue({ rows: mockEntities });

      const result = await repository.findMany(
        'status = $1',
        ['active'],
        { limit: 10, offset: 20, orderBy: 'name', orderDirection: 'DESC' }
      );

      expect(result).toEqual(mockEntities);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM test_table WHERE status = $1 ORDER BY name DESC LIMIT $2 OFFSET $3',
        ['active', 10, 20]
      );
    });
  });

  describe('bulkCreate', () => {
    it('should create multiple entities', async () => {
      const entitiesData = [
        { name: 'Entity 1', value: 100 },
        { name: 'Entity 2', value: 200 }
      ];
      const createdEntities = [
        { id: '1', name: 'Entity 1', value: 100 },
        { id: '2', name: 'Entity 2', value: 200 }
      ];
      mockQuery.mockResolvedValue({ rows: createdEntities });

      const result = await repository.bulkCreate(entitiesData);

      expect(result).toEqual(createdEntities);
      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO test_table (name,value) VALUES ($1,$2),($3,$4) RETURNING *',
        ['Entity 1', 100, 'Entity 2', 200]
      );
    });

    it('should return empty array for empty data', async () => {
      const result = await repository.bulkCreate([]);

      expect(result).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('bulkUpdate', () => {
    it('should update multiple entities', async () => {
      const updates = [
        { id: '1', data: { name: 'Updated 1' } },
        { id: '2', data: { name: 'Updated 2' } }
      ];
      const updatedEntities = [
        { id: '1', name: 'Updated 1' },
        { id: '2', name: 'Updated 2' }
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [updatedEntities[0]] })
        .mockResolvedValueOnce({ rows: [updatedEntities[1]] });

      const result = await repository.bulkUpdate(updates);

      expect(result).toEqual(updatedEntities);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('bulkDelete', () => {
    it('should delete multiple entities', async () => {
      mockQuery.mockResolvedValue({ rowCount: 3 });

      const result = await repository.bulkDelete(['1', '2', '3']);

      expect(result).toBe(3);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM test_table WHERE id IN ($1, $2, $3)',
        ['1', '2', '3']
      );
    });

    it('should return 0 for empty IDs', async () => {
      const result = await repository.bulkDelete([]);

      expect(result).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });
});
