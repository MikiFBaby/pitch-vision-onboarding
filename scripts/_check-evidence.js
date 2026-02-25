const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const names = [
  "Leo-J Adriano", "Sean Ashman", "Isaac Benjamin", "John Betts",
  "Maya Chapman", "Kyana Chen", "Tanya Diamond", "Gustavo Garcia",
  "Saad Khan", "Shermin Koshy", "Jeff Le Brush Brush", "Melanie Lopez",
  "Joanna Mae Singson", "Myra Malagar", "Annesy May Tuballa", "Yidana Mumuni",
  "Charla Naquila", "Neyemiah Reddie", "Jean Roi Sanchez", "Hanad Samatar",
  "Courtney Wheeler", "Patrina Williams", "Alayna Wolters"
];

async function main() {
  const noEvidence = [];
  const hasEvidence = [];

  for (const name of names) {
    const parts = name.split(/\s+/);
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];

    const { data, error } = await sb
      .from("employee_directory")
      .select("first_name, last_name, employee_status, terminated_at, hired_at, role, current_campaigns, contract_status, country")
      .ilike("first_name", "%" + firstName + "%")
      .ilike("last_name", "%" + lastName + "%");

    if (error) { console.log(name + " — QUERY ERROR: " + error.message); continue; }
    if (!data || data.length === 0) { console.log(name + " — NOT FOUND IN DB"); continue; }

    const r = data[0];

    // Check HR Fired sheet
    const { data: fired } = await sb
      .from("HR Fired")
      .select("*")
      .ilike("Agent Name", "%" + firstName + "%" + lastName + "%")
      .limit(1);

    const hasFired = fired && fired.length > 0;
    const hasDate = !!r.terminated_at;

    const info = {
      name,
      dbName: r.first_name + " " + r.last_name,
      status: r.employee_status,
      hired_at: r.hired_at,
      hired_at_val: r.hired_at,
      terminated_at: r.terminated_at,
      role: r.role,
      country: r.country,
      contract_status: r.contract_status,
      campaigns: r.current_campaigns,
      inHRFired: hasFired,
    };

    if (hasFired || hasDate) {
      hasEvidence.push(info);
    } else {
      noEvidence.push(info);
    }
  }

  console.log("=== AGENTS WITH TERMINATION EVIDENCE (" + hasEvidence.length + ") ===\n");
  for (const a of hasEvidence) {
    console.log(a.name + " (" + a.dbName + ")");
    console.log("  Status: " + a.status + " | Role: " + a.role + " | Country: " + a.country);
    console.log("  Hired: " + (a.hired_at || "none") + " | Terminated: " + (a.terminated_at || "none"));
    console.log("  In HR Fired: " + a.inHRFired);
    console.log("  Campaigns: " + JSON.stringify(a.campaigns));
    console.log("");
  }

  console.log("=== AGENTS WITH NO TERMINATION EVIDENCE (" + noEvidence.length + ") ===");
  console.log("(Still in Slack channel + NOT in HR Fired sheet + no terminated_at date)\n");
  for (const a of noEvidence) {
    console.log(a.name + " (" + a.dbName + ")");
    console.log("  Status: " + a.status + " | Role: " + a.role + " | Country: " + a.country);
    console.log("  Hired: " + (a.hired_at || "none"));
    console.log("  Contract: " + a.contract_status + " | Campaigns: " + JSON.stringify(a.campaigns));
    console.log("");
  }
}

main().catch(console.error);
