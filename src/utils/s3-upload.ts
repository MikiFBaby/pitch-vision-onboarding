/**
 * S3 upload utility for DialedIn report archival.
 * Fire-and-forget: S3 failures are logged but never block the ETL pipeline.
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

let s3Client: S3Client | null = null;

function getS3Client(): S3Client | null {
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
