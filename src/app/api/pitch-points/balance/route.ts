import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateBalance, getExpiringSoonCount } from '@/utils/pitch-points-utils';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
    }

    const balance = await getOrCreateBalance(userId);
    const expiringSoon = await getExpiringSoonCount(userId, 7);

    return NextResponse.json({ success: true, balance, expiring_soon: expiringSoon });
  } catch (error) {
    console.error('Error fetching balance:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
