-- Location Service Database Schema
-- This migration creates all necessary tables for the location tracking service

-- Enable PostGIS extension for geospatial operations
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Location tracking sessions table
CREATE TABLE IF NOT EXISTS location_tracking_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    task_id UUID NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'disconnected')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(user_id, task_id)
);

-- Route points table for storing location history during tracking
CREATE TABLE IF NOT EXISTS route_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    task_id UUID NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy DECIMAL(8, 2) DEFAULT 10.0,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    is_anonymized BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Create a point geometry column for efficient spatial queries
    location GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED
);

-- Geofences table
CREATE TABLE IF NOT EXISTS geofences (
    id VARCHAR(255) PRIMARY KEY,
    task_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('pickup', 'delivery', 'service_area', 'safety_zone')),
    center_lat DECIMAL(10, 8) NOT NULL,
    center_lng DECIMAL(11, 8) NOT NULL,
    radius INTEGER NOT NULL, -- in meters
    bounds JSONB, -- for polygon geofences
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Create a point geometry column for the center
    center_location GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)) STORED
);

-- Geofence events table
CREATE TABLE IF NOT EXISTS geofence_events (
    id VARCHAR(255) PRIMARY KEY,
    user_id UUID NOT NULL,
    task_id UUID NOT NULL,
    geofence_id VARCHAR(255) NOT NULL REFERENCES geofences(id),
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('enter', 'exit', 'dwell')),
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    metadata JSONB,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Create a point geometry column
    location GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED
);

-- Location privacy settings table
CREATE TABLE IF NOT EXISTS location_privacy_settings (
    user_id UUID PRIMARY KEY,
    location_sharing_enabled BOOLEAN DEFAULT TRUE,
    precision_level VARCHAR(20) DEFAULT 'approximate' CHECK (precision_level IN ('exact', 'approximate', 'city', 'disabled')),
    share_with_taskers BOOLEAN DEFAULT TRUE,
    share_with_clients BOOLEAN DEFAULT TRUE,
    share_history_duration INTEGER DEFAULT 7, -- days
    anonymize_after_hours INTEGER DEFAULT 24, -- hours
    allow_emergency_access BOOLEAN DEFAULT TRUE,
    geofence_notifications BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Location analytics table for aggregated data
CREATE TABLE IF NOT EXISTS location_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    date DATE NOT NULL,
    total_updates INTEGER DEFAULT 0,
    avg_accuracy DECIMAL(8, 2),
    distance_traveled DECIMAL(10, 2), -- in meters
    active_time_minutes INTEGER DEFAULT 0,
    geofence_events_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(user_id, date)
);

-- Create indexes for better performance

-- Indexes for location_tracking_sessions
CREATE INDEX IF NOT EXISTS idx_location_tracking_sessions_user_id ON location_tracking_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_location_tracking_sessions_task_id ON location_tracking_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_location_tracking_sessions_status ON location_tracking_sessions(status);
CREATE INDEX IF NOT EXISTS idx_location_tracking_sessions_start_time ON location_tracking_sessions(start_time);

-- Indexes for route_points
CREATE INDEX IF NOT EXISTS idx_route_points_user_id ON route_points(user_id);
CREATE INDEX IF NOT EXISTS idx_route_points_task_id ON route_points(task_id);
CREATE INDEX IF NOT EXISTS idx_route_points_timestamp ON route_points(timestamp);
CREATE INDEX IF NOT EXISTS idx_route_points_user_task ON route_points(user_id, task_id);
-- Spatial index for location-based queries
CREATE INDEX IF NOT EXISTS idx_route_points_location ON route_points USING GIST(location);

-- Indexes for geofences
CREATE INDEX IF NOT EXISTS idx_geofences_task_id ON geofences(task_id);
CREATE INDEX IF NOT EXISTS idx_geofences_type ON geofences(type);
CREATE INDEX IF NOT EXISTS idx_geofences_is_active ON geofences(is_active);
-- Spatial index for geofence center
CREATE INDEX IF NOT EXISTS idx_geofences_center_location ON geofences USING GIST(center_location);

-- Indexes for geofence_events
CREATE INDEX IF NOT EXISTS idx_geofence_events_user_id ON geofence_events(user_id);
CREATE INDEX IF NOT EXISTS idx_geofence_events_task_id ON geofence_events(task_id);
CREATE INDEX IF NOT EXISTS idx_geofence_events_geofence_id ON geofence_events(geofence_id);
CREATE INDEX IF NOT EXISTS idx_geofence_events_event_type ON geofence_events(event_type);
CREATE INDEX IF NOT EXISTS idx_geofence_events_timestamp ON geofence_events(timestamp);
-- Spatial index for event locations
CREATE INDEX IF NOT EXISTS idx_geofence_events_location ON geofence_events USING GIST(location);

-- Indexes for location_analytics
CREATE INDEX IF NOT EXISTS idx_location_analytics_user_id ON location_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_location_analytics_date ON location_analytics(date);
CREATE INDEX IF NOT EXISTS idx_location_analytics_user_date ON location_analytics(user_id, date);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_location_tracking_sessions_updated_at 
    BEFORE UPDATE ON location_tracking_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_geofences_updated_at 
    BEFORE UPDATE ON geofences 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_location_privacy_settings_updated_at 
    BEFORE UPDATE ON location_privacy_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create a function to calculate distance between two points
CREATE OR REPLACE FUNCTION calculate_distance(lat1 DECIMAL, lng1 DECIMAL, lat2 DECIMAL, lng2 DECIMAL)
RETURNS DECIMAL AS $$
BEGIN
    RETURN ST_Distance(
        ST_SetSRID(ST_MakePoint(lng1, lat1), 4326)::geography,
        ST_SetSRID(ST_MakePoint(lng2, lat2), 4326)::geography
    );
END;
$$ LANGUAGE plpgsql;

-- Create a function to check if a point is within a geofence
CREATE OR REPLACE FUNCTION point_in_geofence(
    point_lat DECIMAL, 
    point_lng DECIMAL, 
    geofence_id VARCHAR
)
RETURNS BOOLEAN AS $$
DECLARE
    geofence_record RECORD;
    point_geom GEOMETRY;
    geofence_geom GEOMETRY;
BEGIN
    -- Get geofence details
    SELECT center_lat, center_lng, radius, bounds 
    INTO geofence_record 
    FROM geofences 
    WHERE id = geofence_id AND is_active = TRUE;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Create point geometry
    point_geom := ST_SetSRID(ST_MakePoint(point_lng, point_lat), 4326);
    
    -- Check if geofence has bounds (polygon) or is circular
    IF geofence_record.bounds IS NOT NULL THEN
        -- Create polygon from bounds
        -- This is a simplified implementation - in practice, you'd parse the bounds JSON
        RETURN FALSE; -- Placeholder for polygon check
    ELSE
        -- Check circular geofence
        geofence_geom := ST_SetSRID(ST_MakePoint(geofence_record.center_lng, geofence_record.center_lat), 4326);
        RETURN ST_DWithin(point_geom::geography, geofence_geom::geography, geofence_record.radius);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create a view for active tracking sessions with latest location
CREATE OR REPLACE VIEW active_tracking_sessions AS
SELECT 
    lts.id,
    lts.user_id,
    lts.task_id,
    lts.start_time,
    lts.status,
    rp.latitude as last_latitude,
    rp.longitude as last_longitude,
    rp.accuracy as last_accuracy,
    rp.timestamp as last_location_update
FROM location_tracking_sessions lts
LEFT JOIN LATERAL (
    SELECT latitude, longitude, accuracy, timestamp
    FROM route_points 
    WHERE user_id = lts.user_id AND task_id = lts.task_id
    ORDER BY timestamp DESC
    LIMIT 1
) rp ON true
WHERE lts.status = 'active';

-- Grant permissions (adjust as needed for your user roles)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO location_service_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO location_service_user;
