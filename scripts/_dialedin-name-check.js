const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Check a few known agents to see how DialedIn stores names
  const testNames = ["Philis Ahmed", "Leo-J Adriano", "Sean Ashman", "Maya Chapman"];

  for (const name of testNames) {
    const { data } = await sb
      .from("dialedin_agent_performance")
      .select("agent_name")
      .ilike("agent_name", "%" + name.split(" ")[0] + "%")
      .limit(3);

    console.log(name + " → DialedIn matches: " + (data ? data.map(r => JSON.stringify(r.agent_name)).join(", ") : "none"));
  }

  // Get a sample of distinct DialedIn agent names
  const { data: sample } = await sb
    .from("dialedin_agent_performance")
    .select("agent_name")
    .order("report_date", { ascending: false })
    .limit(50);

  const unique = [...new Set(sample.map(r => r.agent_name))];
  console.log("\nSample DialedIn names (first 20):");
  unique.slice(0, 20).forEach(n => console.log("  [" + n + "]"));
}

main().catch(console.error);
