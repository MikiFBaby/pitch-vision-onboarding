# QA Call Analyzer - Frontend Integration Guide

This document describes how to integrate with the QA Analysis workflow for real-time processing updates and results.

## Overview

The QA Analysis system processes audio call recordings through transcription and AI compliance analysis. The system provides:

1. **Webhook endpoint** for submitting files (immediate acknowledgment)
2. **Real-time milestone updates** via Supabase `processing_jobs` subscription
3. **Final results** via Supabase `QA Results` real-time subscription
4. **Completion notification** via Supabase real-time (status = 'completed')

---

## Architecture

```
┌─────────────┐     POST /webhook/UIDrop      ┌──────────────────────┐
│   Frontend  │ ──────────────────────────────▶│  QA System Main      │
│     App     │                                │  Workflow            │
│             │◀────────────────────────────── │                      │
│             │   Immediate: {"status":"received"}                    │
└──────┬──────┘                                └──────────┬───────────┘
       │                                                  │
       │                                                  │ Triggers (async)
       │                                                  ▼
       │                                       ┌──────────────────────┐
       │                                       │  QA Analysis v3      │
       │                                       │  (Subworkflow)       │
       │                                       └──────────┬───────────┘
       │                                                  │
       │  Subscribe to processing_jobs                    │  INSERT/UPDATE
       │  (batch_id filter)                               │
       ▼                                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                              Supabase                                │
│  ┌─────────────────────┐              ┌────────────────────────┐    │
│  │   processing_jobs   │              │       QA Results       │    │
│  │   (milestones)      │              │    (final results)     │    │
│  └─────────────────────┘              └────────────────────────┘    │
│           │                                       │                  │
│           │ Real-time subscription                │ Real-time sub    │
│           ▼                                       ▼                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Webhook Endpoint

### URL
```
POST https://n8n.pitchvision.io/webhook/UIDrop
```

### Request
- **Method:** POST
- **Content-Type:** multipart/form-data
- **Body:** Audio file (WAV, MP3, etc.)

### Example (JavaScript/Fetch)
```typescript
const uploadAudioFile = async (file: File): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('data', file);

  const response = await fetch('https://n8n.pitchvision.io/webhook/UIDrop', {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();
  return result;
};
```

### Immediate Response
The webhook responds **immediately** (does not wait for processing):
```json
{
  "status": "received",
  "message": "File received and processing started",
  "batch_id": "batch_1737234567890_abc123",
  "file_name": "225262_Jade ACA_Nancy Jabr_6163781099_12_23_2025.wav"
}
```

**Important:** This response only confirms the file was received. Use Supabase real-time subscriptions to track progress and get results.

---

## 2. Real-Time Milestone Updates

Subscribe to the `processing_jobs` table for real-time progress updates.

### Table: `processing_jobs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `batch_id` | TEXT | Unique batch identifier (use for filtering) |
| `file_name` | TEXT | Original file name |
| `status` | TEXT | Overall status: `pending`, `processing`, `completed`, `error` |
| `milestone` | TEXT | Current processing step (see milestone values below) |
| `progress_percent` | INTEGER | Progress percentage (0-100) |
| `estimated_seconds_remaining` | INTEGER | ETA in seconds |
| `error_message` | TEXT | Error details if status is `error` |
| `metadata` | JSONB | Additional metadata |
| `started_at` | TIMESTAMPTZ | When processing started |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |
| `completed_at` | TIMESTAMPTZ | When processing completed |
| `qa_result_id` | BIGINT | Foreign key to QA Results (set on completion) |

### Milestone Values

| Milestone | Progress | Description |
|-----------|----------|-------------|
| `upload_started` | 5% | File received, processing job created |
| `processing_started` | 10% | SFTP upload complete, processing initiated |
| `audio_split_complete` | 25% | Audio split into channels |
| `transcription_started` | 30% | WhisperX transcription started |
| `transcription_complete` | 60% | Transcription finished |
| `ai_analysis_started` | 70% | AI compliance analysis started |
| `analysis_complete` | 95% | AI analysis finished |
| `completed` | 100% | All processing complete, results stored |

### Supabase Real-Time Subscription (React Example)

```typescript
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ProcessingJob {
  id: string;
  batch_id: string;
  file_name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  milestone: string;
  progress_percent: number;
  estimated_seconds_remaining: number | null;
  error_message: string | null;
  updated_at: string;
  completed_at: string | null;
  qa_result_id: number | null;
}

export function useProcessingProgress(batchId: string | null) {
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!batchId) return;

    // Initial fetch
    const fetchJob = async () => {
      const { data } = await supabase
        .from('processing_jobs')
        .select('*')
        .eq('batch_id', batchId)
        .single();

      if (data) {
        setJob(data);
        setIsComplete(data.status === 'completed');
      }
    };
    fetchJob();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`processing-${batchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'processing_jobs',
          filter: `batch_id=eq.${batchId}`,
        },
        (payload) => {
          const updatedJob = payload.new as ProcessingJob;
          setJob(updatedJob);

          if (updatedJob.status === 'completed') {
            setIsComplete(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [batchId]);

  return { job, isComplete };
}
```

---

## 3. QA Results Real-Time Subscription

Once processing is complete, the results are stored in the `QA Results` table. Subscribe for real-time updates.

### Table: `QA Results`

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT | Primary key |
| `call_id` | TEXT | Unique call identifier (from filename) |
| `agent_name` | TEXT | Agent name extracted from filename |
| `campaign_type` | TEXT | Campaign name (e.g., "Jade ACA") |
| `phone_number` | TEXT | Prospect phone number |
| `call_date` | TEXT | Date of the call |
| `call_time` | TEXT | Time of the call |
| `call_duration` | TEXT | Duration (e.g., "4:58") |
| `call_status` | TEXT | `COMPLIANT`, `NON-COMPLIANT`, `NEEDS_REVIEW` |
| `compliance_score` | INTEGER | Score 0-100 |
| `risk_level` | TEXT | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `review_priority` | TEXT | `NORMAL`, `HIGH`, `URGENT` |
| `checklist` | JSONB | Detailed compliance checklist items |
| `violations` | JSONB | List of violations detected |
| `key_quotes` | JSONB | Important quotes from the call |
| `coaching_notes` | JSONB | AI-generated coaching suggestions |
| `summary` | TEXT | Call summary |
| `transcript` | TEXT | Full call transcript |
| `recording_url` | TEXT | R2 URL for audio playback |
| `auto_fail_triggered` | BOOLEAN | Whether auto-fail was triggered |
| `auto_fail_reasons` | JSONB | Reasons for auto-fail |
| `critical_moments` | JSONB | `{ auto_fails: [], passes: [], warnings: [] }` |
| `timeline_markers` | JSONB | `[{ event: "...", time: "0:32" }, ...]` |
| `suggested_listen_start` | TEXT | Timestamp where QA should start listening |
| `qa_status` | TEXT | `pending`, `approved`, `rejected` |
| `upload_type` | TEXT | `manual` or `automated` |

### Subscribe to New Results (React Example)

```typescript
export function useQAResults() {
  const [results, setResults] = useState<QAResult[]>([]);

  useEffect(() => {
    // Initial fetch
    const fetchResults = async () => {
      const { data } = await supabase
        .from('QA Results')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) setResults(data);
    };
    fetchResults();

    // Subscribe to new inserts and updates
    const channel = supabase
      .channel('qa-results-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'QA Results',
        },
        (payload) => {
          setResults((prev) => [payload.new as QAResult, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'QA Results',
        },
        (payload) => {
          setResults((prev) =>
            prev.map((r) => (r.id === payload.new.id ? payload.new as QAResult : r))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return results;
}
```

---

## 4. Complete Integration Example

```typescript
// components/QAUploader.tsx
import { useState } from 'react';
import { useProcessingProgress } from '@/hooks/useProcessingProgress';
import { useQAResults } from '@/hooks/useQAResults';

export function QAUploader() {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { job, isComplete } = useProcessingProgress(batchId);
  const results = useQAResults();

  const handleUpload = async (file: File) => {
    setIsUploading(true);

    const formData = new FormData();
    formData.append('data', file);

    try {
      // Upload to main workflow webhook
      const response = await fetch('https://n8n.pitchvision.io/webhook/UIDrop', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      // Store batch_id to track progress via Supabase real-time
      setBatchId(result.batch_id);

      console.log('Upload acknowledged:', result);
      // { status: "received", batch_id: "...", file_name: "..." }

    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="audio/*"
        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
        disabled={isUploading || (job && job.status === 'processing')}
      />

      {/* Progress Card - Shows while processing */}
      {job && job.status !== 'completed' && (
        <div className="progress-card">
          <h3>Processing: {job.file_name}</h3>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${job.progress_percent}%` }}
            />
          </div>
          <p>
            {job.milestone?.replace(/_/g, ' ')} - {job.progress_percent}%
          </p>
          {job.estimated_seconds_remaining && (
            <p>ETA: {Math.ceil(job.estimated_seconds_remaining / 60)} min remaining</p>
          )}
          {job.status === 'error' && (
            <p className="error">{job.error_message}</p>
          )}
        </div>
      )}

      {/* Completion notification */}
      {isComplete && (
        <div className="success-card">
          <p>Analysis complete! Results added to the table below.</p>
        </div>
      )}

      {/* Results table - Auto-updates via real-time subscription */}
      <table>
        <thead>
          <tr>
            <th>Call ID</th>
            <th>Agent</th>
            <th>Status</th>
            <th>Score</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.id}>
              <td>{r.call_id}</td>
              <td>{r.agent_name}</td>
              <td>{r.call_status}</td>
              <td>{r.compliance_score}</td>
              <td>{r.risk_level}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## 5. Checklist Item Structure

Each item in the `checklist` JSONB column has this structure:

```typescript
interface ChecklistItem {
  status: 'PASS' | 'FAIL' | 'UNCLEAR';
  confidence: number; // 0-100
  transcription_quality: 'CLEAR' | 'UNCLEAR' | 'PARTIAL';
  weight: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  points_possible: number;
  points_earned: number;
  evidence: string; // Quote with timestamp
  notes: string; // AI explanation
  time: string; // Timestamp (e.g., "0:32")
  timestamp_seconds: number; // Seconds for audio seeking
}
```

### Checklist Keys (ACA Campaign)
- `recorded_line_disclosure` - CRITICAL
- `agent_introduction` - HIGH
- `client_name_collection` - MEDIUM
- `company_name` - HIGH
- `first_mmw_confirmation` - CRITICAL (Medicare/Medicaid/Work)
- `second_mmw_confirmation` - CRITICAL
- `red_white_blue_card_first` - HIGH
- `red_white_blue_card_second` - HIGH
- `state_confirmation` - HIGH
- `verbal_consent` - CRITICAL
- `handoff` - MEDIUM

---

## 6. Timeline Markers for Audio Navigation

Use `timeline_markers` to create clickable timestamps in your audio player:

```typescript
interface TimelineMarker {
  event: string;
  time: string; // "0:32" format
}

// Example usage
const markers = result.timeline_markers;
// [
//   { event: "Recorded Line Disclosure", time: "0:32" },
//   { event: "First M/M/W Confirmation", time: "0:40" },
//   { event: "Verbal Consent", time: "0:56" }
// ]

// Convert to seconds for audio seeking
const parseTime = (time: string): number => {
  const parts = time.split(':').map(Number);
  return parts.length === 2
    ? parts[0] * 60 + parts[1]
    : parts[0] * 3600 + parts[1] * 60 + parts[2];
};
```

---

## 7. Error Handling

### Processing Errors
Monitor `processing_jobs.status === 'error'` and display `error_message`.

```typescript
if (job?.status === 'error') {
  showNotification({
    type: 'error',
    title: 'Processing Failed',
    message: job.error_message || 'Unknown error occurred'
  });
}
```

### Upload Errors
Handle HTTP errors from the initial upload:
- `200` - Success (file received)
- `400` - Bad request (invalid file format)
- `413` - File too large
- `500` - Server error

---

## Summary

1. **POST** audio file to `/webhook/UIDrop`
2. **Receive** immediate acknowledgment with `batch_id`
3. **Subscribe** to `processing_jobs` table filtered by `batch_id` for progress updates
4. **Subscribe** to `QA Results` table for final results
5. **Display** progress using `milestone` and `progress_percent`
6. **Auto-refresh** results when `processing_jobs.status === 'completed'`

The system uses Supabase real-time subscriptions for all progress and completion notifications, providing a responsive user experience without polling.
