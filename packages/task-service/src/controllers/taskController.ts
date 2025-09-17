import { Request, Response } from 'express';
import { TaskRepository } from '@errands-buddy/database';
import { TaskCategory, TaskCreationSchema, TaskSearchFiltersSchema, TaskUpdateSchema } from '@errands-buddy/shared-types';
import { categorizeTask } from '../utils/classifier';
import { logger } from '../utils/logger';

const tasks = new TaskRepository();

function parseDate(input: any): Date | undefined {
  if (!input) return undefined;
  return input instanceof Date ? input : new Date(input);
}

export async function createTask(req: Request, res: Response) {
  try {
    const body = req.body;
    // Coerce deadline to Date for schema validation
    if (body.deadline && !(body.deadline instanceof Date)) {
      body.deadline = new Date(body.deadline);
    }
    const parsed = TaskCreationSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid task data',
          details: parsed.error.flatten()
        }
      });
    }

    const data = parsed.data;

    // Auto-categorization suggestion
    let category: TaskCategory = data.category as TaskCategory;
    let suggestedCategory: TaskCategory | undefined;
    const autoCat = categorizeTask(data.title, data.description);
    if (!category || category === TaskCategory.OTHER) {
      category = autoCat;
    } else if (category !== autoCat) {
      suggestedCategory = autoCat;
    }

    const created = await tasks.createWithLocation({
      requesterId: (req as any).user?.id || body.requesterId, // temporary until auth is wired
      title: data.title,
      description: data.description,
      category,
      compensation: data.compensation,
      deadline: data.deadline,
      isUrgent: data.isUrgent,
      pickupLocation: data.location.pickup
        ? { ...data.location.pickup, address: data.location.pickup.address }
        : undefined,
      deliveryLocation: data.location.delivery
        ? { ...data.location.delivery, address: data.location.delivery.address }
        : undefined,
    });

    return res.status(201).json({ success: true, data: { task: created, suggestedCategory } });
  } catch (err: any) {
    logger.error('createTask error', { error: err?.message });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create task' } });
  }
}

export async function updateTask(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const body = req.body;
    if (body.deadline) body.deadline = parseDate(body.deadline);

    const parsed = TaskUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid update', details: parsed.error.flatten() } });
    }

    const existing = await tasks.findByIdWithLocation(id);
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });

    if (['completed', 'cancelled'].includes(existing.status as any)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Cannot update a completed or cancelled task' } });
    }

    const updated = await tasks.update(id, {
      title: parsed.data.title as any,
      description: parsed.data.description as any,
      compensation: parsed.data.compensation as any,
      deadline: parsed.data.deadline as any,
      is_urgent: parsed.data.isUrgent as any,
      updated_at: new Date() as any
    } as any);

    return res.json({ success: true, data: updated });
  } catch (err: any) {
    logger.error('updateTask error', { error: err?.message });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update task' } });
  }
}

export async function cancelTask(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const existing = await tasks.findByIdWithLocation(id);
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });

    if (['completed', 'cancelled'].includes(existing.status as any)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Task already completed or cancelled' } });
    }

    const ok = await tasks.updateStatus(id, 'cancelled' as any);
    return res.json({ success: ok, data: { id, status: 'cancelled' } });
  } catch (err: any) {
    logger.error('cancelTask error', { error: err?.message });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to cancel task' } });
  }
}

export async function assignTask(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { taskerId } = req.body;
    if (!taskerId) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'taskerId is required' } });

    const ok = await tasks.assignTask(id, taskerId);
    return res.json({ success: ok, data: { id, taskerId, status: 'assigned' } });
  } catch (err: any) {
    logger.error('assignTask error', { error: err?.message });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to assign task' } });
  }
}

export async function acceptTask(_req: Request, res: Response) {
  // Assignment already records accepted_at on creation in DB; this can be a no-op acknowledgment
  return res.json({ success: true });
}

export async function startTask(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { taskerId } = req.body;
    if (!taskerId) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'taskerId is required' } });

    const ok = await tasks.startTask(id, taskerId);
    return res.json({ success: ok, data: { id, status: 'in_progress' } });
  } catch (err: any) {
    logger.error('startTask error', { error: err?.message });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to start task' } });
  }
}

export async function completeTask(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { taskerId } = req.body;
    if (!taskerId) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'taskerId is required' } });

    const ok = await tasks.completeTask(id, taskerId);
    return res.json({ success: ok, data: { id, status: 'completed' } });
  } catch (err: any) {
    logger.error('completeTask error', { error: err?.message });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to complete task' } });
  }
}

export async function searchTasks(req: Request, res: Response) {
  try {
    const query: any = { ...req.query };
    if (query.radius) query.radius = parseFloat(query.radius);
    if (query.minCompensation) query.minCompensation = parseFloat(query.minCompensation);
    if (query.maxCompensation) query.maxCompensation = parseFloat(query.maxCompensation);
    if (query.center) {
      try {
        const c = typeof query.center === 'string' ? JSON.parse(query.center) : query.center;
        query.center = { latitude: parseFloat(c.latitude), longitude: parseFloat(c.longitude) };
      } catch {}
    }

    const parsed = TaskSearchFiltersSchema.safeParse(query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid filters', details: parsed.error.flatten() } });
    }

    const results = await tasks.searchTasks(parsed.data as any);
    return res.json({ success: true, data: results });
  } catch (err: any) {
    logger.error('searchTasks error', { error: err?.message });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to search tasks' } });
  }
}
