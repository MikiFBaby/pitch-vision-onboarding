# Frontend Real-Time Setup Instructions

## For UI Agent with Supabase MCP Access

---

## Step 1: Verify Real-Time is Enabled

Run this SQL query:

```sql
SELECT * FROM pg_publication_tables WHERE tablename = 'processing_jobs';
```

**Expected Result:** A row with `pubname = 'supabase_realtime'`

**If empty, run this to enable:**

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE processing_jobs;
```

---

## Step 2: Check Recent Records

```sql
SELECT batch_id, file_name, status, milestone, progress_percent, error_message, updated_at
FROM processing_jobs
ORDER BY updated_at DESC
LIMIT 10;
```

This shows if n8n is successfully writing to the table.

---

## Step 3: Test Real-Time Manually

**Insert a test record:**

```sql
INSERT INTO processing_jobs (batch_id, file_name, status, milestone, progress_percent)
VALUES ('test_realtime_123', 'test.wav', 'processing', 'processing_started', 10);
```

**Then update it:**

```sql
UPDATE processing_jobs
SET milestone = 'transcription_started', progress_percent = 40, updated_at = NOW()
WHERE batch_id = 'test_realtime_123';
```

If the frontend is running and subscribed, you should see console logs when the UPDATE happens.

**Clean up:**

```sql
DELETE FROM processing_jobs WHERE batch_id = 'test_realtime_123';
```

---

## Step 4: Verify RLS Policy

```sql
SELECT * FROM pg_policies WHERE tablename = 'processing_jobs';
```

Should show a permissive policy. If not:

```sql
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON processing_jobs FOR ALL USING (true) WITH CHECK (true);
```

---

## Frontend Subscription Code (Already Implemented)

The subscription in `src/components/qa/CallAnalyzer.tsx` is correct:

```typescript
const channel = supabase
  .channel(`job-${batchId}`)
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'processing_jobs',
      filter: `batch_id=eq.${batchId}`,
    },
    (payload) => {
      console.log('Realtime Update:', payload.new);
      // Updates UI state...
    }
  )
  .subscribe((status, err) => {
    console.log(`[Realtime] Status: ${status}`);
    if (err) console.error('[Realtime] Error:', err);
  });
```

---

## Debugging Checklist

1. **Open browser DevTools Console** before uploading a file
2. **Look for these logs:**
   - `Subscribing to job-{batchId}` - Subscription started
   - `[Realtime] Status: SUBSCRIBED` - Successfully connected
   - `Realtime Update: {...}` - Receiving updates

3. **If you see `CHANNEL_ERROR`:** RLS policy is blocking access
4. **If you see `TIMED_OUT`:** Network/WebSocket issue
5. **If no logs at all:** The `batch_id` from webhook response might be missing

---

## Verify Webhook Returns batch_id

When uploading, check the network response from the webhook. It should return:

```json
{
  "status": "received",
  "message": "File received and processing started",
  "batch_id": "batch_1737241082638_abc123",
  "file_name": "recording.wav"
}
```

If `batch_id` is missing, the frontend can't subscribe to the correct channel.

---

## Milestone Values Reference

| Milestone | Progress | When |
|-----------|----------|------|
| `upload_received` | 2% | Main workflow received file |
| `processing_started` | 10% | Subworkflow started |
| `audio_split_complete` | 30% | Audio split into channels |
| `transcription_started` | 40% | Sent to WhisperX |
| `transcription_complete` | 70% | Transcripts received |
| `ai_analysis_started` | 80% | Sent to Gemini AI |
| `analysis_complete` | 100% | Results stored |
| `error` | N/A | Processing failed |

---

## Quick Diagnostic Query

Run this after uploading a file to see if n8n is writing:

```sql
SELECT batch_id, milestone, progress_percent, status, updated_at
FROM processing_jobs
WHERE updated_at > NOW() - INTERVAL '5 minutes'
ORDER BY updated_at DESC;
```

If this shows records but frontend doesn't update:
- Real-time might not be enabled
- RLS policy might be blocking
- WebSocket connection might be failing

If this shows NO records:
- n8n workflow isn't reaching the milestone nodes
- Check n8n execution logs for errors
