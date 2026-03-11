/**
 * S3 client utility — shared across DialedIn report archival and QA recording ingestion.
 *
 * Provides:
 * - uploadReportToS3()  — existing DialedIn report upload
 * - listS3Objects()     — list objects in a bucket/prefix (for recording discovery)
 * - getS3PresignedUrl() — generate time-limited download URL
 * - getS3ObjectBuffer() — download an object directly
 */
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
}

// ---------- Client singletons ----------

let s3Client: S3Client | null = null;
let qaS3Client: S3Client | null = null;

export function getS3Client(): S3Client | null {
  if (s3Client) return s3Client;

  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    return null; // S3 not configured — skip silently
  }

  s3Client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  return s3Client;
}

/** S3 client for QA recordings bucket — uses QA_AWS_* env vars if set, falls back to AWS_* */
export function getQaS3Client(): S3Client | null {
  if (qaS3Client) return qaS3Client;

  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.QA_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.QA_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    return null;
  }

  qaS3Client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  return qaS3Client;
}

// ---------- Bucket-aware client routing ----------

const QA_RECORDINGS_BUCKET = 'pitchvision-qa-recordings';

function getClientForBucket(bucket: string): S3Client | null {
  return bucket === QA_RECORDINGS_BUCKET ? getQaS3Client() : getS3Client();
}

// ---------- Upload (existing) ----------

/**
 * Uploads a raw XLS report buffer to S3.
 * Returns the S3 key on success, or null on failure/not-configured.
 *
 * Key pattern: reports/{reportDate}/{reportType}/{timestamp}_{filename}
 */
export async function uploadReportToS3(
  buffer: Buffer,
  reportDate: string,
  reportType: string,
  filename: string,
): Promise<string | null> {
  const client = getS3Client();
  const bucket = process.env.DIALEDIN_S3_BUCKET;

  if (!client || !bucket) {
    return null; // S3 not configured
  }

  const key = `reports/${reportDate}/${reportType}/${Date.now()}_${filename}`;

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: 'application/vnd.ms-excel',
        Metadata: {
          'report-type': reportType,
          'report-date': reportDate,
          'original-filename': filename,
        },
      }),
    );
    return key;
  } catch (err) {
    console.warn('[S3] Upload failed (non-blocking):', err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------- List ----------

/**
 * List objects in an S3 bucket under a given prefix.
 * Optionally filter to only objects modified after `since`.
 * Handles pagination automatically (up to `maxKeys` total).
 */
export async function listS3Objects(
  bucket: string,
  prefix: string,
  options?: { since?: Date; maxKeys?: number },
): Promise<S3Object[]> {
  const client = getClientForBucket(bucket);
  if (!client) throw new Error('S3 not configured (missing AWS credentials)');

  const maxKeys = options?.maxKeys ?? 10_000;
  const since = options?.since;
  const results: S3Object[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: Math.min(1000, maxKeys - results.length),
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of response.Contents ?? []) {
      if (!obj.Key || !obj.Size || !obj.LastModified) continue;
      if (since && obj.LastModified < since) continue;

      results.push({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
        etag: obj.ETag,
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken && results.length < maxKeys);

  return results;
}

// ---------- Presigned URL ----------

/**
 * Generate a presigned download URL for an S3 object.
 * Default expiry: 15 minutes (900 seconds).
 */
export async function getS3PresignedUrl(
  bucket: string,
  key: string,
  expiresInSeconds = 900,
): Promise<string> {
  const client = getClientForBucket(bucket);
  if (!client) throw new Error('S3 not configured (missing AWS credentials)');

  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

// ---------- Direct download ----------

/**
 * Download an S3 object as a Buffer.
 */
export async function getS3ObjectBuffer(
  bucket: string,
  key: string,
): Promise<Buffer> {
  const client = getClientForBucket(bucket);
  if (!client) throw new Error('S3 not configured (missing AWS credentials)');

  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );

  if (!response.Body) throw new Error(`Empty body for s3://${bucket}/${key}`);

  // response.Body is a Readable stream in Node.js
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
