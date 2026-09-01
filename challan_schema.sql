-- ====================================================================
-- PostgreSQL Schema: Vehicle Challan Automation Database Table
-- Table Name: vehicle_challans
-- ====================================================================

-- 1. Create the vehicle_challans table
CREATE TABLE IF NOT EXISTS vehicle_challans (
    id BIGSERIAL PRIMARY KEY,
    search_reg_no VARCHAR(20) NOT NULL,
    rc_holder_name VARCHAR(255) DEFAULT 'N/A',
    total_amount_pending NUMERIC(10, 2) DEFAULT 0.00,
    notice_no VARCHAR(100) DEFAULT 'N/A',
    reg_no VARCHAR(20) DEFAULT 'N/A',
    notice_generation_date VARCHAR(50) DEFAULT 'N/A',
    violation_date VARCHAR(50) DEFAULT 'N/A',
    violation_time VARCHAR(50) DEFAULT 'N/A',
    point_name TEXT DEFAULT 'N/A',
    offence_description TEXT DEFAULT 'N/A',
    fine_amount NUMERIC(10, 2) DEFAULT 0.00,
    scraped_timestamp VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'PROCESSED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Composite unique constraint to allow idempotent upserting
    CONSTRAINT uq_vehicle_challan_notice UNIQUE (search_reg_no, notice_no, offence_description)
);

-- 2. Performance Indexes for fast query lookups
CREATE INDEX IF NOT EXISTS idx_challans_search_reg_no ON vehicle_challans(search_reg_no);
CREATE INDEX IF NOT EXISTS idx_challans_notice_no ON vehicle_challans(notice_no);
CREATE INDEX IF NOT EXISTS idx_challans_status ON vehicle_challans(status);
CREATE INDEX IF NOT EXISTS idx_challans_created_at ON vehicle_challans(created_at DESC);

-- 3. Comments for database documentation
COMMENT ON TABLE vehicle_challans IS 'Stores traffic police violation notices and fines scraped from Karnataka One portal';
COMMENT ON COLUMN vehicle_challans.search_reg_no IS 'Clean Registration Number used for portal search';
COMMENT ON COLUMN vehicle_challans.total_amount_pending IS 'Cumulative sum of pending fines for this vehicle';
COMMENT ON COLUMN vehicle_challans.fine_amount IS 'Specific fine amount for this individual violation notice';
