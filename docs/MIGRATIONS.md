# Database Migrations

This document explains how to use the database migration system for the StorySpark backend.

## Overview

The migration system provides versioned database schema management with the ability to:
- Run migrations forward (up)
- Roll back migrations (down) 
- Check migration status
- Create new migration files

## Prerequisites

1. PostgreSQL database server running
2. Environment variables configured (copy `.env.example` to `.env`)
3. Node.js dependencies installed (`npm install`)

## Migration Commands

### Check Migration Status
```bash
npm run migrate:status
```
Shows which migrations have been executed and which are pending.

### Run Pending Migrations
```bash
npm run migrate:up
```
Executes all pending migrations in sequential order.

### Rollback Last Migration
```bash
npm run migrate:down
```
Rolls back the most recently executed migration.

### Create New Migration
```bash
npm run migrate:create "add_stories_table"
```
Creates a new migration file with timestamp prefix.

## Migration Files

Migration files are located in `src/migrations/` and follow the naming pattern:
```
001_create_users_table.js
002_create_devices_table.js
```

Each migration file must export `up` and `down` functions:

```javascript
/**
 * Run the migration
 * @param {import('pg').PoolClient} client - Database client
 */
async function up(client) {
    await client.query(`
        CREATE TABLE example (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    `);
}

/**
 * Rollback the migration
 * @param {import('pg').PoolClient} client - Database client
 */
async function down(client) {
    await client.query('DROP TABLE IF EXISTS example');
}

module.exports = { up, down };
```

## Current Schema

### Users Table
- `id` (UUID, Primary Key)
- `wechat_openid` (VARCHAR, UNIQUE, NOT NULL)
- `nickname` (VARCHAR)
- `avatar_url` (TEXT)
- `created_at` (TIMESTAMP WITH TIME ZONE)
- `updated_at` (TIMESTAMP WITH TIME ZONE)
- `last_login` (TIMESTAMP WITH TIME ZONE)

**Indexes:**
- `idx_users_wechat_openid`
- `idx_users_created_at`
- `idx_users_last_login`

### Devices Table
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key to users.id)
- `device_id` (VARCHAR, NOT NULL)
- `device_type` (VARCHAR)
- `os_version` (VARCHAR)
- `app_version` (VARCHAR)
- `is_active` (BOOLEAN, DEFAULT true)
- `created_at` (TIMESTAMP WITH TIME ZONE)
- `updated_at` (TIMESTAMP WITH TIME ZONE)

**Constraints:**
- `UNIQUE(user_id, device_id)`
- `device_type` must be one of: 'ios', 'android', 'web', 'other'

**Indexes:**
- `idx_devices_user_id`
- `idx_devices_device_id`
- `idx_devices_is_active`
- `idx_devices_created_at`
- `idx_devices_user_active` (composite)

## Best Practices

1. **Always test migrations** on a development database first
2. **Write rollback code** for every migration
3. **Use transactions** - migrations are automatically wrapped in transactions
4. **Add proper indexes** for performance
5. **Include data validation** constraints where appropriate
6. **Document migration purpose** in comments

## Troubleshooting

### Migration Fails
- Check database connection settings
- Verify PostgreSQL server is running
- Review migration SQL syntax
- Check for conflicting schema changes

### Rollback Issues
- Ensure rollback code properly undoes the up migration
- Check for foreign key constraints that prevent dropping tables
- Verify all dependencies are handled in correct order

## Database Connection

The migration system uses the following environment variables:
- `DB_HOST` - Database host (default: localhost)
- `DB_PORT` - Database port (default: 5432) 
- `DB_NAME` - Database name (default: storyspark)
- `DB_USER` - Database user (default: postgres)
- `DB_PASSWORD` - Database password (default: postgres)