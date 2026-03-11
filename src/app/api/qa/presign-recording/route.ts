import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getS3PresignedUrl } from '@/utils/s3-client';

const QA_BUCKET = 'pitchvision-qa-recordings';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const key = searchParams.get('key');

  // Either pass s3_recording_key directly, or look it up by QA result ID
  let s3Key = key;

  if (!s3Key && id) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data, error } = await supabase
      .from('QA Results')
      .select('s3_recording_key')
      .eq('id', id)
      .maybeSingle();

    if (error || !data?.s3_recording_key) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 },
      );
    }

    s3Key = data.s3_recording_key;
  }

  if (!s3Key) {
    return NextResponse.json(
      { error: 'Provide id or key parameter' },
      { status: 400 },
    );
  }

  try {
    const url = await getS3PresignedUrl(QA_BUCKET, s3Key, 900);
    return NextResponse.json({ url, expires_in: 900 });
  } catch (err) {
    console.error('[presign-recording] Error:', err);
    return NextResponse.json(
      { error: 'Failed to generate presigned URL' },
      { status: 500 },
    );
  }
}
