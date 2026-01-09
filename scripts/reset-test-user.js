
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function resetUser() {
    const email = 'miki@pitchperfectsolutions.net';
    console.log(`Resetting test state for: ${email}`);

    // 1. Delete ALL users with this email from public.users
    // This removes the "duplicate" rows the user complained about.
    const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('email', email);

    if (deleteError) {
        console.error('Error deleting users:', deleteError);
    } else {
        console.log('✅ Deleted all stale rows from users table.');
    }

    // 2. Reset the Employee Directory entry (The "Original One")
    // This allows it to be re-linked cleanly on next signup.
    const { error: updateError } = await supabase
        .from('employee_directory')
        .update({ firebase_uid: null })
        .eq('email', email);

    if (updateError) {
        console.error('Error resetting directory:', updateError);
    } else {
        console.log('✅ Reset employee_directory status to "Pending".');
    }
}

resetUser();
