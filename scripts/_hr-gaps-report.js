const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchAll(table, select, filters = {}) {
  const PAGE = 1000;
  let all = [];
  let offset = 0;
  while (true) {
    let q = sb.from(table).select(select).range(offset, offset + PAGE - 1);
    for (const [k, v] of Object.entries(filters)) {
      q = q.eq(k, v);
    }
    const { data, error } = await q;
    if (error) { console.error("fetchAll error:", error.message); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function main() {
  // Get all active agents
  const agents = await fetchAll("employee_directory",
    "first_name, last_name, country, current_campaigns, hourly_wage, phone, role, employee_status",
    { employee_status: "Active", role: "Agent" });
  agents.sort((a, b) => (a.last_name || "").localeCompare(b.last_name || ""));

  // Get ALL DialedIn records (paginated)
  const perfData = await fetchAll("dialedin_agent_performance", "agent_name, report_date");
  console.log("DialedIn records fetched: " + perfData.length);

  // Build map: agent_name (lowercase) → latest report_date
  const lastWorkedMap = {};
  let globalLatest = "unknown";
  for (const r of perfData) {
    const key = (r.agent_name || "").toLowerCase().trim();
    if (!lastWorkedMap[key] || r.report_date > lastWorkedMap[key]) {
      lastWorkedMap[key] = r.report_date;
    }
    if (globalLatest === "unknown" || r.report_date > globalLatest) {
      globalLatest = r.report_date;
    }
  }

  const today = new Date();
  const missingCountry = [];
  const missingCampaign = [];
  const missingWage = [];
  const staleAgents = [];
  const noDialedinData = [];

  for (const a of agents) {
    const name = (a.first_name + " " + a.last_name).trim();
    const nameKey = name.toLowerCase();

    if (!a.country) missingCountry.push(name);
    if (!a.current_campaigns || a.current_campaigns.length === 0) missingCampaign.push(name);
    if (!a.hourly_wage) missingWage.push(name);

    const lastDate = lastWorkedMap[nameKey];
    if (!lastDate) {
      noDialedinData.push(name);
    } else {
      const last = new Date(lastDate + "T00:00:00");
      const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));
      if (diffDays > 5) {
        staleAgents.push({ name, lastDate, daysAgo: diffDays });
      }
    }
  }

  staleAgents.sort((a, b) => b.daysAgo - a.daysAgo);

  console.log("\n=== HR DATA GAPS REPORT ===");
  console.log("Active Agents: " + agents.length);
  console.log("DialedIn latest date: " + globalLatest);
  console.log("Generated: " + new Date().toISOString().split("T")[0]);
  console.log("");

  console.log("--- MISSING COUNTRY (" + missingCountry.length + ") ---");
  missingCountry.forEach(n => console.log("  " + n));
  console.log("");

  console.log("--- MISSING CAMPAIGN (" + missingCampaign.length + ") ---");
  missingCampaign.forEach(n => console.log("  " + n));
  console.log("");

  console.log("--- MISSING HOURLY WAGE (" + missingWage.length + ") ---");
  missingWage.forEach(n => console.log("  " + n));
  console.log("");

  console.log("--- LAST WORKED 5+ DAYS AGO (" + staleAgents.length + ") ---");
  console.log("(Active in directory but no DialedIn activity in 5+ days)");
  staleAgents.forEach(a => console.log("  " + a.name + " — last: " + a.lastDate + " (" + a.daysAgo + " days ago)"));
  console.log("");

  console.log("--- NO DIALEDIN DATA AT ALL (" + noDialedinData.length + ") ---");
  console.log("(Name mismatch between directory and DialedIn, or never logged into dialer)");
  noDialedinData.forEach(n => console.log("  " + n));
}

main().catch(console.error);
