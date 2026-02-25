const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const stillInChannel = [
  "Leo-J Adriano", "Sean Ashman", "Isaac Benjamin", "John Betts",
  "Maya Chapman", "Kyana Chen", "Tanya Diamond", "Gustavo Garcia",
  "Saad Khan", "Shermin Koshy", "Jeff Le Brush Brush", "Melanie Lopez",
  "Joanna Mae Singson", "Myra Malagar", "Annesy May Tuballa", "Yidana Mumuni",
  "Charla Naquila", "Neyemiah Reddie", "Jean Roi Sanchez", "Hanad Samatar",
  "Courtney Wheeler", "Patrina Williams", "Alayna Wolters"
];

async function main() {
  // Full detail on Leo-J specifically
  const { data: leo } = await sb
    .from("employee_directory")
    .select("*")
    .ilike("first_name", "%Leo%")
    .ilike("last_name", "%Adriano%");

  console.log("=== LEO-J ADRIANO — FULL RECORD ===");
  if (leo && leo[0]) {
    const r = leo[0];
    console.log("  first_name:", r.first_name);
    console.log("  last_name:", r.last_name);
    console.log("  employee_status:", r.employee_status);
    console.log("  terminated_at:", r.terminated_at);
    console.log("  hired_at:", r.hired_at);
    console.log("  role:", r.role);
    console.log("  country:", r.country);
    console.log("  email:", r.email);
    console.log("  slack_user_id:", r.slack_user_id);
    console.log("  slack_display_name:", r.slack_display_name);
    console.log("  created_at:", r.created_at);
    console.log("  updated_at:", r.updated_at);
    console.log("  contract_status:", r.contract_status);
    console.log("  current_campaigns:", JSON.stringify(r.current_campaigns));
  } else {
    console.log("  NOT FOUND");
  }

  // Check all 23 "unknown termination" agents — how were they marked terminated?
  console.log("\n=== ALL 23 'UNKNOWN TERMINATION' AGENTS — EVIDENCE CHECK ===\n");

  for (const name of stillInChannel) {
    const parts = name.split(/\s+/);
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];

    const { data } = await sb
      .from("employee_directory")
      .select("first_name, last_name, employee_status, terminated_at, hired_at, created_at, updated_at, role, slack_user_id, current_campaigns")
      .ilike("first_name", "%" + firstName + "%")
      .ilike("last_name", "%" + lastName + "%")
      .eq("employee_status", "Terminated");

    if (data && data.length > 0) {
      const r = data[0];
      const evidence = [];

      // Check if in HR Fired sheet
      const { data: fired } = await sb
        .from("HR Fired")
        .select('"Agent Name", "Termination Date"')
        .ilike("Agent Name", "%" + firstName + "%" + lastName + "%")
        .limit(1);

      if (fired && fired.length > 0) {
        evidence.push("HR Fired sheet: " + fired[0]["Agent Name"] + " (" + fired[0]["Termination Date"] + ")");
      }

      // Check if they have a terminated_at date
      if (r.terminated_at) {
        evidence.push("DB terminated_at: " + r.terminated_at);
      }

      // If no evidence, they were likely auto-marked by Slack event or reconciliation
      if (evidence.length === 0) {
        evidence.push("NO EVIDENCE — status was set without a date or HR sheet entry");
        evidence.push("Likely auto-marked by system (Slack event handler or reconciliation)");
        evidence.push("COULD BE INCORRECT — they are still in the Slack channel");
      }

      console.log(name);
      console.log("  Status: " + r.employee_status);
      console.log("  Created: " + (r.created_at || "unknown"));
      console.log("  Updated: " + (r.updated_at || "unknown"));
      console.log("  Role: " + (r.role || "none"));
      console.log("  Campaigns: " + JSON.stringify(r.current_campaigns));
      evidence.forEach(e => console.log("  >> " + e));
      console.log("");
    }
  }
}

main().catch(console.error);
