-- ====================================================================
-- PostgreSQL Schema: Vehicle Challan Automation Database Table
-- Table Name: vehicle_challans (Unified Dynamic Audit Trail)
-- ====================================================================

-- 1. Create dedicated vehicle_challans table
CREATE TABLE IF NOT EXISTS vehicle_challans (
    id BIGSERIAL PRIMARY KEY,
    vehicle_reg_no VARCHAR(20) NOT NULL,
    rc_holder_name VARCHAR(255) DEFAULT 'N/A',
    total_amount_pending NUMERIC(10, 2) DEFAULT 0.00,
    notice_no VARCHAR(100) DEFAULT 'N/A',
    notice_generation_date VARCHAR(50) DEFAULT 'N/A',
    violation_date VARCHAR(50) DEFAULT 'N/A',
    violation_time VARCHAR(50) DEFAULT 'N/A',
    point_name TEXT DEFAULT 'N/A',
    offence_description TEXT DEFAULT 'N/A',
    fine_amount NUMERIC(10, 2) DEFAULT 0.00,
    scraped_timestamp VARCHAR(50) NOT NULL,
    payment_status VARCHAR(20) DEFAULT 'UNPAID', -- 'UNPAID', 'PAID', 'DISPUTED'
    status VARCHAR(50) DEFAULT 'HAS_FINES',      -- 'HAS_FINES', 'NO_FINES'
    first_scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Composite unique constraint to allow idempotent upserting per violation notice
    CONSTRAINT uq_vehicle_challan_notice UNIQUE (vehicle_reg_no, notice_no, offence_description)
);

-- 2. Scrape Checkpoint Tracking Table (Replaces ephemeral container files)
CREATE TABLE IF NOT EXISTS challan_scrape_checkpoint (
    vehicle_reg_no VARCHAR(20) PRIMARY KEY,
    last_scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'PROCESSED',
    fine_count INT DEFAULT 0,
    total_fine NUMERIC(10, 2) DEFAULT 0.00
);

-- 3. Execution Log Table
CREATE TABLE IF NOT EXISTS vehicle_challan_scrape_logs (
    id BIGSERIAL PRIMARY KEY,
    vehicle_reg_no VARCHAR(20) NOT NULL,
    unpaid_notices_count INT DEFAULT 0,
    total_fine_amount NUMERIC(10, 2) DEFAULT 0.00,
    new_notices_added INT DEFAULT 0,
    paid_notices_detected INT DEFAULT 0,
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    execution_status VARCHAR(50) DEFAULT 'SUCCESS'
);

-- 4. Performance Indexes for fast query lookups
CREATE INDEX IF NOT EXISTS idx_challans_vehicle_reg_no ON vehicle_challans(vehicle_reg_no);
CREATE INDEX IF NOT EXISTS idx_challans_notice_no ON vehicle_challans(notice_no);
CREATE INDEX IF NOT EXISTS idx_challans_payment_status ON vehicle_challans(payment_status);
CREATE INDEX IF NOT EXISTS idx_challans_last_scraped_at ON vehicle_challans(last_scraped_at);
CREATE INDEX IF NOT EXISTS idx_challans_created_at ON vehicle_challans(created_at DESC);

-- 5. Documentation Comments
COMMENT ON TABLE vehicle_challans IS 'Stores traffic police violation notices and pending fine records from Karnataka One portal with paid-notice reconciliation';
COMMENT ON COLUMN vehicle_challans.vehicle_reg_no IS 'Vehicle Registration Number (Bangalore KA Vehicles)';
COMMENT ON COLUMN vehicle_challans.payment_status IS 'UNPAID for active fines, PAID for settled/reconciled fines';
