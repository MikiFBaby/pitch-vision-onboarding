import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateCertificateBuffer } from '@/utils/certificate-pdf-server';

// POST /api/education/certificate
// Body: { userId }
// Generates certificate PDF, uploads to storage, records to employee_directory
export async function POST(req: Request) {
    try {
        const { userId } = await req.json();

        if (!userId) {
            return NextResponse.json({ error: 'userId is required' }, { status: 400 });
        }

        // 1. Look up user to get employee_id
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('id, email, first_name, last_name, employee_id')
            .eq('id', userId)
            .maybeSingle();

        if (userError || !user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // 2. Get all educational resources to know what needs to be completed
        const { data: resources } = await supabaseAdmin
            .from('educational_resources')
            .select('id, type, chapter_number')
            .eq('is_published', true);

        if (!resources || resources.length === 0) {
            return NextResponse.json({ error: 'No educational resources found' }, { status: 400 });
        }

        // Group by chapter — each chapter needs video completed + quiz passed
        const chapterMap = new Map<number, { videoId?: string; quizId?: string }>();
        for (const r of resources) {
            if (!chapterMap.has(r.chapter_number)) {
                chapterMap.set(r.chapter_number, {});
            }
            const ch = chapterMap.get(r.chapter_number)!;
            if (r.type === 'video') ch.videoId = r.id;
            if (r.type === 'quiz') ch.quizId = r.id;
        }

        // 3. Get user's progress
        const { data: progress } = await supabaseAdmin
            .from('user_education_progress')
            .select('resource_id, is_completed, quiz_passed')
            .eq('user_id', userId);

        const progressMap = new Map<string, { is_completed: boolean; quiz_passed: boolean }>();
        if (progress) {
            for (const p of progress) {
                progressMap.set(p.resource_id, p);
            }
        }

        // 4. Verify ALL chapters are completed
        for (const [chNum, ch] of chapterMap.entries()) {
            if (ch.videoId) {
                const vp = progressMap.get(ch.videoId);
                if (!vp?.is_completed) {
                    return NextResponse.json({
                        error: `Chapter ${chNum} video not completed`,
                        allCompleted: false,
                    }, { status: 400 });
                }
            }
            if (ch.quizId) {
                const qp = progressMap.get(ch.quizId);
                if (!qp?.quiz_passed) {
                    return NextResponse.json({
                        error: `Chapter ${chNum} quiz not passed`,
                        allCompleted: false,
                    }, { status: 400 });
                }
            }
        }

        // 5. Record completion on employee_directory
        const completionDate = new Date().toISOString();
        const agentName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Agent';
        const formattedDate = new Date(completionDate).toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric',
        });

        if (user.employee_id) {
            const { data: empRecord } = await supabaseAdmin
                .from('employee_directory')
                .select('training_completed_at, documents')
                .eq('id', user.employee_id)
                .maybeSingle();

            if (empRecord && !empRecord.training_completed_at) {
                // Generate certificate PDF
                const pdfBuffer = await generateCertificateBuffer(agentName, formattedDate);
                const fileName = `Training_Certificate_${agentName.replace(/\s+/g, '_')}.pdf`;
                const storagePath = `${user.employee_id}/${fileName}`;

                // Upload to Supabase Storage
                const { error: uploadError } = await supabaseAdmin.storage
                    .from('employee_documents')
                    .upload(storagePath, pdfBuffer, {
                        contentType: 'application/pdf',
                        upsert: true,
                    });

                if (uploadError) {
                    console.error('[Certificate] Storage upload error:', uploadError);
                }

                // Record completion date
                await supabaseAdmin
                    .from('employee_directory')
                    .update({ training_completed_at: completionDate })
                    .eq('id', user.employee_id);

                // Add certificate to documents array with proper format
                const existingDocs = Array.isArray(empRecord.documents) ? empRecord.documents : [];
                const certDoc = {
                    name: fileName,
                    path: storagePath,
                    type: 'application/pdf',
                    size: pdfBuffer.length,
                    uploaded_at: completionDate,
                };
                await supabaseAdmin
                    .from('employee_directory')
                    .update({ documents: [...existingDocs, certDoc] })
                    .eq('id', user.employee_id);
            }
        }

        return NextResponse.json({
            success: true,
            allCompleted: true,
            completionDate,
            agentName,
        });
    } catch (err) {
        console.error('[Education Certificate] Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// GET /api/education/certificate?userId=<uuid>
// Check if user has completed training and get certificate info
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'userId is required' }, { status: 400 });
        }

        const { data: user } = await supabaseAdmin
            .from('users')
            .select('id, first_name, last_name, email, employee_id')
            .eq('id', userId)
            .maybeSingle();

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const agentName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Agent';

        if (user.employee_id) {
            const { data: emp } = await supabaseAdmin
                .from('employee_directory')
                .select('training_completed_at')
                .eq('id', user.employee_id)
                .maybeSingle();

            if (emp?.training_completed_at) {
                return NextResponse.json({
                    completed: true,
                    completionDate: emp.training_completed_at,
                    agentName,
                });
            }
        }

        return NextResponse.json({ completed: false, agentName });
    } catch (err) {
        console.error('[Education Certificate] GET error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
