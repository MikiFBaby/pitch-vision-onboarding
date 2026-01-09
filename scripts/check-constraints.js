
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkConstraints() {
    console.log("Checking constraints for 'users' table...");

    // We can't easily query pg_catalog via the JS client unless we have a specific RPC or direct SQL access.
    // However, we can test the behavior by trying to insert a duplicate.

    const testUid = `test_uid_${Date.now()}`;

    // 1. Insert first user
    const { data: u1, error: e1 } = await supabase
        .from('users')
        .insert({
            firebase_uid: testUid,
            email: `test1_${testUid}@example.com`,
            role: 'agent'
        })
        .select()
        .single();

    if (e1) {
        console.error("Setup failed (Insert 1):", e1);
        return;
    }
    console.log("Inserted User 1:", u1.id);

    // 2. Try to Insert AGAIN with SAME firebase_uid
    const { data: u2, error: e2 } = await supabase
        .from('users')
        .insert({
            firebase_uid: testUid,
            email: `test2_${testUid}@example.com`,
            role: 'agent'
        })
        .select();

    if (e2) {
        console.log("Constraint Check Result: CONSTRAINT EXISTS (Insert 2 failed as expected)");
        console.log("Error:", e2.message);
    } else {
        console.log("Constraint Check Result: NO CONSTRAINT FOUND (Insert 2 succeeded - DUPLICATE CREATED)");
        if (u2 && u2.length > 0) console.log("Duplicate User ID:", u2[0].id);

        // Cleanup duplicates
        await supabase.from('users').delete().eq('firebase_uid', testUid);
    }

    // Cleanup first user if it wasn't cleaned up above
    if (e2) {
        await supabase.from('users').delete().eq('id', u1.id);
    }
}

checkConstraints();
