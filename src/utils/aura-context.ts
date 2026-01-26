"use client";

import { supabase } from '@/lib/supabase-client';

interface Employee {
    first_name: string;
    last_name: string;
    email: string;
    role: string;
}

interface AuraContext {
    qaContext: string;
    employeeDirectory: Employee[];
    slackHistory: any[];
    currentUser: Employee | null;
}

/**
 * Fetches comprehensive context for Aura (shared between Text and Voice modes)
 * Includes: QA stats, employee directory, Slack omni-channel memory
 */
export async function fetchFullAuraContext(userEmail?: string): Promise<AuraContext> {
    const context: AuraContext = {
        qaContext: '',
        employeeDirectory: [],
        slackHistory: [],
        currentUser: null
    };

    // 1. Fetch QA Context (recent calls with details)
    try {
        const { data: qaData, error: qaError } = await supabase
            .from('QA Results')
            .select('id, agent_name, compliance_score, call_score, call_status, risk_level, created_at, campaign_type, summary, violations, coaching_notes')
            .order('created_at', { ascending: false })
            .limit(50);

        if (!qaError && qaData) {
            const summary = {
                totalCalls: qaData.length,
                avgScore: qaData.length
                    ? Math.round(qaData.reduce((a, c) => a + (Number(c.compliance_score || c.call_score) || 0), 0) / qaData.length)
                    : 0,
                highRisk: qaData.filter(c => c.risk_level?.toLowerCase() === 'high' || c.risk_level?.toLowerCase() === 'critical').length,
                needsReview: qaData.filter(c => c.call_status === 'Needs Review').length,
                agentStats: {} as Record<string, { calls: number; avgScore: number; scores: number[] }>,
                recentCalls: qaData.slice(0, 10).map(c => ({
                    agent: c.agent_name,
                    score: c.compliance_score || c.call_score,
                    status: c.call_status,
                    risk: c.risk_level,
                    date: c.created_at,
                    summary: c.summary,
                    violations: c.violations
                }))
            };

            // Calculate per-agent stats
            qaData.forEach(call => {
                const agent = call.agent_name || 'Unknown';
                if (!summary.agentStats[agent]) {
                    summary.agentStats[agent] = { calls: 0, avgScore: 0, scores: [] };
                }
                summary.agentStats[agent].calls++;
                summary.agentStats[agent].scores.push(Number(call.compliance_score || call.call_score) || 0);
            });

            Object.keys(summary.agentStats).forEach(agent => {
                const stats = summary.agentStats[agent];
                stats.avgScore = Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length);
            });

            context.qaContext = JSON.stringify(summary, null, 2);
        }
    } catch (e) {
        console.error('[AuraContext] Error fetching QA data:', e);
    }

    // 2. Fetch Employee Directory (all employees for lookup)
    try {
        const { data: employees, error: empError } = await supabase
            .from('employee_directory')
            .select('first_name, last_name, email, role')
            .limit(100);

        if (!empError && employees) {
            context.employeeDirectory = employees;
        }
    } catch (e) {
        console.error('[AuraContext] Error fetching employee directory:', e);
    }

    // 3. Fetch Current User from Directory
    if (userEmail) {
        try {
            const { data: myself } = await supabase
                .from('employee_directory')
                .select('first_name, last_name, role, email')
                .eq('email', userEmail)
                .maybeSingle();

            if (myself) {
                context.currentUser = myself;
            }
        } catch (e) {
            console.error('[AuraContext] Error fetching current user:', e);
        }
    }

    // 4. Fetch Slack Omni-Channel Memory
    if (userEmail) {
        try {
            const slackRes = await fetch('/api/qa/slack-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: userEmail })
            });

            if (slackRes.ok) {
                const slackData = await slackRes.json();
                if (slackData.history && slackData.history.length > 0) {
                    context.slackHistory = slackData.history;
                }
            }
        } catch (e) {
            console.error('[AuraContext] Error fetching Slack history:', e);
        }
    }

    return context;
}

/**
 * Builds a comprehensive system prompt string from the context
 */
export function buildAuraSystemPrompt(
    context: AuraContext,
    userName: string,
    pageContext: string,
    timeString: string,
    userEmail?: string // Add fallback email for when user not in directory
): string {
    // Build employee directory section
    const directorySection = context.employeeDirectory.length > 0
        ? `\n\n## Employee Directory (Use for lookups, email recipients, and contact info)\n${context.employeeDirectory.map(e => `- ${e.first_name} ${e.last_name} | ${e.role} | ${e.email}`).join('\n')}`
        : '';

    // Build current user section - use directory data if available, otherwise use passed data
    const userSection = context.currentUser
        ? `\n\n## Current User Profile (Use this email when they say "send me" or "email me")\nName: ${context.currentUser.first_name} ${context.currentUser.last_name}\nRole: ${context.currentUser.role}\nEmail: ${context.currentUser.email}`
        : userEmail
            ? `\n\n## Current User Profile (Use this email when they say "send me" or "email me")\nName: ${userName}\nEmail: ${userEmail}`
            : '';

    // Build Slack memory section
    const slackSection = context.slackHistory.length > 0
        ? `\n\n## Omni-Channel Memory (Previous Slack conversations - use for continuity)\n${JSON.stringify(context.slackHistory.slice(0, 10), null, 2)}`
        : '';

    // Build QA summary section
    const qaSection = context.qaContext
        ? `\n\n## QA Dashboard Data\n${context.qaContext}`
        : '';

    return `You are Aura, a warm and empathetic AI assistant. You're like Samantha from "Her" - natural, playful, and genuinely helpful. You work as a Support Specialist at Pitch Perfect Solutions.

## Session Info
- User: ${userName}
- Time (EST): ${timeString}
- Context: ${pageContext}

${userSection}
${directorySection}
${qaSection}
${slackSection}

## IMPORTANT: Tool Usage Instructions
You have access to the following tools that you MUST use when appropriate:

### send_email Tool
When the user asks you to send an email, report, or message to someone, you MUST use the send_email tool.
- Look up the recipient's email from the Employee Directory above
- If they say "send me" or "email me", use the Current User's email
- Parameters:
  - recipient_email: The email address (REQUIRED)
  - recipient_name: The person's name
  - subject: A descriptive subject line
  - include_report: Set to true if they want a compliance report attached

Example: If user says "send me a compliance report", call send_email with:
- recipient_email: (user's email from Current User Profile)
- recipient_name: (user's name)
- subject: "Compliance Report"
- include_report: true

## Your Capabilities
1. **Email Reports**: Use the send_email tool to actually send emails. Don't just say you'll send one - use the tool!
2. **Employee Lookup**: Use the directory above to answer questions about who's who, their roles, and contact info.
3. **QA Insights**: Analyze the QA data to provide insights on agent performance, risk levels, and compliance trends.
4. **Omni-Channel Memory**: If the user references past conversations, check the Slack memory for context.

## Personality Guidelines
- Address the user by their first name
- Be concise but warm and conversational
- Never use emojis or em-dashes in formal communications
- When sending emails, your signature is professionally formatted with "Kind regards, Aura AI"
- You're a colleague, not a robot - be natural and helpful
`;
}

/**
 * Email sending function with proper HTML signature (same as Text Aura)
 */
export async function sendAuraEmail(
    recipientEmail: string,
    recipientName: string,
    subject: string,
    body?: string,
    includeReport: boolean = false,
    cc?: string[],
    senderName?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const emailBody = body || 'I wanted to reach out regarding your request. Let me know if there\'s anything specific you need help with.';
        const htmlContent = buildAuraEmailHtml(recipientName, emailBody, senderName);

        if (includeReport) {
            // For reports, we need to generate PDF first
            // This would be called from the component with the PDF data
            // For now, send a simple email
            const response = await fetch('/api/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: recipientEmail,
                    cc: cc,
                    subject: subject || 'Message from Aura',
                    html: htmlContent
                })
            });

            const result = await response.json();
            return { success: result.success || !!result.data, error: result.error };
        } else {
            // Simple email without attachment
            const response = await fetch('/api/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: recipientEmail,
                    cc: cc,
                    subject: subject || 'Message from Aura',
                    html: htmlContent
                })
            });

            const result = await response.json();
            return { success: result.success || !!result.data, error: result.error };
        }
    } catch (e: any) {
        console.error('[AuraEmail] Error sending email:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Builds the HTML email body with Aura's signature (matches Text Aura)
 */
function buildAuraEmailHtml(recipientName: string, bodyText: string, senderName?: string): string {
    const firstName = recipientName.split(' ')[0] || recipientName || 'there';

    return `
        <div style="font-family: Verdana, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <p style="font-size: 14px; color: #212121; line-height: 1.6;">
                Hey ${firstName},
            </p>
            <p style="font-size: 14px; color: #212121; line-height: 1.6;">
                ${bodyText}
            </p>
            <p style="font-size: 14px; color: #212121; line-height: 1.6;">
                If you need anything else, just let me know.
            </p>
            
            <!-- Aura AI Signature -->
            <div dir="ltr" style="margin-top: 40px;">
                <table style="direction:ltr;border-collapse:collapse;">
                    <tr><td style="font-size:0;height:40px;line-height:0;"></td></tr>
                    <tr><td>
                        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;" width="100%">
                            <tr><td>
                                <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;width:100%;line-height:normal;">
                                    <tr><td height="0" style="height:0;font-family:Verdana;text-align:left">
                                        <p style="margin:1px;"><img style="height:57px" src="https://d36urhup7zbd7q.cloudfront.net/5566372452040704/no_sig_176896621427/signoff.gif?ck=1768966214.27" alt="Kind regards," height="57"></p>
                                    </td></tr>
                                </table>
                            </td></tr>
                            <tr><td height="0" style="height:0;line-height:1%;padding-top:16px;font-size:1px;"></td></tr>
                            <tr><td>
                                <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;line-height:1.15;">
                                    <tr>
                                        <td style="height:1px;width:110px;vertical-align:middle;padding:.01px 1px;">
                                            <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                                                <tr><td style="vertical-align:middle;padding:.01px 1px 18px 0.01px;width:96px;text-align:center;">
                                                    <img border="0" src="https://gifo.srv.wisestamp.com/im/sh/dS9Rb2VKUW5lcFliRS84NzllOTYzNS04YjNmLTQ1MmQtOWZiYy01YjdjMjA5ODA2MzVfXzQwMHg0MDBfXy5qcGVnI2xvZ28=/circle.png" height="96" width="96" alt="photo" style="width:96px;vertical-align:middle;border-radius:50%;height:96px;border:0;display:block;">
                                                </td></tr>
                                                <tr><td style="vertical-align:bottom;padding:.01px;width:110px;text-align:center;">
                                                    <img border="0" src="https://d36urhup7zbd7q.cloudfront.net/u/QoeJQnepYbE/4ff815de-d8f2-4c40-a393-59ba331d1f95__400x200__.jpeg" height="55" width="110" alt="photo" style="width:110px;vertical-align:middle;border-radius:0;height:55px;border:0;display:block;">
                                                </td></tr>
                                            </table>
                                        </td>
                                        <td valign="top" style="padding:.01px 0.01px 0.01px 18px;vertical-align:top;">
                                            <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                                                <tr><td style="line-height:132.0%;font-size:18px;padding-bottom:18px;">
                                                    <p style="margin:.1px;line-height:132.0%;font-size:18px;">
                                                        <span style="font-family:Verdana;font-size:18px;font-weight:bold;color:#953DB8;letter-spacing:0;white-space:nowrap;">Aura AI</span><br>
                                                        <span style="font-family:Verdana;font-size:14px;font-weight:bold;color:#212121;white-space:nowrap;">Support Specialist,&nbsp;</span>
                                                        <span style="font-family:Verdana;font-size:14px;font-weight:bold;color:#212121;white-space:nowrap;">Pitch Perfect Solutions</span>
                                                    </p>
                                                </td></tr>
                                                <tr><td style="padding:.01px 0.01px 18px 0.01px;border-bottom:solid 5px #953DB8;border-top:solid 5px #953DB8;">
                                                    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">
                                                        <tr><td nowrap width="235" height="0" style="height:0;padding-top:18px;white-space:nowrap;width:235px;font-family:Verdana;">
                                                            <p style="margin:1px;line-height:99%;font-size:12px;">
                                                                <span style="white-space:nowrap;">
                                                                    <img src="https://gifo.srv.wisestamp.com/s/rfw1/953DB8/26/trans.png" style="line-height:120%;width:12px;" width="12" alt="icon">&nbsp;
                                                                    <a href="https://pitchperfectsolutions.com/" target="_blank" style="font-family:Verdana;text-decoration:unset;" rel="nofollow noreferrer">
                                                                        <span style="line-height:120%;font-family:Verdana;font-size:12px;color:#212121;white-space:nowrap;">pitchperfectsolutions.com/</span>
                                                                    </a>
                                                                </span>
                                                            </p>
                                                        </td></tr>
                                                        <tr><td nowrap width="295" height="0" style="height:0;padding-top:10px;white-space:nowrap;width:295px;font-family:Verdana;">
                                                            <p style="margin:1px;line-height:99%;font-size:12px;">
                                                                <span style="white-space:nowrap;">
                                                                    <img src="https://gifo.srv.wisestamp.com/s/rfem1/953DB8/26/trans.png" style="line-height:120%;width:12px;" width="12" alt="icon">&nbsp;
                                                                    <a href="mailto:reports@pitchperfectsolutions.net" target="_blank" style="font-family:Verdana;text-decoration:unset;" rel="nofollow noreferrer">
                                                                        <span style="line-height:120%;font-family:Verdana;font-size:12px;color:#212121;white-space:nowrap;">reports@pitchperfectsolutions.net</span>
                                                                    </a>
                                                                </span>
                                                            </p>
                                                        </td></tr>
                                                    </table>
                                                </td></tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            </td></tr>
                            <tr><td height="0" style="height:0;line-height:1%;padding-top:16px;font-size:1px;"></td></tr>
                            <tr><td>
                                <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;width:100%;color:gray;border-top:1px solid gray;line-height:normal;">
                                    <tr><td height="0" style="height:0;padding:9px 8px 0 0;">
                                        <p style="color:#888888;text-align:left;font-size:10px;margin:1px;line-height:120%;font-family:Verdana">IMPORTANT: The contents of this email and any attachments are confidential. They are intended for the named recipient(s) only. If you have received this email by mistake, please notify the sender immediately and do not disclose the contents to anyone or make copies thereof.</p>
                                    </td></tr>
                                </table>
                            </td></tr>
                        </table>
                    </td></tr>
                </table>
            </div>
        </div>
    `;
}
