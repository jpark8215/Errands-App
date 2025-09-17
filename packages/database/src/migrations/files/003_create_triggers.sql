-- UP
-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at 
    BEFORE UPDATE ON user_profiles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_availability_updated_at 
    BEFORE UPDATE ON user_availability 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at 
    BEFORE UPDATE ON tasks 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to update tasker location
CREATE OR REPLACE FUNCTION update_tasker_location()
RETURNS TRIGGER AS $$
BEGIN
    -- Update or insert tasker location
    INSERT INTO tasker_locations (tasker_id, location, last_updated, is_active, accuracy)
    VALUES (NEW.tasker_id, NEW.location, NOW(), true, NEW.accuracy)
    ON CONFLICT (tasker_id) 
    DO UPDATE SET 
        location = NEW.location,
        last_updated = NOW(),
        is_active = true,
        accuracy = NEW.accuracy;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create function to calculate task completion rate
CREATE OR REPLACE FUNCTION update_user_completion_rate()
RETURNS TRIGGER AS $$
DECLARE
    total_tasks INTEGER;
    completed_tasks INTEGER;
    completion_rate DECIMAL(3,2);
BEGIN
    -- Calculate completion rate for the tasker
    SELECT COUNT(*) INTO total_tasks
    FROM task_assignments 
    WHERE tasker_id = NEW.tasker_id;
    
    SELECT COUNT(*) INTO completed_tasks
    FROM task_assignments 
    WHERE tasker_id = NEW.tasker_id AND completed_at IS NOT NULL;
    
    completion_rate := CASE 
        WHEN total_tasks > 0 THEN (completed_tasks::DECIMAL / total_tasks::DECIMAL)
        ELSE 0
    END;
    
    -- Update user profile with completion rate
    UPDATE user_profiles 
    SET completed_tasks = completed_tasks,
        updated_at = NOW()
    WHERE user_id = NEW.tasker_id;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create function to update user rating
CREATE OR REPLACE FUNCTION update_user_rating()
RETURNS TRIGGER AS $$
DECLARE
    avg_rating DECIMAL(3,2);
BEGIN
    -- Calculate average rating for the user
    SELECT AVG(rating) INTO avg_rating
    FROM user_ratings 
    WHERE ratee_id = NEW.ratee_id;
    
    -- Update user profile with new rating
    UPDATE user_profiles 
    SET rating = COALESCE(avg_rating, 0),
        updated_at = NOW()
    WHERE user_id = NEW.ratee_id;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create function to handle task status changes
CREATE OR REPLACE FUNCTION handle_task_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- If task is completed, update completion timestamp
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        UPDATE task_assignments 
        SET completed_at = NOW()
        WHERE task_id = NEW.id AND completed_at IS NULL;
    END IF;
    
    -- If task is cancelled, update assignment
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
        UPDATE task_assignments 
        SET completed_at = NOW()
        WHERE task_id = NEW.id AND completed_at IS NULL;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER task_status_change_trigger
    AFTER UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION handle_task_status_change();

CREATE TRIGGER task_assignment_completion_trigger
    AFTER UPDATE ON task_assignments
    FOR EACH ROW EXECUTE FUNCTION update_user_completion_rate();

CREATE TRIGGER user_rating_update_trigger
    AFTER INSERT OR UPDATE ON user_ratings
    FOR EACH ROW EXECUTE FUNCTION update_user_rating();

-- DOWN
-- Drop triggers
DROP TRIGGER IF EXISTS user_rating_update_trigger ON user_ratings;
DROP TRIGGER IF EXISTS task_assignment_completion_trigger ON task_assignments;
DROP TRIGGER IF EXISTS task_status_change_trigger ON tasks;
DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
DROP TRIGGER IF EXISTS update_user_availability_updated_at ON user_availability;
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;

-- Drop functions
DROP FUNCTION IF EXISTS update_user_rating();
DROP FUNCTION IF EXISTS handle_task_status_change();
DROP FUNCTION IF EXISTS update_user_completion_rate();
DROP FUNCTION IF EXISTS update_tasker_location();
DROP FUNCTION IF EXISTS update_updated_at_column();
