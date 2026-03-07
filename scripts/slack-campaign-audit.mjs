#!/usr/bin/env node
/**
 * Slack Campaign Channel Audit
 *
 * Cross-references Slack campaign channel membership against the
 * employee_directory in Supabase.  Produces three report sections:
 *   A) Slack vs Directory campaign mismatches
 *   B) Slack channel members NOT in directory
 *   C) Directory agents with campaigns but NOT in Slack channels
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── env ──────────────────────────────────────────────────────────────
const envPath = resolve("/Users/MikiF/pitch-vision-web/.env.local");
const envText = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z_0-9]*)=["']?(.+?)["']?$/);
  if (m) env[m[1]] = m[2];
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const SLACK_TOKEN = env.SLACK_BOT_TOKEN;

// ── campaign channels ────────────────────────────────────────────────
const CAMPAIGN_CHANNELS = {
  Medicare: "C0A896J4JEM",
  ACA: "C07A07ANCAG",
  "Medicare WhatIF": "C06CDFV4ECR",
  "Home Care Michigan": "C0A3AH1K56E",
  "Home Care PA": "C09JRPT6HME",
  Hospital: "C0AE4E14S8M",
  "Pitch Meals": "C0AEWM51U90",
};

// ── known exclusions (from project memory) ───────────────────────────
const EXCLUDED_NAMES = new Set([
  "Eustace Martin",       // intentionally not on Slack
  "Armando Badger",       // disruptive, excluded from campaign channels
  "Christy Brodeur",      // disruptive, excluded from campaign channels
  "Nichol Harris",        // disruptive, excluded from campaign channels
  "Sonia Bihun",          // disruptive, excluded from campaign channels
  "David Thompson",       // very new hire, not yet added
]);

// ── helpers ──────────────────────────────────────────────────────────
async function slackAPI(method, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `https://slack.com/api/${method}?${qs}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${SLACK_TOKEN}` },
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Slack ${method} error: ${json.error}`);
  return json;
}

/** Paginated conversations.members */
async function getChannelMembers(channelId) {
  const members = [];
  let cursor = "";
  do {
    const params = { channel: channelId, limit: "1000" };
    if (cursor) params.cursor = cursor;
    const data = await slackAPI("conversations.members", params);
    members.push(...(data.members || []));
    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);
  return members;
}

/** Fetch ALL Slack users (paginated users.list) */
async function getAllSlackUsers() {
  const users = new Map();
  let cursor = "";
  do {
    const params = { limit: "1000" };
    if (cursor) params.cursor = cursor;
    const data = await slackAPI("users.list", params);
    for (const u of data.members || []) {
      users.set(u.id, {
        id: u.id,
        email: u.profile?.email || null,
        real_name: u.real_name || u.profile?.real_name || u.name || "",
        display_name: u.profile?.display_name || "",
        is_bot: u.is_bot || u.id === "USLACKBOT",
        deleted: u.deleted || false,
        is_app_user: u.is_app_user || false,
      });
    }
    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);
  return users;
}

/** Paginated Supabase REST fetch of employee_directory */
async function getActiveEmployees() {
  const rows = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const url =
      `${SUPABASE_URL}/rest/v1/employee_directory` +
      `?employee_status=eq.Active` +
      `&select=id,first_name,last_name,email,slack_user_id,current_campaigns,role` +
      `&order=id` +
      `&offset=${offset}&limit=${pageSize}`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "count=exact",
      },
    });
    const data = await res.json();
    rows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

// Stringify current_campaigns (may be array or string or null)
function campaignsToString(val) {
  if (!val) return "(none)";
  if (Array.isArray(val)) return val.join(", ") || "(none)";
  return String(val) || "(none)";
}

// Parse current_campaigns (comma-separated string, array, or null) -> string[]
function parseCampaigns(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
  return String(val)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Map directory campaign name to our canonical channel names
function mapCampaignToChannel(dirCampaign) {
  const lc = dirCampaign.toLowerCase();
  if (lc === "medicare") return "Medicare";
  if (lc === "aca") return "ACA";
  if (lc === "medicare whatif" || lc === "whatif" || lc === "medicare what if") return "Medicare WhatIF";
  if (lc.includes("home care") && lc.includes("michigan")) return "Home Care Michigan";
  if (lc.includes("home care") && (lc.includes("pa") || lc.includes("pennsylvania"))) return "Home Care PA";
  if (lc.includes("home care") && (lc.includes("ny") || lc.includes("new york"))) return "Home Care NY";
  if (lc === "hospital") return "Hospital";
  if (lc === "pitch meals" || lc === "meals") return "Pitch Meals";
  return dirCampaign;
}

// ── main ─────────────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(80));
  console.log("  SLACK CAMPAIGN CHANNEL AUDIT");
  console.log("  " + new Date().toISOString());
  console.log("=".repeat(80));
  console.log();

  // 1. Fetch all Slack users (bulk)
  console.log("[1/3] Fetching all Slack users...");
  const slackUsers = await getAllSlackUsers();
  console.log(`      Loaded ${slackUsers.size} Slack users`);

  // 2. Fetch campaign channel members
  console.log("[2/3] Fetching campaign channel members...");
  const channelMembers = {}; // campaign -> Set<userId>
  for (const [campaign, channelId] of Object.entries(CAMPAIGN_CHANNELS)) {
    const members = await getChannelMembers(channelId);
    channelMembers[campaign] = new Set(members);
    console.log(`      ${campaign} (${channelId}): ${members.length} members`);
  }

  // 3. Fetch Active employees from Supabase
  console.log("[3/3] Fetching Active employees from Supabase...");
  const employees = await getActiveEmployees();
  console.log(`      Loaded ${employees.length} Active employees`);
  console.log();

  // ── Build lookup maps ──
  const empBySlackId = new Map();
  const empByEmail = new Map();
  for (const emp of employees) {
    const fullName = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
    emp._fullName = fullName;
    emp._campaigns = parseCampaigns(emp.current_campaigns).map(mapCampaignToChannel);
    emp._campaignsStr = campaignsToString(emp.current_campaigns);
    if (emp.slack_user_id) empBySlackId.set(emp.slack_user_id, emp);
    if (emp.email) empByEmail.set(emp.email.toLowerCase(), emp);
  }

  // ── Helpers ──
  function findEmployee(slackUserId) {
    if (empBySlackId.has(slackUserId)) return empBySlackId.get(slackUserId);
    const su = slackUsers.get(slackUserId);
    if (su?.email) return empByEmail.get(su.email.toLowerCase()) || null;
    return null;
  }

  function isExcludedName(name) {
    const lc = (name || "").trim().toLowerCase();
    for (const excl of EXCLUDED_NAMES) {
      if (lc === excl.toLowerCase()) return true;
    }
    return false;
  }

  function isNonEmployee(slackUser) {
    if (!slackUser) return true;
    if (slackUser.is_bot) return true;
    if (slackUser.is_app_user) return true;
    if (slackUser.id === "USLACKBOT") return true;
    if (slackUser.deleted) return true;
    return false;
  }

  // Known non-employee Slack IDs from project memory
  const KNOWN_NON_EMPLOYEES = new Set([
    "U09K9NUQ691", // Alex Pitch Perfect (alt account)
    "U0A2F5D9HKQ", // Maz (not Maaz Khan)
    "U0A2H6GBGCA", // Maaz/Can (not Maaz Khan)
    "U032D1HHH2M", // Mohamed Roumieh / Moe (offshore)
    "U0470TMNGLB", // Hanan Abogamil / Demi (not our dept)
    "U064LJNKTSR", // Michael Matewe (fired)
  ]);

  // ══════════════════════════════════════════════════════════════════
  // SECTION A: Slack vs Directory mismatches
  // ══════════════════════════════════════════════════════════════════
  console.log("-".repeat(80));
  console.log("  SECTION A: Slack vs Directory Campaign Mismatches");
  console.log("-".repeat(80));
  console.log();

  const sectionA = [];
  // Dedup key to avoid double-reporting the same agent+campaign+direction
  const sectionAKeys = new Set();

  // Forward: Slack channel -> directory campaigns
  for (const [campaign, memberSet] of Object.entries(channelMembers)) {
    for (const userId of memberSet) {
      const su = slackUsers.get(userId);
      if (!su || isNonEmployee(su)) continue;
      if (KNOWN_NON_EMPLOYEES.has(userId)) continue;

      const emp = findEmployee(userId);
      if (!emp) continue; // handled in Section B
      if (isExcludedName(emp._fullName)) continue;
      if (emp.role !== "Agent") continue; // skip managers/admins in channels

      const key = `slack|${emp.id}|${campaign}`;
      if (sectionAKeys.has(key)) continue;
      sectionAKeys.add(key);

      if (!emp._campaigns.includes(campaign)) {
        sectionA.push({
          type: "in_slack_not_directory",
          name: emp._fullName,
          slackChannel: campaign,
          dirCampaigns: emp._campaignsStr,
          slackUserId: userId,
        });
      }
    }
  }

  // Reverse: directory campaigns -> Slack channel
  for (const emp of employees) {
    if (emp.role !== "Agent") continue;
    if (isExcludedName(emp._fullName)) continue;

    for (const campaign of emp._campaigns) {
      const channelId = CAMPAIGN_CHANNELS[campaign];
      if (!channelId) continue;

      const key = `dir|${emp.id}|${campaign}`;
      if (sectionAKeys.has(key)) continue;
      sectionAKeys.add(key);

      const memberSet = channelMembers[campaign];
      let found = false;

      if (emp.slack_user_id && memberSet.has(emp.slack_user_id)) {
        found = true;
      }

      if (!found && emp.email) {
        for (const userId of memberSet) {
          const su = slackUsers.get(userId);
          if (su?.email?.toLowerCase() === emp.email.toLowerCase()) {
            found = true;
            break;
          }
        }
      }

      if (!found) {
        sectionA.push({
          type: "in_directory_not_slack",
          name: emp._fullName,
          slackChannel: campaign,
          dirCampaigns: emp._campaignsStr,
          slackUserId: emp.slack_user_id || "(none)",
        });
      }
    }
  }

  if (sectionA.length === 0) {
    console.log("  No mismatches found.\n");
  } else {
    const inSlackNotDir = sectionA.filter((r) => r.type === "in_slack_not_directory");
    const inDirNotSlack = sectionA.filter((r) => r.type === "in_directory_not_slack");

    if (inSlackNotDir.length > 0) {
      console.log(`  In Slack channel but campaign NOT in directory (${inSlackNotDir.length}):`);
      console.log("  " + "-".repeat(76));
      for (const r of inSlackNotDir.sort((a, b) => a.slackChannel.localeCompare(b.slackChannel) || a.name.localeCompare(b.name))) {
        console.log(
          `    ${r.name.padEnd(28)} | Slack: ${r.slackChannel.padEnd(20)} | Dir campaigns: ${r.dirCampaigns}`
        );
      }
      console.log();
    }

    if (inDirNotSlack.length > 0) {
      console.log(`  In directory but NOT in Slack channel (${inDirNotSlack.length}):`);
      console.log("  " + "-".repeat(76));
      for (const r of inDirNotSlack.sort((a, b) => a.slackChannel.localeCompare(b.slackChannel) || a.name.localeCompare(b.name))) {
        console.log(
          `    ${r.name.padEnd(28)} | Missing from: ${r.slackChannel.padEnd(20)} | Dir campaigns: ${r.dirCampaigns}`
        );
      }
      console.log();
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // SECTION B: Agents in Slack channels but NOT in directory
  // ══════════════════════════════════════════════════════════════════
  console.log("-".repeat(80));
  console.log("  SECTION B: In Slack Campaign Channels but NOT Active in Directory");
  console.log("-".repeat(80));
  console.log();

  const sectionBMap = new Map();

  for (const [campaign, memberSet] of Object.entries(channelMembers)) {
    for (const userId of memberSet) {
      const su = slackUsers.get(userId);
      if (!su || isNonEmployee(su)) continue;
      if (KNOWN_NON_EMPLOYEES.has(userId)) continue;

      const emp = findEmployee(userId);
      if (emp) continue;

      if (!sectionBMap.has(userId)) {
        sectionBMap.set(userId, {
          name: su.real_name || su.display_name || "(unknown)",
          email: su.email || "(no email)",
          slackUserId: userId,
          channels: new Set(),
        });
      }
      sectionBMap.get(userId).channels.add(campaign);
    }
  }

  const sectionB = [...sectionBMap.values()];

  if (sectionB.length === 0) {
    console.log("  No unknown Slack users found in campaign channels.\n");
  } else {
    console.log(`  Found ${sectionB.length} people in campaign channels not Active in directory:`);
    console.log("  " + "-".repeat(76));
    for (const r of sectionB.sort((a, b) => a.name.localeCompare(b.name))) {
      const chans = [...r.channels].join(", ");
      console.log(
        `    ${r.name.padEnd(28)} | ${r.email.padEnd(35)} | ${r.slackUserId} | ${chans}`
      );
    }
    console.log();
  }

  // ══════════════════════════════════════════════════════════════════
  // SECTION C: Active agents with campaigns but NOT in any Slack channel
  // ══════════════════════════════════════════════════════════════════
  console.log("-".repeat(80));
  console.log("  SECTION C: Active Agents with Campaigns but NOT in Slack Channels");
  console.log("-".repeat(80));
  console.log();

  const sectionC = [];

  for (const emp of employees) {
    if (emp.role !== "Agent") continue;
    if (isExcludedName(emp._fullName)) continue;
    if (emp._campaigns.length === 0) continue;

    let inAnyChannel = false;
    const missingFrom = [];

    for (const campaign of emp._campaigns) {
      const channelId = CAMPAIGN_CHANNELS[campaign];
      if (!channelId) continue;

      const memberSet = channelMembers[campaign];
      let found = false;

      if (emp.slack_user_id && memberSet.has(emp.slack_user_id)) {
        found = true;
      }

      if (!found && emp.email) {
        for (const userId of memberSet) {
          const su = slackUsers.get(userId);
          if (su?.email?.toLowerCase() === emp.email.toLowerCase()) {
            found = true;
            break;
          }
        }
      }

      if (found) {
        inAnyChannel = true;
      } else {
        missingFrom.push(campaign);
      }
    }

    if (!inAnyChannel && missingFrom.length > 0) {
      sectionC.push({
        name: emp._fullName,
        dirCampaigns: emp._campaignsStr,
        missingFrom: missingFrom.join(", "),
        slackUserId: emp.slack_user_id || "(none)",
        email: emp.email || "(no email)",
      });
    }
  }

  if (sectionC.length === 0) {
    console.log("  All agents with campaigns are in at least one Slack channel.\n");
  } else {
    console.log(`  Found ${sectionC.length} agents with campaigns not in ANY corresponding Slack channel:`);
    console.log("  " + "-".repeat(76));
    for (const r of sectionC.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(
        `    ${r.name.padEnd(28)} | Dir: ${r.dirCampaigns.padEnd(25)} | Missing: ${r.missingFrom} | Slack: ${r.slackUserId}`
      );
    }
    console.log();
  }

  // ── Summary ────────────────────────────────────────────────────────
  console.log("=".repeat(80));
  console.log("  SUMMARY");
  console.log("=".repeat(80));
  const aSlackNotDir = sectionA.filter((r) => r.type === "in_slack_not_directory").length;
  const aDirNotSlack = sectionA.filter((r) => r.type === "in_directory_not_slack").length;
  console.log(`  A) Slack->Dir mismatches:  ${aSlackNotDir} in Slack but not in directory campaigns`);
  console.log(`     Dir->Slack mismatches:  ${aDirNotSlack} in directory but not in Slack channel`);
  console.log(`  B) Non-directory members:  ${sectionB.length} people in channels but not Active employees`);
  console.log(`  C) Missing from channels:  ${sectionC.length} agents with campaigns but not in any Slack channel`);
  console.log();
  console.log("  Known exclusions (not reported above):");
  for (const name of EXCLUDED_NAMES) {
    console.log(`    - ${name}`);
  }
  console.log();
  console.log("  Audit complete.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
