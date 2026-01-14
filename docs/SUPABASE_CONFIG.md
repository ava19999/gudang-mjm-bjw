# Supabase Configuration Documentation

## Overview
This document describes the Supabase configuration for the Stock Management application, which supports multiple stores (MJM and BJW) using separate database tables.

## Configuration Files

### 1. Environment Variables (`.env`)
```env
SUPABASE_URL="https://doyyghsijggiibkcktuq.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveXlnaHNpamdnaWlia2NrdHVxIiwicm9sZSIsImlhdCI6MTc2NTI1OTc1NiwiZXhwIjoyMDgwODM1NzU2fQ.HMq3LhppPRiHenYYZPtOMIX9BKkyqQUqCoCdAjIN3bo"
```

**Note:** The ANON_KEY was updated on 2026-01-14. The JWT payload in this key appears to be missing the role value field (shows `"role",` instead of `"role":"anon",`). While the key is used as provided, if authentication issues occur with Supabase API, the key should be regenerated in the Supabase dashboard with a proper payload structure.

### 2. Supabase Client (`lib/supabase.ts`)
The Supabase client is initialized with the URL and ANON_KEY from the environment configuration.

## Database Tables

The application uses store-specific tables for inventory management:

### Store-to-Table Mapping
- **MJM Store** → `base_mjm` table
- **BJW Store** → `base_bjw` table
- **Default/Legacy** → `base` table (fallback for backward compatibility)

This mapping is handled by the `getTableName()` function in `services/supabaseService.ts`.

## Debugging Data Access Issues

The service layer now includes enhanced logging to help diagnose data access issues:

### Console Logs
All fetch operations now log:
- Table name being accessed
- Store parameter value
- Number of records fetched
- Error details (message, code, hint) if any errors occur

Example log output:
```
[SupabaseService] Using table: base_mjm for store: mjm
[fetchInventoryPaginated] Fetching from table: base_mjm, page: 1, limit: 50
[fetchInventoryPaginated] Successfully fetched 25 items from base_mjm
```

### Common Issues and Solutions

#### 1. Empty Data Response
**Symptom:** API call succeeds but returns 0 items
**Causes:**
- RLS policies not configured correctly
- Tables are actually empty
- Store parameter not being passed correctly

**Debug Steps:**
1. Check browser console for table name being used
2. Verify RLS policies in Supabase dashboard
3. Check if data exists in the correct table using Supabase SQL editor

#### 2. Authentication Errors
**Symptom:** 401 Unauthorized or "JWT expired" errors
**Causes:**
- Invalid or expired ANON_KEY
- API key doesn't match Supabase project

**Debug Steps:**
1. Verify SUPABASE_URL matches your project
2. Regenerate ANON_KEY in Supabase dashboard if needed
3. Update both `.env` and `lib/supabase.ts` with new key

#### 3. RLS Policy Errors
**Symptom:** Error message mentions "row-level security"
**Causes:**
- RLS enabled but no policies defined
- Policies too restrictive

**Debug Steps:**
1. Temporarily disable RLS to verify it's the issue
2. Add appropriate SELECT policies for public/anon access
3. Test queries in Supabase SQL editor

## Testing Data Access

To verify the configuration is working:

1. **Check Store Context:**
   - Login to the application
   - Select MJM or BJW store
   - Verify correct store is set in localStorage

2. **Verify Table Access:**
   - Open browser console
   - Navigate to Dashboard/Inventory view
   - Look for `[SupabaseService]` and `[fetchInventory*]` logs
   - Confirm correct table is being accessed

3. **Check Data Loading:**
   - Items should display in the inventory list
   - If empty, check console for errors
   - Verify data exists in Supabase dashboard

## Recent Changes (2026-01-14)

### Updated:
1. **SUPABASE_ANON_KEY** - Updated to newer key with extended expiration (2080)
2. **Enhanced Logging** - Added detailed console logging throughout data access layer
3. **Error Handling** - Improved error messages with more context

### Unchanged:
- SUPABASE_URL remains the same
- Table structure and naming conventions unchanged
- Store-to-table mapping logic unchanged
- All fetch functions maintain backward compatibility
