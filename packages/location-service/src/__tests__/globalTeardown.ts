export default async function globalTeardown() {
  console.log('Cleaning up test environment...');
  
  // Clean up any global test resources here
  // For example, close database connections, stop test servers, etc.
  
  console.log('Test environment cleanup complete');
}
