-- UP
-- Create indexes for performance

-- Users table indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_type ON users(user_type);
CREATE INDEX idx_users_verification_status ON users(verification_status);

-- Tasks table indexes
CREATE INDEX idx_tasks_requester ON tasks(requester_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_category ON tasks(category);
CREATE INDEX idx_tasks_deadline ON tasks(deadline);
CREATE INDEX idx_tasks_urgent ON tasks(is_urgent);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);

-- PostGIS spatial indexes
CREATE INDEX idx_task_locations_pickup ON task_locations USING GIST (pickup_location);
CREATE INDEX idx_task_locations_delivery ON task_locations USING GIST (delivery_location);
CREATE INDEX idx_task_locations_service_area ON task_locations USING GIST (service_area);
CREATE INDEX idx_tasker_locations_gist ON tasker_locations USING GIST (location);
CREATE INDEX idx_tasker_locations_active ON tasker_locations (is_active, last_updated);

-- Task assignments indexes
CREATE INDEX idx_task_assignments_task ON task_assignments(task_id);
CREATE INDEX idx_task_assignments_tasker ON task_assignments(tasker_id);
CREATE INDEX idx_task_assignments_accepted_at ON task_assignments(accepted_at);

-- Payments indexes
CREATE INDEX idx_payments_task ON payments(task_id);
CREATE INDEX idx_payments_requester ON payments(requester_id);
CREATE INDEX idx_payments_tasker ON payments(tasker_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at);

-- Notifications indexes
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- User ratings indexes
CREATE INDEX idx_user_ratings_rater ON user_ratings(rater_id);
CREATE INDEX idx_user_ratings_ratee ON user_ratings(ratee_id);
CREATE INDEX idx_user_ratings_task ON user_ratings(task_id);

-- Composite indexes for common queries
CREATE INDEX idx_tasks_status_category ON tasks(status, category);
CREATE INDEX idx_tasks_requester_status ON tasks(requester_id, status);
CREATE INDEX idx_task_assignments_tasker_status ON task_assignments(tasker_id, task_id) WHERE completed_at IS NULL;

-- DOWN
-- Drop indexes
DROP INDEX IF EXISTS idx_user_ratings_task;
DROP INDEX IF EXISTS idx_user_ratings_ratee;
DROP INDEX IF EXISTS idx_user_ratings_rater;
DROP INDEX IF EXISTS idx_notifications_created_at;
DROP INDEX IF EXISTS idx_notifications_read;
DROP INDEX IF EXISTS idx_notifications_user;
DROP INDEX IF EXISTS idx_payments_created_at;
DROP INDEX IF EXISTS idx_payments_status;
DROP INDEX IF EXISTS idx_payments_tasker;
DROP INDEX IF EXISTS idx_payments_requester;
DROP INDEX IF EXISTS idx_payments_task;
DROP INDEX IF EXISTS idx_task_assignments_accepted_at;
DROP INDEX IF EXISTS idx_task_assignments_tasker;
DROP INDEX IF EXISTS idx_task_assignments_task;
DROP INDEX IF EXISTS idx_tasker_locations_active;
DROP INDEX IF EXISTS idx_tasker_locations_gist;
DROP INDEX IF EXISTS idx_task_locations_service_area;
DROP INDEX IF EXISTS idx_task_locations_delivery;
DROP INDEX IF EXISTS idx_task_locations_pickup;
DROP INDEX IF EXISTS idx_tasks_created_at;
DROP INDEX IF EXISTS idx_tasks_urgent;
DROP INDEX IF EXISTS idx_tasks_deadline;
DROP INDEX IF EXISTS idx_tasks_category;
DROP INDEX IF EXISTS idx_tasks_status;
DROP INDEX IF EXISTS idx_tasks_requester;
DROP INDEX IF EXISTS idx_users_verification_status;
DROP INDEX IF EXISTS idx_users_type;
DROP INDEX IF EXISTS idx_users_phone;
DROP INDEX IF EXISTS idx_users_email;
