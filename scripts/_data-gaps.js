const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data } = await sb.from("employee_directory").select("*").eq("employee_status", "Active");
  const total = data.length;

  const gaps = {
    phone: 0, country: 0, email: 0, user_image: 0, slack_user_id: 0,
    current_campaigns: 0, hourly_wage: 0, role: 0, hired_at: 0,
    slack_display_name: 0, firebase_uid: 0
  };

  const missingCountry = [];
  const missingEmail = [];
  const missingCampaign = [];

  for (const r of data) {
    if (!r.phone) gaps.phone++;
    if (!r.country) { gaps.country++; missingCountry.push(r.first_name + " " + r.last_name); }
    if (!r.email) { gaps.email++; missingEmail.push(r.first_name + " " + r.last_name); }
    if (!r.user_image) gaps.user_image++;
    if (!r.slack_user_id) gaps.slack_user_id++;
    if (!r.current_campaigns || r.current_campaigns.length === 0) { gaps.current_campaigns++; missingCampaign.push(r.first_name + " " + r.last_name); }
    if (!r.hourly_wage) gaps.hourly_wage++;
    if (!r.role) gaps.role++;
    if (!r.hired_at) gaps.hired_at++;
    if (!r.slack_display_name) gaps.slack_display_name++;
    if (!r.firebase_uid) gaps.firebase_uid++;
  }

  console.log("Total Active employees: " + total);
  console.log("\n=== DATA GAPS (Active employees) ===");
  const sorted = Object.entries(gaps).sort((a, b) => b[1] - a[1]);
  for (const [field, count] of sorted) {
    const pct = Math.round(count / total * 100);
    console.log("  " + field + ": " + count + "/" + total + " missing (" + pct + "%)");
  }

  if (missingCountry.length > 0 && missingCountry.length <= 50) {
    console.log("\n=== MISSING COUNTRY (" + missingCountry.length + ") ===");
    missingCountry.forEach(n => console.log("  - " + n));
  }

  if (missingEmail.length > 0 && missingEmail.length <= 30) {
    console.log("\n=== MISSING EMAIL (" + missingEmail.length + ") ===");
    missingEmail.forEach(n => console.log("  - " + n));
  }

  if (missingCampaign.length > 0 && missingCampaign.length <= 50) {
    console.log("\n=== MISSING CAMPAIGN (" + missingCampaign.length + ") ===");
    missingCampaign.forEach(n => console.log("  - " + n));
  }
}

main().catch(console.error);
