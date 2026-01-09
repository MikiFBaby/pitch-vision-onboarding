
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
    const { data, error } = await supabase
        .from('employee_directory')
        .select('*')
        .eq('email', 'miki@pitchperfectsolutions.net');

    if (error) {
        console.error("Error:", error);
        return;
    }

    if (data && data.length > 0) {
        console.log("Miki Data:", JSON.stringify(data[0], null, 2));
    } else {
        console.log("No data found for Miki");
    }
}

checkSchema();
