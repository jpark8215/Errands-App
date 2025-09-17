export enum UserType {
  REQUESTER = 'requester',
  TASKER = 'tasker',
  BOTH = 'both'
}

export enum TaskStatus {
  DRAFT = 'draft',
  POSTED = 'posted',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  DISPUTED = 'disputed',
  RESOLVED = 'resolved',
  PAID = 'paid'
}

export enum TaskCategory {
  SHOPPING = 'shopping',
  PICKUP_DELIVERY = 'pickup_delivery',
  PHARMACY = 'pharmacy',
  POST_OFFICE = 'post_office',
  PET_CARE = 'pet_care',
  WAITING_SERVICES = 'waiting_services',
  ERRANDS = 'errands',
  OTHER = 'other'
}

export enum VerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed'
}

export enum NotificationType {
  TASK_ASSIGNED = 'task_assigned',
  TASK_ACCEPTED = 'task_accepted',
  TASK_STARTED = 'task_started',
  TASK_COMPLETED = 'task_completed',
  TASK_CANCELLED = 'task_cancelled',
  PAYMENT_PROCESSED = 'payment_processed',
  MESSAGE_RECEIVED = 'message_received',
  EMERGENCY_ALERT = 'emergency_alert'
}

export enum AvailabilityStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  BUSY = 'busy',
  AWAY = 'away'
}
