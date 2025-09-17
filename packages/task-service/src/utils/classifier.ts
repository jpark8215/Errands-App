import { TaskCategory } from '@errands-buddy/shared-types';

const keywordMap: Record<TaskCategory, string[]> = {
  [TaskCategory.SHOPPING]: ['shop', 'grocery', 'buy', 'purchase', 'store', 'market'],
  [TaskCategory.PICKUP_DELIVERY]: ['pickup', 'deliver', 'drop off', 'dropoff', 'parcel', 'package'],
  [TaskCategory.PHARMACY]: ['pharmacy', 'med', 'medicine', 'prescription', 'rx'],
  [TaskCategory.POST_OFFICE]: ['mail', 'post office', 'usps', 'fedex', 'ups', 'stamp'],
  [TaskCategory.PET_CARE]: ['pet', 'dog', 'cat', 'vet', 'walk', 'groom'],
  [TaskCategory.WAITING_SERVICES]: ['wait', 'line', 'queue', 'dmv', 'appointment'],
  [TaskCategory.ERRANDS]: ['errand', 'task', 'help', 'assist', 'run'],
  [TaskCategory.OTHER]: []
};

export function categorizeTask(title: string, description: string): TaskCategory {
  const text = `${title} ${description}`.toLowerCase();
  let best: { cat: TaskCategory; score: number } = { cat: TaskCategory.OTHER, score: 0 };

  for (const [cat, keywords] of Object.entries(keywordMap) as [TaskCategory, string[]][]) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) score += 1;
    }
    if (score > best.score) best = { cat, score };
  }

  return best.cat;
}
