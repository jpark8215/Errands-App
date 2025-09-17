module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages', '<rootDir>/apps'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'packages/**/*.ts',
    'apps/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/build/**',
    '!**/coverage/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 10000,
  moduleNameMapper: {
    '^@errands-buddy/(.*)$': '<rootDir>/packages/$1/src'
  },
  projects: [
    {
      displayName: 'shared-types',
      testMatch: ['<rootDir>/packages/shared-types/**/*.test.ts']
    },
    {
      displayName: 'auth-service',
      testMatch: ['<rootDir>/packages/auth-service/**/*.test.ts']
    },
    {
      displayName: 'user-service',
      testMatch: ['<rootDir>/packages/user-service/**/*.test.ts']
    },
    {
      displayName: 'task-service',
      testMatch: ['<rootDir>/packages/task-service/**/*.test.ts']
    },
    {
      displayName: 'matching-service',
      testMatch: ['<rootDir>/packages/matching-service/**/*.test.ts']
    },
    {
      displayName: 'payment-service',
      testMatch: ['<rootDir>/packages/payment-service/**/*.test.ts']
    },
    {
      displayName: 'notification-service',
      testMatch: ['<rootDir>/packages/notification-service/**/*.test.ts']
    },
    {
      displayName: 'location-service',
      testMatch: ['<rootDir>/packages/location-service/**/*.test.ts']
    },
    {
      displayName: 'api-gateway',
      testMatch: ['<rootDir>/packages/api-gateway/**/*.test.ts']
    }
  ]
};
