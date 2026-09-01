# 🚗 Challan Fine Automation Pipeline

An enterprise-grade, 100% autonomous data scraping and synchronization pipeline built to extract traffic police violation notices and pending fine records from the **Karnataka One Citizen Portal** and synchronize them into **Google Sheets** and **PostgreSQL Database**.

---

## 🌟 Key Features

- **100% Zero-Touch OTP Login**: Automatically polls dedicated Google Sheet (`SMSOTP`) for incoming Karnataka One OTPs, filters out non-OTP/bank messages, and validates login without human intervention.
- **Smart Rate-Limiting & Batching**: Processes **50 vehicles per session** followed by an automated **15-minute cooldown** to avoid session locks.
- **Complete Fine Extraction**: Scrapes Notice Numbers, Generation Dates, Violation Dates/Times, Locations, Offence Descriptions, Fine Amounts, and computes the **Total Pending Fine** per vehicle.
- **Normal Timezone Formatting (IST)**: All timestamps are recorded in **Indian Standard Time (`DD-MM-YYYY HH:mm:ss`)**.
- **Dual Cloud Storage Sync**:
  - **Google Sheets**: Auto-synced live via Google Apps Script Webhook.
  - **PostgreSQL Database**: Idempotent upsert sync script ([`db_sync.js`](db_sync.js)) and DDL schema ([`challan_schema.sql`](challan_schema.sql)).
- **Autonomous Cloud Scheduler**: Configured with **GitHub Actions** to execute on alternate days in the cloud without needing any local computer or IDE open.

---

## 🗄️ Database & Sync Setup

1. **Database Schema**: Execute the DDL script in [`challan_schema.sql`](challan_schema.sql) in DBeaver / PostgreSQL to set up the `vehicle_challans` table and indexes.
2. **PostgreSQL Sync**: Run the database synchronization script to import/upsert all scraped records:
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

The scheduled workflow located in [`.github/workflows/challan_pipeline.yml`](.github/workflows/challan_pipeline.yml) executes on **alternate days (Monday, Wednesday, Friday at 9:30 AM IST)** completely hands-free.
