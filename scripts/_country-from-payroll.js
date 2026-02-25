const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const missing = [
  "Leo-J Adriano", "John Betts", "Gustavo Garcia", "Melanie Lopez",
  "Joanna Mae Singson", "Myra Malagar", "Annesy May Tuballa",
  "Charla Naquila", "Jean Roi Sanchez", "Courtney Wheeler"
];

async function main() {
  // First check what's in payroll_periods
  const { data: allPayroll, error: pErr } = await sb
    .from("payroll_periods")
    .select("agent_name, country, period_start, period_end")
    .order("period_end", { ascending: false });

  if (pErr) {
    console.log("payroll_periods error:", pErr.message);
    return;
  }

  console.log("Total payroll records: " + (allPayroll ? allPayroll.length : 0));

  if (!allPayroll || allPayroll.length === 0) {
    console.log("No payroll data in DB. Checking HR Hired sheet instead...\n");
  } else {
    // Build map of agent_name → country from payroll
    const payrollMap = {};
    for (const r of allPayroll) {
      const key = (r.agent_name || "").toLowerCase().trim();
      if (!payrollMap[key]) payrollMap[key] = r.country;
    }

    console.log("Unique agents in payroll: " + Object.keys(payrollMap).length);
    console.log("\nCross-referencing missing country agents against payroll:\n");

    for (const name of missing) {
      const key = name.toLowerCase();
      if (payrollMap[key]) {
        console.log("  FOUND: " + name + " → " + payrollMap[key]);
      } else {
        // Try partial match
        const firstName = name.split(/\s+/)[0].toLowerCase();
        const lastName = name.split(/\s+/).pop().toLowerCase();
        let found = false;
        for (const [pk, country] of Object.entries(payrollMap)) {
          if (pk.includes(firstName) && pk.includes(lastName)) {
            console.log("  FOUND (partial): " + name + " → " + country + " (matched '" + pk + "')");
            found = true;
            break;
          }
        }
        if (!found) console.log("  NOT IN PAYROLL: " + name);
      }
    }
  }

  // Also check HR Hired sheet
  console.log("\n--- Checking HR Hired sheet ---\n");
  const { data: hired } = await sb
    .from("HR Hired")
    .select("*")
    .limit(5);

  if (hired && hired.length > 0) {
    const cols = Object.keys(hired[0]);
    console.log("HR Hired columns: " + cols.join(", "));
  }

  for (const name of missing) {
    const firstName = name.split(/\s+/)[0];
    const lastName = name.split(/\s+/).pop();

    const { data } = await sb
      .from("HR Hired")
      .select("*")
      .ilike("Agent Name", "%" + firstName + "%" + lastName + "%")
      .limit(1);

    if (data && data.length > 0) {
      const r = data[0];
      console.log("  FOUND in HR Hired: " + name);
      console.log("    Agent Name: " + r["Agent Name"]);
      console.log("    Country: " + (r["Country"] || r["country"] || "not set"));
      // Print all columns to find country
      for (const [k, v] of Object.entries(r)) {
        if (v && typeof v === "string" && (v.toLowerCase().includes("usa") || v.toLowerCase().includes("canada") || v.toLowerCase().includes("us") || k.toLowerCase().includes("country") || k.toLowerCase().includes("location"))) {
          console.log("    >>> " + k + ": " + v);
        }
      }
    } else {
      console.log("  NOT in HR Hired: " + name);
    }
  }
}

main().catch(console.error);
