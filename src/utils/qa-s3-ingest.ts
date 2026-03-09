/**
 * QA S3 Auto-Ingest — discovers recordings in Chase/DialedIn S3 bucket
 * and submits them to the n8n QA pipeline.
 *
 * Flow: S3 ListObjects → dedup against qa_s3_ingestion_log → presign URL → POST to n8n webhook
 */
import { listS3Objects, getS3PresignedUrl, type S3Object } from './s3-client';
import { supabaseAdmin } from '@/lib/supabase-admin';

const N8N_WEBHOOK_URL = 'https://n8n.pitchvision.io/webhook/qa-upload';
const MAX_CONCURRENT = 10;
const BATCH_DELAY_MS = 2000;

// ─── Filename Parsing ───────────────────────────────────────────────

export interface ParsedRecording {
  agentName: string;
  phoneNumber: string;
  callDate: string;  // YYYY-MM-DD
  callTime: string;  // HH:MM:SS
  campaign?: string;
  originalFilename: string;
}

/**
 * Parse a DialedIn recording filename to extract metadata.
 *
 * Supported patterns (order matters — first match wins):
 *   1. AgentFirstName_AgentLastName_PhoneNumber_YYYYMMDD_HHMMSS.wav
 *   2. AgentFirstName-AgentLastName-PhoneNumber-MM-DD-YYYY-HH-MM-SS.wav
 *   3. Campaign_AgentName_PhoneNumber_Timestamp.wav
 *   4. PhoneNumber_YYYYMMDD_HHMMSS_FirstName_LastName.wav
 *   5. Generic fallback: extract any 10-digit phone + any date-like pattern
 */
export function parseDialedInFilename(rawPath: string): ParsedRecording | null {
  // Strip path, keep just filename
  const filename = rawPath.split('/').pop() || rawPath;
  const nameOnly = filename.replace(/\.[^.]+$/, ''); // strip extension

  // Pattern 1: FirstName_LastName_PhoneNumber_YYYYMMDD_HHMMSS
  const p1 = nameOnly.match(
    /^([A-Za-z]+)_([A-Za-z]+)_(\d{10,11})_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/,
  );
  if (p1) {
    return {
      agentName: `${p1[1]} ${p1[2]}`,
      phoneNumber: p1[3],
      callDate: `${p1[4]}-${p1[5]}-${p1[6]}`,
      callTime: `${p1[7]}:${p1[8]}:${p1[9]}`,
      originalFilename: filename,
    };
  }

  // Pattern 2: FirstName-LastName-PhoneNumber-MM-DD-YYYY-HH-MM-SS
  const p2 = nameOnly.match(
    /^([A-Za-z]+)-([A-Za-z]+)-(\d{10,11})-(\d{2})-(\d{2})-(\d{4})-(\d{2})-(\d{2})-(\d{2})$/,
  );
  if (p2) {
    return {
      agentName: `${p2[1]} ${p2[2]}`,
      phoneNumber: p2[3],
      callDate: `${p2[6]}-${p2[4]}-${p2[5]}`,
      callTime: `${p2[7]}:${p2[8]}:${p2[9]}`,
      originalFilename: filename,
    };
  }

  // Pattern 3: Campaign_AgentName_PhoneNumber_Timestamp
  const p3 = nameOnly.match(
    /^([A-Za-z]+)_([A-Za-z]+\s?[A-Za-z]*)_(\d{10,11})_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/,
  );
  if (p3) {
    return {
      campaign: p3[1],
      agentName: p3[2].trim(),
      phoneNumber: p3[3],
      callDate: `${p3[4]}-${p3[5]}-${p3[6]}`,
      callTime: `${p3[7]}:${p3[8]}:${p3[9]}`,
      originalFilename: filename,
    };
  }

  // Pattern 4: PhoneNumber_YYYYMMDD_HHMMSS_FirstName_LastName
  const p4 = nameOnly.match(
    /^(\d{10,11})_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_([A-Za-z]+)_([A-Za-z]+)$/,
  );
  if (p4) {
    return {
      phoneNumber: p4[1],
      callDate: `${p4[2]}-${p4[3]}-${p4[4]}`,
      callTime: `${p4[5]}:${p4[6]}:${p4[7]}`,
      agentName: `${p4[8]} ${p4[9]}`,
      originalFilename: filename,
    };
  }

  // Fallback: extract any 10-digit phone number and any 8-digit date
  const phoneMatch = nameOnly.match(/(\d{10,11})/);
  const dateMatch = nameOnly.match(/(\d{4})(\d{2})(\d{2})/);
  const timeMatch = nameOnly.match(/(\d{2})(\d{2})(\d{2})(?!\d)/);

  if (phoneMatch) {
    // Try to extract agent name: any leading alpha characters separated by _ or -
    const namePart = nameOnly.match(/^([A-Za-z][A-Za-z_-]+?)[\s_-]?\d/);
    const agentName = namePart
      ? namePart[1].replace(/[_-]/g, ' ').trim()
      : 'Unknown';

    return {
      agentName,
      phoneNumber: phoneMatch[1],
      callDate: dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : '',
      callTime: timeMatch ? `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}` : '',
      originalFilename: filename,
    };
  }

  return null;
}

// ─── Audio file filter ──────────────────────────────────────────────

const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.ogg', '.flac', '.wma']);

function isAudioFile(key: string): boolean {
  const ext = '.' + (key.split('.').pop() || '').toLowerCase();
  return AUDIO_EXTENSIONS.has(ext);
}

// ─── Dedup check ────────────────────────────────────────────────────

async function getAlreadyProcessedKeys(
  bucket: string,
  keys: string[],
): Promise<Set<string>> {
  if (keys.length === 0) return new Set();

  const processed = new Set<string>();
  const CHUNK = 200;

  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK);
    const { data } = await supabaseAdmin
      .from('qa_s3_ingestion_log')
      .select('s3_key')
      .eq('s3_bucket', bucket)
      .in('s3_key', chunk);

    for (const row of data ?? []) {
      processed.add(row.s3_key);
    }
  }

  return processed;
}

// ─── Submit to n8n ──────────────────────────────────────────────────

async function submitRecordingToN8n(
  presignedUrl: string,
  metadata: ParsedRecording,
): Promise<{ batchId?: string; jobId?: string }> {
  const batchId = `s3_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const payload = {
    file_url: presignedUrl,
    file_name: metadata.originalFilename,
    batch_id: batchId,
    upload_source: 's3_auto',
    agent_name: metadata.agentName,
  };

  const response = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`n8n webhook returned ${response.status}: ${text}`);
  }

  const data = await response.json();
  return { batchId: data.batch_id || batchId, jobId: data.job_id };
}

// ─── Batch orchestrator ─────────────────────────────────────────────

export interface BatchOptions {
  bucket: string;
  prefix: string;
  since?: Date;
  limit?: number;
  dryRun?: boolean;
}

export interface BatchResult {
  discovered: number;
  skippedDuplicates: number;
  skippedNonAudio: number;
  submitted: number;
  failed: number;
  results: { key: string; success: boolean; batchId?: string; jobId?: string; error?: string }[];
}

/**
 * Main orchestrator: discover new recordings from S3, dedup, and submit to QA pipeline.
 */
export async function processS3Batch(options: BatchOptions): Promise<BatchResult> {
  const { bucket, prefix, since, limit = 500, dryRun = false } = options;

  console.log(`[qa-s3-ingest] Listing s3://${bucket}/${prefix} since=${since?.toISOString() ?? 'all'}...`);

  // 1. List all objects
  const allObjects = await listS3Objects(bucket, prefix, { since, maxKeys: limit * 2 });
  console.log(`[qa-s3-ingest] Found ${allObjects.length} total objects`);

  // 2. Filter to audio files only
  const audioObjects = allObjects.filter((obj) => isAudioFile(obj.key));
  const skippedNonAudio = allObjects.length - audioObjects.length;
  console.log(`[qa-s3-ingest] ${audioObjects.length} audio files (${skippedNonAudio} non-audio skipped)`);

  // 3. Dedup against already-processed
  const allKeys = audioObjects.map((o) => o.key);
  const processedKeys = await getAlreadyProcessedKeys(bucket, allKeys);
  const newObjects = audioObjects.filter((o) => !processedKeys.has(o.key));
  const skippedDuplicates = audioObjects.length - newObjects.length;
  console.log(`[qa-s3-ingest] ${newObjects.length} new (${skippedDuplicates} already processed)`);

  // 4. Limit
  const toProcess = newObjects.slice(0, limit);

  if (dryRun) {
    console.log(`[qa-s3-ingest] DRY RUN — would process ${toProcess.length} files`);
    return {
      discovered: allObjects.length,
      skippedDuplicates,
      skippedNonAudio,
      submitted: 0,
      failed: 0,
      results: toProcess.map((o) => ({
        key: o.key,
        success: true,
        batchId: 'dry-run',
      })),
    };
  }

  // 5. Process in batches of MAX_CONCURRENT
  const results: BatchResult['results'] = [];
  let submitted = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i += MAX_CONCURRENT) {
    const batch = toProcess.slice(i, i + MAX_CONCURRENT);

    const batchResults = await Promise.allSettled(
      batch.map(async (obj) => {
        const metadata = parseDialedInFilename(obj.key);

        // Insert tracking row as 'pending'
        await supabaseAdmin.from('qa_s3_ingestion_log').upsert(
          {
            s3_key: obj.key,
            s3_bucket: bucket,
            file_size: obj.size,
            filename: obj.key.split('/').pop() || obj.key,
            agent_name: metadata?.agentName || null,
            phone_number: metadata?.phoneNumber || null,
            call_date: metadata?.callDate || null,
            call_time: metadata?.callTime || null,
            status: 'pending',
          },
          { onConflict: 's3_key,s3_bucket' },
        );

        try {
          const presignedUrl = await getS3PresignedUrl(bucket, obj.key, 900);

          const result = await submitRecordingToN8n(
            presignedUrl,
            metadata || {
              agentName: 'Unknown',
              phoneNumber: '',
              callDate: '',
              callTime: '',
              originalFilename: obj.key.split('/').pop() || obj.key,
            },
          );

          await supabaseAdmin
            .from('qa_s3_ingestion_log')
            .update({
              status: 'submitted',
              batch_id: result.batchId,
              job_id: result.jobId,
              submitted_at: new Date().toISOString(),
            })
            .eq('s3_key', obj.key)
            .eq('s3_bucket', bucket);

          return { key: obj.key, success: true, batchId: result.batchId, jobId: result.jobId };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);

          await supabaseAdmin
            .from('qa_s3_ingestion_log')
            .update({ status: 'failed', error_message: msg })
            .eq('s3_key', obj.key)
            .eq('s3_bucket', bucket);

          return { key: obj.key, success: false, error: msg };
        }
      }),
    );

    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        results.push(r.value);
        if (r.value.success) submitted++;
        else failed++;
      } else {
        results.push({ key: 'unknown', success: false, error: r.reason?.message ?? 'Unknown' });
        failed++;
      }
    }

    // Delay between batches to avoid overwhelming n8n
    if (i + MAX_CONCURRENT < toProcess.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log(`[qa-s3-ingest] Done: ${submitted} submitted, ${failed} failed`);

  return { discovered: allObjects.length, skippedDuplicates, skippedNonAudio, submitted, failed, results };
}

// ─── Stats query ────────────────────────────────────────────────────

export interface IngestionStats {
  total: number;
  pending: number;
  submitted: number;
  completed: number;
  failed: number;
  duplicate: number;
  lastRunAt: string | null;
}

export async function getIngestionStats(): Promise<IngestionStats> {
  const { data, error } = await supabaseAdmin
    .from('qa_s3_ingestion_log')
    .select('status', { count: 'exact', head: false });

  if (error) throw new Error(`Failed to query ingestion stats: ${error.message}`);

  const rows = data ?? [];
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.status] = (counts[row.status] || 0) + 1;
  }

  const { data: lastRun } = await supabaseAdmin
    .from('qa_s3_ingestion_log')
    .select('submitted_at')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    total: rows.length,
    pending: counts['pending'] || 0,
    submitted: counts['submitted'] || 0,
    completed: counts['completed'] || 0,
    failed: counts['failed'] || 0,
    duplicate: counts['duplicate'] || 0,
    lastRunAt: lastRun?.submitted_at ?? null,
  };
}
