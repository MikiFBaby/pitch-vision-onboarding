
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testUpdate() {
    const email = 'miki@pitchperfectsolutions.net';
    console.log(`Testing update for: ${email}`);

    // 1. Get Firebase UID
    const { data: user } = await supabase.from('users').select('firebase_uid').eq('email', email).single();
    if (!user) return console.error('User not found');

    const uid = user.firebase_uid;
    console.log('Target UID:', uid);

    // 2. Perform Upsert like the API does
    const updateData = {
        firebase_uid: uid,
        nickname: 'TestNick',
        bio: 'Test Bio from Script',
        interests: ['Debugging', 'AI'],
        profile_completed: true
    };

    console.log('Update payload:', updateData);

    const { data, error } = await supabase
        .from('users')
        .upsert(updateData, { onConflict: 'firebase_uid' })
        .select()
        .single();

    if (error) {
        console.error('Update Error:', error);
    } else {
        console.log('Update Success. New Data:', JSON.stringify(data, null, 2));
    }
}

testUpdate();
