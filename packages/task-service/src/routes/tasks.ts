import { Router } from 'express';
import * as TaskController from '../controllers/taskController';

export const taskRoutes = Router();

// Task creation
taskRoutes.post('/', TaskController.createTask);

// Task editing
taskRoutes.put('/:id', TaskController.updateTask);

// Task cancellation
taskRoutes.post('/:id/cancel', TaskController.cancelTask);

// Assignment and lifecycle
taskRoutes.post('/:id/assign', TaskController.assignTask);
taskRoutes.post('/:id/accept', TaskController.acceptTask);
taskRoutes.post('/:id/start', TaskController.startTask);
taskRoutes.post('/:id/complete', TaskController.completeTask);

// Search
taskRoutes.get('/search', TaskController.searchTasks);
