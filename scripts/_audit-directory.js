require("dotenv").config({ path: ".env.local" });
var https = require("https");
var supabase = require("@supabase/supabase-js");
var sb = supabase.createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
var blocklist = require("./pitch-health-blocklist.json");
var blockSet = {};
blocklist.forEach(function(n) { blockSet[n.toLowerCase().trim()] = true; });

function slackGet(path) {
  return new Promise(function(resolve, reject) {
    var opts = { hostname: "slack.com", path: path, headers: { Authorization: "Bearer " + process.env.SLACK_BOT_TOKEN } };
    https.get(opts, function(res) {
      var body = "";
      res.on("data", function(c) { body += c; });
      res.on("end", function() { resolve(JSON.parse(body)); });
    }).on("error", reject);
  });
}

async function getAllMembers(channelId) {
  var all = [];
  var cursor = "";
  do {
    var url = "/api/conversations.members?channel=" + channelId + "&limit=1000";
    if (cursor) url += "&cursor=" + encodeURIComponent(cursor);
    var data = await slackGet(url);
    if (data.members) all = all.concat(data.members);
    cursor = (data.response_metadata && data.response_metadata.next_cursor) || "";
  } while (cursor);
  return all;
}

async function main() {
  // ======================================================================
  // PART 1: DIRECTORY COMPLETENESS
  // ======================================================================
  var res = await sb.from("employee_directory")
    .select("id, first_name, last_name, employee_status, role, email, phone, country, hourly_wage, slack_user_id, current_campaigns, hired_at, contract_status, terminated_at, user_image");

  var all = res.data || [];
  if (all.length === 0) {
    console.log("ERROR: No data returned. Check Supabase connection.");
    console.log("Error:", res.error);
    return;
  }

  var active = all.filter(function(r) { return r.employee_status === "Active"; });
  var terminated = all.filter(function(r) { return r.employee_status === "Terminated"; });
  var agents = active.filter(function(r) { return r.role === "Agent"; });
  var nonAgents = active.filter(function(r) { return r.role !== "Agent"; });

  console.log("========================================");
  console.log("  EMPLOYEE DIRECTORY - FULL AUDIT");
  console.log("  Date: " + new Date().toISOString().slice(0, 10));
  console.log("========================================\n");

  console.log("HEADCOUNT");
  console.log("  Total entries:", all.length);
  console.log("  Active:", active.length, "(Agents:", agents.length, "| Non-Agents:", nonAgents.length + ")");
  console.log("  Terminated:", terminated.length);

  console.log("\n--- FIELD COMPLETENESS (Active: " + active.length + ") ---");
  var fields = [
    { label: "first_name", fn: function(r) { return !r.first_name; } },
    { label: "last_name", fn: function(r) { return !r.last_name; } },
    { label: "email", fn: function(r) { return !r.email; } },
    { label: "phone", fn: function(r) { return !r.phone; } },
    { label: "country", fn: function(r) { return !r.country; } },
    { label: "hourly_wage", fn: function(r) { return r.hourly_wage === null || r.hourly_wage === undefined; } },
    { label: "slack_user_id", fn: function(r) { return !r.slack_user_id; } },
    { label: "current_campaigns", fn: function(r) { var c = r.current_campaigns; return !c || c === "[]" || c === "" || (Array.isArray(c) && c.length === 0); } },
    { label: "hired_at", fn: function(r) { return !r.hired_at; } },
    { label: "user_image", fn: function(r) { return !r.user_image; } },
    { label: "contract_status", fn: function(r) { return !r.contract_status || r.contract_status === "not_sent"; } },
    { label: "role", fn: function(r) { return !r.role; } },
  ];

  fields.forEach(function(f) {
    var missing = active.filter(f.fn);
    var filled = active.length - missing.length;
    var pct = (filled / active.length * 100).toFixed(1);
    var bar = "";
    for (var b = 0; b < 20; b++) bar += (b < Math.round(filled / active.length * 20)) ? "█" : "░";
    var status = missing.length === 0 ? "✓ COMPLETE" : missing.length <= 5 ? "~ NEAR" : missing.length > active.length * 0.5 ? "✗ BULK GAP" : "! GAPS";
    console.log("  " + bar + " " + f.label + ": " + filled + "/" + active.length + " (" + pct + "%) " + status);
    if (missing.length > 0 && missing.length <= 25) {
      missing.forEach(function(r) { console.log("      - " + r.first_name + " " + r.last_name + (r.role !== "Agent" ? " (" + r.role + ")" : "") + (r.hired_at ? " [hired " + r.hired_at.slice(0,10) + "]" : "")); });
    }
  });

  // Wage breakdown for agents
  var agentNoWage = agents.filter(function(r) { return r.hourly_wage === null || r.hourly_wage === undefined; });
  var agentZeroWage = agents.filter(function(r) { return r.hourly_wage === 0; });
  console.log("\n--- WAGE DETAIL (Agents: " + agents.length + ") ---");
  console.log("  Has wage (>0):", agents.length - agentNoWage.length - agentZeroWage.length);
  console.log("  Zero wage ($0):", agentZeroWage.length);
  if (agentZeroWage.length > 0 && agentZeroWage.length <= 10) {
    agentZeroWage.forEach(function(r) { console.log("      - " + r.first_name + " " + r.last_name); });
  }
  console.log("  Missing wage (null):", agentNoWage.length);
  if (agentNoWage.length > 0 && agentNoWage.length <= 25) {
    agentNoWage.forEach(function(r) { console.log("      - " + r.first_name + " " + r.last_name + " [hired " + (r.hired_at ? r.hired_at.slice(0,10) : "?") + "]"); });
  }

  // Name formatting
  var badNames = active.filter(function(r) {
    var f = r.first_name || "";
    var l = r.last_name || "";
    return (f.length > 0 && f === f.toLowerCase()) || (l.length > 0 && l === l.toLowerCase());
  });
  console.log("\n--- NAME FORMATTING ISSUES ---");
  console.log("  Lowercase names:", badNames.length);
  badNames.forEach(function(r) { console.log("      - \"" + r.first_name + " " + r.last_name + "\""); });

  // Campaign distribution
  var campaignCounts = {};
  agents.forEach(function(r) {
    var camps = r.current_campaigns;
    if (Array.isArray(camps)) {
      camps.forEach(function(c) { campaignCounts[c] = (campaignCounts[c] || 0) + 1; });
    }
  });
  console.log("\n--- CAMPAIGN DISTRIBUTION (Agents) ---");
  Object.keys(campaignCounts).sort(function(a,b) { return campaignCounts[b] - campaignCounts[a]; }).forEach(function(c) {
    console.log("  " + c + ": " + campaignCounts[c]);
  });

  // Duplicates
  var nameMap = {};
  active.forEach(function(r) {
    var key = (r.first_name + " " + r.last_name).toLowerCase().trim();
    if (!nameMap[key]) nameMap[key] = [];
    nameMap[key].push(r);
  });
  var dupes = Object.keys(nameMap).filter(function(k) { return nameMap[k].length > 1; });
  console.log("\n--- DUPLICATES (Active) ---");
  console.log("  Duplicate names:", dupes.length);
  dupes.forEach(function(name) {
    var records = nameMap[name];
    console.log("  " + name + " (" + records.length + "x)");
    records.forEach(function(r) { console.log("      id:" + r.id.slice(0,8) + " slack:" + (r.slack_user_id || "none") + " email:" + (r.email || "none")); });
  });

  // ======================================================================
  // PART 2: CRON JOB HEALTH
  // ======================================================================
  console.log("\n========================================");
  console.log("  CRON JOB & DATA FRESHNESS");
  console.log("========================================\n");

  // HR Sheets sync
  var hb = await sb.from("sync_heartbeat").select("*").order("last_sync", { ascending: false }).limit(10);
  console.log("--- HR Sheets Sync (heartbeat) ---");
  (hb.data || []).forEach(function(r) {
    var age = Math.round((Date.now() - new Date(r.last_sync).getTime()) / 3600000);
    var stale = age > 1 ? " [STALE " + age + "h ago]" : " [FRESH]";
    console.log("  " + r.sheet_name + ": " + r.last_sync.slice(0,16) + " | rows:" + r.row_count + stale);
  });

  // DialedIn reports
  var di = await sb.from("dialedin_reports").select("report_type, date_range_start, date_range_end, created_at, status").order("created_at", { ascending: false }).limit(5);
  console.log("\n--- DialedIn Reports (latest 5) ---");
  (di.data || []).forEach(function(r) {
    console.log("  " + r.report_type + " | " + r.date_range_start + " → " + r.date_range_end + " | " + r.status + " | " + r.created_at.slice(0,16));
  });

  // DialedIn performance latest
  var perfDate = await sb.from("dialedin_agent_performance").select("report_date").order("report_date", { ascending: false }).limit(1);
  console.log("\n--- DialedIn Agent Performance ---");
  console.log("  Latest report_date:", (perfDate.data || [])[0] ? perfDate.data[0].report_date : "none");

  // Directory update freshness
  var latestUpdates = await sb.from("employee_directory").select("hired_at, first_name, last_name").order("hired_at", { ascending: false }).limit(5);
  console.log("\n--- Latest Directory Entries (by hire date) ---");
  (latestUpdates.data || []).forEach(function(r) { console.log("  " + r.first_name + " " + r.last_name + " | hired: " + (r.hired_at || "never")); });

  // QA results
  var qa = await sb.from("qa_results").select("created_at, agent_name").order("created_at", { ascending: false }).limit(3);
  console.log("\n--- Latest QA Results ---");
  (qa.data || []).forEach(function(r) { console.log("  " + r.agent_name + " | " + r.created_at.slice(0,16)); });

  // Sam attendance
  var att = await sb.from("attendance_pending_confirmations").select("created_at, status, reported_by_name").order("created_at", { ascending: false }).limit(3);
  console.log("\n--- Latest Sam Attendance ---");
  (att.data || []).forEach(function(r) { console.log("  " + r.status + " | " + r.reported_by_name + " | " + r.created_at.slice(0,16)); });

  // ======================================================================
  // PART 3: SLACK CHANNEL AUDIT
  // ======================================================================
  console.log("\n========================================");
  console.log("  SLACK CHANNEL AUDIT");
  console.log("========================================\n");

  var campaigns = {
    Medicare: "C0A896J4JEM",
    ACA: "C07A07ANCAG",
    "Medicare WhatIF": "C06CDFV4ECR",
    "Home Care Michigan": "C0A3AH1K56E",
    "Home Care PA": "C09JRPT6HME",
    Hospital: "C0AE4E14S8M",
    "Pitch Meals": "C0AEWM51U90"
  };

  var channelMembers = {};
  var allChannelUids = {};
  var keys = Object.keys(campaigns);
  for (var i = 0; i < keys.length; i++) {
    var members = await getAllMembers(campaigns[keys[i]]);
    channelMembers[keys[i]] = members;
    console.log("  " + keys[i] + ": " + members.length + " members");
    members.forEach(function(uid) {
      if (!allChannelUids[uid]) allChannelUids[uid] = [];
      allChannelUids[uid].push(keys[i]);
    });
  }

  // Build directory slack ID maps
  var dirSlackIds = {};
  var dirBySlack = {};
  all.forEach(function(r) {
    if (r.slack_user_id) {
      dirSlackIds[r.slack_user_id] = true;
      dirBySlack[r.slack_user_id] = r;
    }
  });

  // Terminated in channels
  var termInChannels = [];
  terminated.forEach(function(t) {
    if (!t.slack_user_id) return;
    if (!allChannelUids[t.slack_user_id]) return;
    termInChannels.push({
      name: t.first_name + " " + t.last_name,
      channels: allChannelUids[t.slack_user_id],
      slack: t.slack_user_id
    });
  });
  console.log("\n--- Terminated Agents Still in Campaign Channels ---");
  console.log("  Count:", termInChannels.length);
  termInChannels.forEach(function(t) { console.log("    " + t.name + " | " + t.channels.join(", ")); });

  // Unknown users in channels (not in directory at all)
  var unknownUids = Object.keys(allChannelUids).filter(function(uid) { return !dirSlackIds[uid]; });
  console.log("\n--- Users in Campaign Channels NOT in Directory ---");
  console.log("  Count:", unknownUids.length);

  var needsAdding = [];
  var pitchHealth = [];
  var deactivated = [];
  var bots = [];

  for (var j = 0; j < unknownUids.length; j++) {
    var uid = unknownUids[j];
    var info = await slackGet("/api/users.info?user=" + uid);
    if (!info.ok || !info.user) continue;
    var u = info.user;
    if (u.is_bot || u.id === "USLACKBOT") { bots.push(u.real_name); continue; }
    var isPH = blockSet[(u.real_name || "").toLowerCase().trim()];
    if (isPH) {
      pitchHealth.push({ name: u.real_name, channels: allChannelUids[uid] });
    } else if (u.deleted) {
      deactivated.push({ name: u.real_name, channels: allChannelUids[uid] });
    } else {
      needsAdding.push({
        name: u.real_name,
        email: u.profile ? u.profile.email : "",
        id: uid,
        channels: allChannelUids[uid]
      });
    }
  }

  console.log("\n  [PITCH HEALTH - should be removed from our channels]:", pitchHealth.length);
  pitchHealth.forEach(function(p) { console.log("    " + p.name + " | " + p.channels.join(", ")); });

  console.log("\n  [DEACTIVATED Slack accounts in channels]:", deactivated.length);
  deactivated.forEach(function(d) { console.log("    " + d.name + " | " + d.channels.join(", ")); });

  console.log("\n  [NEEDS ADDING to directory]:", needsAdding.length);
  needsAdding.forEach(function(n) { console.log("    " + n.name + " | " + n.email + " | " + n.channels.join(", ") + " | " + n.id); });

  console.log("\n  [Bots/apps]:", bots.length);

  // Active agents NOT in any campaign channel
  var activeNotInChannel = agents.filter(function(a) {
    return a.slack_user_id && !allChannelUids[a.slack_user_id];
  });
  var activeNoSlack = agents.filter(function(a) { return !a.slack_user_id; });
  console.log("\n--- Active Agents NOT in Any Campaign Channel ---");
  console.log("  No Slack ID:", activeNoSlack.length);
  activeNoSlack.forEach(function(a) { console.log("    " + a.first_name + " " + a.last_name); });
  console.log("  Has Slack but not in channels:", activeNotInChannel.length);
  activeNotInChannel.forEach(function(a) { console.log("    " + a.first_name + " " + a.last_name + " | campaigns field:" + JSON.stringify(a.current_campaigns)); });

  // ======================================================================
  // SUMMARY
  // ======================================================================
  console.log("\n========================================");
  console.log("  ACTION ITEMS SUMMARY");
  console.log("========================================\n");

  var actionItems = [];
  if (needsAdding.length > 0) actionItems.push("ADD " + needsAdding.length + " agents to directory (in Slack channels, not in directory)");
  if (agentNoWage.length > 0) actionItems.push("SET WAGES for " + agentNoWage.length + " agents (null hourly_wage)");
  if (badNames.length > 0) actionItems.push("FIX " + badNames.length + " lowercase agent names");
  var missingCountry = active.filter(function(r) { return !r.country; });
  if (missingCountry.length > 0) actionItems.push("SET COUNTRY for " + missingCountry.length + " agent(s)");
  var missingEmail = active.filter(function(r) { return !r.email; });
  if (missingEmail.length > 0) actionItems.push("SET EMAIL for " + missingEmail.length + " agent(s)");
  if (pitchHealth.length > 0) actionItems.push("REMOVE " + pitchHealth.length + " Pitch Health agents from our campaign channels");
  if (termInChannels.length > 0) actionItems.push("REMOVE " + termInChannels.length + " terminated agents from campaign channels");
  if (activeNotInChannel.length > 0) actionItems.push("CHECK " + activeNotInChannel.length + " active agents not in any campaign channel");

  actionItems.forEach(function(item, idx) { console.log("  " + (idx+1) + ". " + item); });
  if (actionItems.length === 0) console.log("  No action items — directory is clean!");
}

main().catch(function(e) { console.error("Fatal:", e); });
