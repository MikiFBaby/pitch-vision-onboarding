
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('URL:', supabaseUrl);
console.log('Key Length:', supabaseServiceKey ? supabaseServiceKey.length : 0);

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debug() {
    // List tables? No, list users
    const { data: users, error } = await supabase.from('users').select('*').limit(5);
    if (error) {
        console.error('Error fetching users:', error);
    } else {
        console.log('Users found:', users.length);
        if (users.length > 0) {
            console.log('First user email:', users[0].email);
            console.log('First user keys:', Object.keys(users[0]));
        }
    }

    // Try finding the specific email again with ilike
    const { data: specific, error: specificError } = await supabase
        .from('users')
        .select('*')
        .ilike('email', 'miki@pitchperfectsolutions.net');

    if (specificError) {
        console.error('Error specific:', specificError);
    } else {
        console.log('Specific user count:', specific.length);
        specific.forEach((u, i) => {
            console.log(`[${i}] ID: ${u.id} | UID: ${u.firebase_uid} | Compl: ${u.profile_completed} | Bio: ${u.bio ? u.bio.substring(0, 10) : 'null'} | Nick: ${u.nickname} | Created: ${u.created_at}`);
        });
    }

    const { data: directory, error: dirError } = await supabase
        .from('employee_directory')
        .select('*')
        .eq('email', 'miki@pitchperfectsolutions.net');

    if (dirError) {
        console.error('Dir Error:', dirError);
    } else {
        console.log('Directory entries:', directory.length);
        directory.forEach(d => console.log(`Dir ID: ${d.id} | Email: ${d.email}`));
    }
}

debug();
