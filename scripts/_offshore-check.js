const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;

// The 5 remaining Asia-timezone agents (Charla removed as Pitch Health, Melanie removed)
const suspects = [
  { name: "Leo-J Adriano", slackId: "U09FJ1QK0LW" },
  { name: "Joanna Mae Singson", slackId: "U080270NA2X" },
  { name: "Myra Malagar", slackId: "U08VAQXC6DB" },
  { name: "Annesy May Tuballa", slackId: "U09FJ1Q4ML6" },
  { name: "Jean Roi Sanchez", slackId: "U09FJ1P7286" },
];

async function getSlackProfile(userId) {
  const res = await fetch("https://slack.com/api/users.info?user=" + userId, {
    headers: { Authorization: "Bearer " + SLACK_TOKEN }
  });
  const data = await res.json();
  return data.ok ? data.user : null;
}

async function main() {
  // Check DialedIn for any name variations
  console.log("=== OFFSHORE AGENT INVESTIGATION ===\n");

  for (const agent of suspects) {
    console.log("--- " + agent.name + " ---");

    // 1. Slack profile deep dive
    const user = await getSlackProfile(agent.slackId);
    if (user) {
      const p = user.profile || {};
      console.log("  Slack real_name: " + (user.real_name || ""));
      console.log("  Slack display_name: " + (p.display_name || ""));
      console.log("  Email: " + (p.email || ""));
      console.log("  Timezone: " + (user.tz || "") + " (" + (user.tz_label || "") + ")");
      console.log("  Account created: " + (user.updated ? new Date(user.updated * 1000).toISOString().split("T")[0] : "unknown"));
      if (p.phone) console.log("  Phone: " + p.phone);
      if (p.title) console.log("  Title: " + p.title);
    }

    // 2. Check DialedIn with partial first name match
    const firstName = agent.name.split(/\s+/)[0];
    const lastName = agent.name.split(/\s+/).pop();
    const { data: dialed } = await sb
      .from("dialedin_agent_performance")
      .select("agent_name, report_date, tph, transfers")
      .or("agent_name.ilike.%" + firstName + "%,agent_name.ilike.%" + lastName + "%")
      .order("report_date", { ascending: false })
      .limit(5);

    if (dialed && dialed.length > 0) {
      console.log("  DialedIn matches:");
      const unique = [...new Set(dialed.map(r => r.agent_name))];
      unique.forEach(n => console.log("    → " + n));
    } else {
      console.log("  DialedIn: NO matches for '" + firstName + "' or '" + lastName + "'");
    }

    // 3. Check payroll
    const { data: payroll } = await sb
      .from("payroll_periods")
      .select("agent_name, country, period_start")
      .or("agent_name.ilike.%" + firstName + "%,agent_name.ilike.%" + lastName + "%")
      .limit(5);

    if (payroll && payroll.length > 0) {
      console.log("  Payroll matches:");
      payroll.forEach(r => console.log("    → " + r.agent_name + " (" + r.country + ")"));
    } else {
      console.log("  Payroll: NO matches");
    }

    // 4. Check Agent Schedule
    const { data: sched } = await sb
      .from("Agent Schedule")
      .select('"First Name", "Last Name", Monday, Tuesday')
      .or('"First Name".ilike.%' + firstName + '%,"Last Name".ilike.%' + lastName + '%')
      .limit(3);

    if (sched && sched.length > 0) {
      console.log("  Schedule matches:");
      sched.forEach(r => console.log("    → " + r["First Name"] + " " + r["Last Name"] + " | Mon: " + (r.Monday || "none")));
    } else {
      console.log("  Schedule: NO matches");
    }

    console.log("");
  }

  // Also check: are there other Asia-timezone agents in the broader directory?
  console.log("\n=== OTHER AGENTS WITH ASIA TIMEZONES? ===");
  console.log("Checking all active agents with Slack IDs for Asian timezones...\n");

  const { data: allActive } = await sb
    .from("employee_directory")
    .select("first_name, last_name, slack_user_id, country")
    .eq("employee_status", "Active")
    .eq("role", "Agent")
    .not("slack_user_id", "is", null)
    .not("country", "is", null);

  // Sample 20 random agents with country set to see if any are actually Philippines-based
  let asiaCount = 0;
  const philippineAgents = [];
  const sampleSize = Math.min(allActive.length, 50);
  // Check a few known Filipino names from the directory
  const filipinoPatterns = ["singson", "malagar", "tuballa", "adriano", "sanchez"];

  // Check how many agents have country=null (these could be offshore)
  const { data: nullCountry } = await sb
    .from("employee_directory")
    .select("first_name, last_name, slack_user_id")
    .eq("employee_status", "Active")
    .eq("role", "Agent")
    .is("country", null);

  console.log("Active agents with NULL country: " + (nullCountry ? nullCountry.length : 0));
  if (nullCountry) {
    nullCountry.forEach(a => console.log("  " + a.first_name + " " + a.last_name));
  }
}

main().catch(console.error);
