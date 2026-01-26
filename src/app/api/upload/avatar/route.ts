import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service role for admin operations
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const userId = formData.get('userId') as string;

        if (!file || !userId) {
            return NextResponse.json(
                { success: false, error: "File and userId are required" },
                { status: 400 }
            );
        }

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Generate unique filename
        const ext = file.name.split('.').pop() || 'jpg';
        const fileName = `avatars/${userId}/${Date.now()}.${ext}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('avatars')
            .upload(fileName, buffer, {
                contentType: file.type,
                upsert: true
            });

        if (uploadError) {
            console.error('Storage upload error:', uploadError);
            return NextResponse.json(
                { success: false, error: uploadError.message },
                { status: 500 }
            );
        }

        // Get public URL
        const { data: urlData } = supabaseAdmin.storage
            .from('avatars')
            .getPublicUrl(fileName);

        const avatarUrl = urlData.publicUrl;

        // Update user profile in database
        const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update({ user_image: avatarUrl, avatar_url: avatarUrl })
            .eq('firebase_uid', userId);

        if (updateError) {
            console.error('Profile update error:', updateError);
            // Still return success since image was uploaded
        }

        return NextResponse.json({
            success: true,
            avatarUrl
        });

    } catch (error: any) {
        console.error("Avatar upload error:", error);
        return NextResponse.json(
            { success: false, error: error.message || "Failed to upload avatar" },
            { status: 500 }
        );
    }
}
