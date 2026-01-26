# UI Agent Instructions: Real-Time Milestone Updates

## Problem Summary
The n8n workflow sends milestone updates to Supabase's `processing_jobs` table, but the frontend isn't receiving updates.

---

## Step 1: Verify Supabase Table Exists

**Using Supabase MCP, run this query:**

```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'processing_jobs'
);
```

**If FALSE, create the table:**

```sql
CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  milestone TEXT,
  progress_percent INTEGER DEFAULT 0,
  estimated_seconds_remaining INTEGER,
  error_message TEXT,
  metadata JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_batch ON processing_jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);

ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON processing_jobs FOR ALL USING (true) WITH CHECK (true);
```

---

## Step 2: Enable Real-Time on the Table

**CRITICAL: Real-time must be explicitly enabled!**

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE processing_jobs;
```

**Verify it's enabled:**

```sql
SELECT * FROM pg_publication_tables WHERE tablename = 'processing_jobs';
```

Should return a row with `pubname = 'supabase_realtime'`.

---

## Step 3: Check for Recent Records

```sql
SELECT batch_id, file_name, status, milestone, progress_percent, error_message, updated_at
FROM processing_jobs
ORDER BY updated_at DESC
LIMIT 10;
```

**Expected:** You should see records with `batch_id` values like `batch_1737241082638_abc123`.

**If no records:** The Main Workflow's "Create Processing Job" HTTP POST is failing silently.

---

## Step 4: Verify Frontend Subscription Code

The subscription in `CallAnalyzer.tsx` should look like this:

```typescript
const subscribeToProgress = (batchId: string, fileId: string) => {
  console.log(`[Realtime] Subscribing to batch: ${batchId}`);

  const channel = supabase
    .channel(`job-${batchId}`)
    .on(
      'postgres_changes',
      {
        event: '*',  // Listen to INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'processing_jobs',
        filter: `batch_id=eq.${batchId}`,
      },
      (payload) => {
        console.log('[Realtime] Received update:', payload);
        const job = payload.new as ProcessingJob;
        // Update UI state...
      }
    )
    .subscribe((status) => {
      console.log(`[Realtime] Subscription status: ${status}`);
    });

  return channel;
};
```

**Key points:**
- Must use `postgres_changes` event type
- Schema must be `'public'`
- Filter format: `batch_id=eq.${batchId}` (PostgREST syntax)
- Add logging to debug subscription status

---

## Step 5: Debug Subscription Status

Add this logging to see if subscription connects:

```typescript
.subscribe((status, err) => {
  console.log(`[Realtime] Status: ${status}`);
  if (err) console.error('[Realtime] Error:', err);

  if (status === 'SUBSCRIBED') {
    console.log('[Realtime] Successfully subscribed!');
  } else if (status === 'CHANNEL_ERROR') {
    console.error('[Realtime] Channel error - check RLS policies');
  } else if (status === 'TIMED_OUT') {
    console.error('[Realtime] Connection timed out');
  }
});
```

---

## Step 6: Verify batch_id is Received from Webhook

After uploading, the webhook should return:

```json
{
  "status": "received",
  "message": "File received and processing started",
  "batch_id": "batch_1737241082638_abc123",
  "file_name": "recording.wav"
}
```

**In the frontend, verify:**

```typescript
const { batch_id } = await response.json();
console.log('[Upload] Received batch_id:', batch_id);

if (!batch_id) {
  console.error('[Upload] No batch_id returned!');
  return;
}

// Only subscribe if we have a batch_id
subscribeToProgress(batch_id, fileState.id);
```

---

## Step 7: Test Real-Time Manually

**Insert a test record via Supabase MCP:**

```sql
INSERT INTO processing_jobs (batch_id, file_name, status, milestone, progress_percent)
VALUES ('test_batch_123', 'test.wav', 'processing', 'processing_started', 10);
```

**Then update it:**

```sql
UPDATE processing_jobs
SET milestone = 'transcription_started', progress_percent = 40, updated_at = NOW()
WHERE batch_id = 'test_batch_123';
```

If the frontend subscription is working, you should see console logs when the UPDATE happens.

---

## Milestone Values Reference

| Milestone | Progress | Description |
|-----------|----------|-------------|
| `upload_received` | 2% | Main workflow received file |
| `processing_started` | 10% | Subworkflow started |
| `audio_split_complete` | 30% | Audio split into channels |
| `transcription_started` | 40% | Sent to WhisperX |
| `transcription_complete` | 70% | Transcripts received |
| `ai_analysis_started` | 80% | Sent to Gemini AI |
| `analysis_complete` | 100% | Results stored |
| `error` | N/A | Processing failed |

---

## Common Issues & Fixes

### Issue: "No updates received"
1. Check if table has realtime enabled (Step 2)
2. Check if RLS policy allows SELECT (Step 1)
3. Verify batch_id matches exactly (case-sensitive)
4. Check browser console for subscription status

### Issue: "Subscription status: CHANNEL_ERROR"
- RLS policy is blocking access
- Run: `CREATE POLICY "Allow all access" ON processing_jobs FOR ALL USING (true);`

### Issue: "batch_id is undefined"
- Main workflow's webhook response isn't including batch_id
- Check `Respond to Webhook` node in Main Workflow

### Issue: "Records exist but no updates"
- The Milestone nodes use PATCH (update) not INSERT
- The Main Workflow's `Create Processing Job` must INSERT first
- Verify both workflows are running

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  1. Upload file → POST /webhook/UIDrop                          │
│  2. Receive { batch_id } in response                            │
│  3. Subscribe to processing_jobs WHERE batch_id = X             │
│  4. Receive real-time updates via WebSocket                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MAIN WORKFLOW (n8n)                          │
│  1. Receive file                                                │
│  2. Generate batch_id                                           │
│  3. INSERT into processing_jobs (status: processing, 2%)        │
│  4. Call v3 subworkflow (async)                                 │
│  5. Return { batch_id } to frontend                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    V3 WORKFLOW (n8n)                            │
│  At each milestone:                                             │
│  - PATCH processing_jobs SET milestone=X, progress=Y            │
│  - Supabase broadcasts change via real-time                     │
│  - Frontend receives update                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE                                   │
│  Table: processing_jobs                                         │
│  Real-time: ENABLED                                             │
│  RLS: ENABLED with permissive policy                            │
└─────────────────────────────────────────────────────────────────┘
```
