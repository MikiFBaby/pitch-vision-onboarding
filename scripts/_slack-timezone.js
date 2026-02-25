const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;

const missing = [
  "Leo-J Adriano", "John Betts", "Gustavo Garcia", "Melanie Lopez",
  "Joanna Mae Singson", "Myra Malagar", "Annesy May Tuballa",
  "Charla Naquila", "Jean Roi Sanchez", "Courtney Wheeler"
];

async function getSlackProfile(userId) {
  const res = await fetch("https://slack.com/api/users.info?user=" + userId, {
    headers: { Authorization: "Bearer " + SLACK_TOKEN }
  });
  const data = await res.json();
  if (data.ok) return data.user;
  return null;
}

async function main() {
  console.log("Fetching Slack timezones for 10 missing-country agents...\n");

  for (const name of missing) {
    const parts = name.split(/\s+/);
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];

    const { data } = await sb
      .from("employee_directory")
      .select("first_name, last_name, slack_user_id, email")
      .ilike("first_name", "%" + firstName + "%")
      .ilike("last_name", "%" + lastName + "%")
      .limit(1);

    if (!data || data.length === 0 || !data[0].slack_user_id) {
      console.log(name + " — no Slack ID");
      continue;
    }

    const slackId = data[0].slack_user_id;
    const user = await getSlackProfile(slackId);

    if (user) {
      const tz = user.tz || "unknown";
      const tzLabel = user.tz_label || "";
      const email = user.profile ? user.profile.email : "";
      const title = user.profile ? user.profile.title : "";

      // Infer country from timezone
      let inferredCountry = "UNKNOWN";
      const tzLower = tz.toLowerCase();
      if (tzLower.includes("america/toronto") || tzLower.includes("america/vancouver") ||
          tzLower.includes("america/winnipeg") || tzLower.includes("america/edmonton") ||
          tzLower.includes("america/halifax") || tzLower.includes("america/st_johns") ||
          tzLower.includes("america/regina") || tzLower.includes("canada")) {
        inferredCountry = "Canada (likely)";
      } else if (tzLower.includes("america/new_york") || tzLower.includes("america/chicago") ||
                 tzLower.includes("america/denver") || tzLower.includes("america/los_angeles") ||
                 tzLower.includes("america/phoenix") || tzLower.includes("us/")) {
        inferredCountry = "USA (likely)";
      } else if (tzLower.includes("asia/manila") || tzLower.includes("asia/")) {
        inferredCountry = "Philippines/Asia";
      }

      console.log(name + " (" + slackId + ")");
      console.log("  TZ: " + tz + " (" + tzLabel + ")");
      console.log("  Email: " + email);
      if (title) console.log("  Title: " + title);
      console.log("  → Inferred: " + inferredCountry);
      console.log("");
    } else {
      console.log(name + " — Slack API lookup failed for " + slackId);
    }
  }
}

main().catch(console.error);
