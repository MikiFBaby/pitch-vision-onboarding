import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { openDmChannel, postSlackMessage } from "@/utils/slack-helpers";

export const runtime = "nodejs";

/**
 * POST /api/slack/send-dm
 * Sends a Slack DM to an employee or their manager.
 * Body: {
 *   recipient_slack_id?: string,   // Slack user ID (for employee)
 *   recipient_name?: string,       // Manager name (resolved to slack_user_id)
 *   message: string,
 *   employee_id: string,           // Employee whose card is open (audit)
 *   sent_by_email: string,         // Sender's email (audit)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { recipient_slack_id, recipient_name, message, employee_id, sent_by_email } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    if (!employee_id) {
      return NextResponse.json({ error: "employee_id is required" }, { status: 400 });
    }

    // Resolve recipient Slack ID
    let slackUserId = recipient_slack_id;

    if (!slackUserId && recipient_name) {
      const nameParts = recipient_name.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.length >= 2 ? nameParts.slice(1).join(" ") : "";

      let query = supabaseAdmin
        .from("employee_directory")
        .select("slack_user_id, first_name, last_name")
        .not("slack_user_id", "is", null)
        .neq("slack_user_id", "");

      if (lastName) {
        query = query.ilike("first_name", firstName).ilike("last_name", lastName);
      } else {
        query = query.ilike("first_name", firstName);
      }

      const { data: dirMatch } = await query.maybeSingle();

      if (!dirMatch?.slack_user_id) {
        return NextResponse.json(
          { error: `Could not find Slack ID for "${recipient_name}". They may not have a linked Slack account.` },
          { status: 404 }
        );
      }
      slackUserId = dirMatch.slack_user_id;
    }

    if (!slackUserId) {
      return NextResponse.json({ error: "No recipient specified" }, { status: 400 });
    }

    // Open DM channel
    const dmResult = await openDmChannel(slackUserId);
    if (!dmResult.ok || !dmResult.channelId) {
      return NextResponse.json(
        { error: `Failed to open DM channel: ${dmResult.error || "Unknown error"}` },
        { status: 500 }
      );
    }

    // Resolve sender identity (name + avatar) for message customization + audit
    let senderName = sent_by_email || "Unknown";
    let senderAvatar: string | undefined;
    if (sent_by_email) {
      const { data: sender } = await supabaseAdmin
        .from("employee_directory")
        .select("first_name, last_name, user_image")
        .ilike("email", sent_by_email)
        .maybeSingle();
      if (sender?.first_name && sender?.last_name) {
        senderName = `${sender.first_name} ${sender.last_name}`;
      }
      if (sender?.user_image) {
        senderAvatar = sender.user_image;
      }
    }

    // Send message as the HR person (requires chat:write.customize scope)
    const msgResult = await postSlackMessage(
      dmResult.channelId,
      message.trim(),
      undefined,
      undefined,
      { username: senderName, icon_url: senderAvatar }
    );
    if (!msgResult?.ok) {
      return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    }

    // Record in employee_write_ups for audit trail
    await supabaseAdmin.from("employee_write_ups").insert({
      employee_id,
      type: "slack_dm",
      subject: `DM to ${recipient_name || "Employee"}`,
      body: message.trim(),
      sent_by: senderName,
      sent_at: new Date().toISOString(),
      status: "sent",
      message_id: msgResult.ts || null,
    });

    return NextResponse.json({
      success: true,
      message_ts: msgResult.ts,
    });
  } catch (err: any) {
    console.error("[send-dm] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
