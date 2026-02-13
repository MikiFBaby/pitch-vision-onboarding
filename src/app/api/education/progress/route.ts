import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// GET /api/education/progress?userId=<uuid>
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'userId is required' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from('user_education_progress')
            .select('*')
            .eq('user_id', userId);

        if (error) {
            console.error('[Education Progress] Fetch error:', error);
            return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 });
        }

        return NextResponse.json({ progress: data || [] });
    } catch (err) {
        console.error('[Education Progress] GET error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/education/progress
// Body: { userId, resourceId, type: 'video_complete' | 'quiz_result', quizScore?, quizPassed? }
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { userId, resourceId, type, quizScore, quizPassed } = body;

        if (!userId || !resourceId || !type) {
            return NextResponse.json({ error: 'userId, resourceId, and type are required' }, { status: 400 });
        }

        // Check if progress record exists
        const { data: existing } = await supabaseAdmin
            .from('user_education_progress')
            .select('*')
            .eq('user_id', userId)
            .eq('resource_id', resourceId)
            .maybeSingle();

        if (type === 'video_complete') {
            if (existing) {
                const { error } = await supabaseAdmin
                    .from('user_education_progress')
                    .update({
                        is_completed: true,
                        completed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', existing.id);

                if (error) {
                    console.error('[Education Progress] Update error:', error);
                    return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 });
                }
            } else {
                const { error } = await supabaseAdmin
                    .from('user_education_progress')
                    .insert({
                        user_id: userId,
                        resource_id: resourceId,
                        is_completed: true,
                        completed_at: new Date().toISOString(),
                    });

                if (error) {
                    console.error('[Education Progress] Insert error:', error);
                    return NextResponse.json({ error: 'Failed to insert progress' }, { status: 500 });
                }
            }
        } else if (type === 'quiz_result') {
            const passed = quizPassed === true;
            const score = typeof quizScore === 'number' ? quizScore : 0;

            if (existing) {
                // Only update if new score is better or not yet passed
                const shouldUpdate = !existing.quiz_passed || score > (existing.quiz_score || 0);
                const { error } = await supabaseAdmin
                    .from('user_education_progress')
                    .update({
                        quiz_score: shouldUpdate ? score : existing.quiz_score,
                        quiz_passed: existing.quiz_passed || passed,
                        quiz_attempts: (existing.quiz_attempts || 0) + 1,
                        last_attempt_at: new Date().toISOString(),
                        is_completed: existing.quiz_passed || passed,
                        completed_at: (existing.quiz_passed || passed) ? (existing.completed_at || new Date().toISOString()) : null,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', existing.id);

                if (error) {
                    console.error('[Education Progress] Quiz update error:', error);
                    return NextResponse.json({ error: 'Failed to update quiz progress' }, { status: 500 });
                }
            } else {
                const { error } = await supabaseAdmin
                    .from('user_education_progress')
                    .insert({
                        user_id: userId,
                        resource_id: resourceId,
                        quiz_score: score,
                        quiz_passed: passed,
                        quiz_attempts: 1,
                        last_attempt_at: new Date().toISOString(),
                        is_completed: passed,
                        completed_at: passed ? new Date().toISOString() : null,
                    });

                if (error) {
                    console.error('[Education Progress] Quiz insert error:', error);
                    return NextResponse.json({ error: 'Failed to insert quiz progress' }, { status: 500 });
                }
            }
        }

        // Return updated progress for this user
        const { data: updatedProgress } = await supabaseAdmin
            .from('user_education_progress')
            .select('*')
            .eq('user_id', userId);

        return NextResponse.json({ success: true, progress: updatedProgress || [] });
    } catch (err) {
        console.error('[Education Progress] POST error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
