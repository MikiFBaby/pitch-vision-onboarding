require("dotenv").config({ path: ".env.local" });

const HIRES_BOT = process.env.SLACK_BOT_TOKEN;
const SAM_BOT = process.env.SLACK_ATTENDANCE_BOT_TOKEN;

async function listBotChannels(token, label) {
  let channels = [];
  let cursor = "";
  do {
    const url = "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200" + (cursor ? "&cursor=" + cursor : "");
    const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    const data = await res.json();
    if (!data.ok) { console.log(label + " error: " + data.error); return []; }
    channels = channels.concat(data.channels || []);
    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);
  return channels;
}

async function main() {
  console.log("=== HIRES BOT — Channels ===");
  const hiresChannels = await listBotChannels(HIRES_BOT, "Hires Bot");
  const hiresMember = hiresChannels.filter(c => c.is_member);
  console.log("Member of " + hiresMember.length + " channels:");
  hiresMember.forEach(c => console.log("  #" + c.name + " (" + c.id + ")" + (c.is_private ? " [private]" : "")));

  console.log("\n=== SAM BOT — Channels ===");
  const samChannels = await listBotChannels(SAM_BOT, "Sam Bot");
  const samMember = samChannels.filter(c => c.is_member);
  console.log("Member of " + samMember.length + " channels:");
  samMember.forEach(c => console.log("  #" + c.name + " (" + c.id + ")" + (c.is_private ? " [private]" : "")));

  // Highlight campaign channels
  const campaignKeywords = ["medicare", "aca", "whatif", "what-if", "campaign"];
  console.log("\n=== CAMPAIGN CHANNEL PRESENCE ===");
  const allChannels = [...new Map([...hiresMember, ...samMember].map(c => [c.id, c])).values()];
  const campaignChannels = allChannels.filter(c => campaignKeywords.some(k => c.name.toLowerCase().includes(k)));
  if (campaignChannels.length === 0) {
    console.log("No campaign-specific channels found among joined channels.");
    // Search ALL visible channels for campaign names
    const allVisible = [...new Map([...hiresChannels, ...samChannels].map(c => [c.id, c])).values()];
    const campaignVisible = allVisible.filter(c => campaignKeywords.some(k => c.name.toLowerCase().includes(k)));
    if (campaignVisible.length > 0) {
      console.log("\nCampaign channels visible but NOT joined:");
      campaignVisible.forEach(c => console.log("  #" + c.name + " (" + c.id + ") — members: " + (c.num_members || "?")));
    }
  } else {
    campaignChannels.forEach(c => {
      const inHires = hiresMember.some(h => h.id === c.id);
      const inSam = samMember.some(s => s.id === c.id);
      console.log("  #" + c.name + " — Hires Bot: " + (inHires ? "YES" : "no") + " | Sam Bot: " + (inSam ? "YES" : "no"));
    });
  }
}

main().catch(console.error);
