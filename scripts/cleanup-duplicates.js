
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanup() {
    const email = 'miki@pitchperfectsolutions.net';
    console.log(`Cleaning up duplicates for: ${email}`);

    // 1. Fetch all users
    const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .order('created_at', { ascending: false }); // Newest first

    if (error) {
        console.error('Fetch error:', error);
        return;
    }

    console.log(`Found ${users.length} users.`);

    if (users.length === 0) return;

    // 2. Keep the NEWEST one, delete the rest
    const [latestUser, ...duplicates] = users;
    console.log(`Keeping User ID: ${latestUser.id} (Created: ${latestUser.created_at})`);

    if (duplicates.length > 0) {
        const idsToDelete = duplicates.map(u => u.id);
        console.log(`Deleting ${duplicates.length} duplicates:`, idsToDelete);

        const { error: delError } = await supabase
            .from('users')
            .delete()
            .in('id', idsToDelete);

        if (delError) console.error('Delete failed:', delError);
        else console.log('✅ Duplicates deleted.');
    }

    // 3. Reset the remaining user
    console.log('Resetting profile status for remaining user...');

    // We want registration_status to be 'Accepted' (User exists)
    // But Onboarding Stage to be 'In Progress' or 'Not Started' -> profile_completed = false

    const { error: updateError } = await supabase
        .from('users')
        .update({
            profile_completed: false, // This makes stage 'In Progress'
            nickname: null,            // Clear these so form is empty-ish? Or user said "change status... from completed"
            bio: null,
            interests: []
        })
        .eq('id', latestUser.id);

    if (updateError) {
        console.error('Update failed:', updateError);
    } else {
        console.log('✅ User profile reset to incomplete.');
    }
}

cleanup();
