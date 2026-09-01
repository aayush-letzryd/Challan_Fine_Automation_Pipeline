# 🚗 Challan Fine Automation Pipeline

An enterprise-grade, 100% autonomous web scraping pipeline built to extract traffic police violation notices and pending fine records from the **Karnataka One Citizen Portal** and synchronize them into **Google Sheets** and **PostgreSQL Database**.

---

## 🌟 Key Features

- **100% Zero-Touch OTP Login**: Automatically polls dedicated Google Sheet (`SMSOTP`) for incoming Karnataka One OTPs, filters out non-OTP/bank messages, and validates login without human intervention.
- **Smart Rate-Limiting & Batching**: Processes **50 vehicles per session** followed by an automated **15-minute cooldown** to avoid session locks.
- **Complete Fine Extraction**: Scrapes Notice Numbers, Generation Dates, Violation Dates/Times, Locations, Offence Descriptions, Fine Amounts, and computes the **Total Pending Fine** per vehicle.
- **Normal Timezone Formatting (IST)**: All timestamps are recorded in **Indian Standard Time (`DD-MM-YYYY HH:mm:ss`)**.
- **Dual Cloud Storage Sync**:
  - **Google Sheets**: Auto-synced live via Google Apps Script Webhook.
  - **PostgreSQL Database**: Idempotent upsert script (`db_sync.js`) and schema (`challan_schema.sql`).
- **Autonomous Cloud Scheduler**: Configured with **GitHub Actions** to execute every 2 days in the cloud without needing any local computer or IDE open.

---

## 🗄️ PostgreSQL Database Setup

### 1. DDL Schema (`challan_schema.sql`)
Run the following SQL in **DBeaver** or `psql` to create the `vehicle_challans` table:

```sql
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
    CONSTRAINT uq_vehicle_challan_notice UNIQUE (search_reg_no, notice_no, offence_description)
);

CREATE INDEX IF NOT EXISTS idx_challans_search_reg_no ON vehicle_challans(search_reg_no);
CREATE INDEX IF NOT EXISTS idx_challans_notice_no ON vehicle_challans(notice_no);
CREATE INDEX IF NOT EXISTS idx_challans_status ON vehicle_challans(status);
```

### 2. Syncing CSV Data to PostgreSQL
```bash
node db_sync.js
```

---

## 🚀 Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Run the pipeline
node main.js
```

---

## ⏰ Autonomous Cloud Execution (GitHub Actions)

The workflow located in [`.github/workflows/challan_pipeline.yml`](.github/workflows/challan_pipeline.yml) is scheduled to run on alternate days (`Monday, Wednesday, Friday at 9:30 AM IST`) automatically.
