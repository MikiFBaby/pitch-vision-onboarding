const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Check Philis Ahmed's DialedIn records
  const { data, error } = await sb
    .from("dialedin_agent_performance")
    .select("agent_name, report_date, tph, transfers, dials, connects, hours_worked, conversion_rate")
    .ilike("agent_name", "Philis Ahmed")
    .order("report_date", { ascending: false })
    .limit(30);

  console.log("=== PHILIS AHMED — DialedIn Records ===");
  if (error) { console.log("Error:", error.message); return; }
  console.log("Total records found:", data.length);
  if (data.length > 0) {
    console.log("Most recent:", data[0].report_date);
    console.log("Oldest:", data[data.length - 1].report_date);
    console.log("\nAll dates:");
    data.forEach(r => {
      console.log("  " + r.report_date + " | TPH: " + Number(r.tph).toFixed(2) + " | SLA: " + r.transfers + " | Dials: " + r.dials + " | Hours: " + Number(r.hours_worked).toFixed(1));
    });
  }

  // Check what the latest report_date is across ALL agents
  const { data: latestGlobal } = await sb
    .from("dialedin_agent_performance")
    .select("report_date")
    .order("report_date", { ascending: false })
    .limit(1);

  console.log("\n=== GLOBAL LATEST REPORT DATE ===");
  if (latestGlobal && latestGlobal.length > 0) {
    console.log("Latest report in system:", latestGlobal[0].report_date);
  }

  // Count how many agents have data for the latest date
  if (latestGlobal && latestGlobal[0]) {
    const { count } = await sb
      .from("dialedin_agent_performance")
      .select("*", { count: "exact", head: true })
      .eq("report_date", latestGlobal[0].report_date);
    console.log("Agents with data for " + latestGlobal[0].report_date + ":", count);
  }
}

main().catch(console.error);
