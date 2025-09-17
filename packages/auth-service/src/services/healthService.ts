export const healthCheck = async () => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: 'healthy', // TODO: Add actual database health check
      redis: 'healthy'     // TODO: Add actual Redis health check
    }
  };

  return health;
};
