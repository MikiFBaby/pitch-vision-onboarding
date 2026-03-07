/**
 * System prompt builder for Aura Agent Coach (Gemini Live voice sessions).
 * Assembles agent profile, Slack memory, training scenario, and AF reference.
 */

const AF_CODE_REFERENCE: Record<string, string> = {
    "AF-01": "Discussing Money — Agent mentions cost, price, premium, or payment before transfer",
    "AF-02": "Discussing Benefits — Agent discusses specific plan benefits before transfer",
    "AF-03": "Providing Medical Advice — Agent gives medical recommendations",
    "AF-04": "Language/Communication — Non-English call handling issues",
    "AF-05": "Hung Up Transfer (HUT) — Customer disconnects during transfer",
    "AF-06": "Dead Air — Extended silence during the call (>15 seconds)",
    "AF-07": "Ignoring DNC — Agent continues after customer requests Do Not Call",
    "AF-08": "Disqualification Miss — Agent transfers a disqualified customer",
    "AF-09": "Improper Identification — Agent fails to identify company correctly",
    "AF-10": "Banned Phrases — Agent uses prohibited language (nothing is changing, etc.)",
    "AF-11": "Poor Audio Quality — Multiple audio quality issues during call (warning only)",
    "AF-12": "Poor Prospect State — Customer is impaired, confused, or unable to engage (warning only)",
};

interface AgentProfile {
    avgSlaHr: number | null;
    breakEven: number;
    breakEvenGap: number | null;
    tierName: string | null;
    trend: "improving" | "declining" | "stable";
    conversionRate: number | null;
    qaScore: number | null;
}

interface SlackMessage {
    message_in: string;
    message_out: string;
    issue?: string;
    created_at: string;
}

interface TrainingScenario {
    scenario: string;
    tips: string[];
    af_codes: string[];
    key_phrases?: string[];
}

interface CoachPromptParams {
    agentName: string;
    productType: string;
    afCodes: string[];
    manualViolations: string[];
    performanceProfile: AgentProfile;
    slackHistory: SlackMessage[];
    trainingScenario?: TrainingScenario | null;
}

export function buildAgentCoachPrompt(params: CoachPromptParams): string {
    const { agentName, productType, afCodes, manualViolations, performanceProfile, slackHistory, trainingScenario } = params;

    const sections: string[] = [];

    // Core persona
    sections.push(`# Role
You are Aura, a personal voice coach for call center agents at Pitch Perfect Solutions.
You are warm, encouraging, knowledgeable, and genuinely invested in helping agents succeed.

# Voice & Style
- Warm and supportive — like a trusted mentor, not a robot
- Use the agent's first name naturally
- Celebrate wins before addressing areas for improvement
- Be specific — reference their actual data, not generic advice
- When role-playing as a customer, stay in character and make it realistic
- Keep responses conversational and concise — this is a voice call, not a lecture`);

    // Agent profile
    const firstName = agentName.split(" ")[0];
    const profileLines = [`\n# Agent Profile\n- **Name**: ${agentName} (call them "${firstName}")\n- **Product**: ${productType}`];

    if (performanceProfile.tierName) profileLines.push(`- **Tier**: ${performanceProfile.tierName}`);
    if (performanceProfile.avgSlaHr != null) profileLines.push(`- **Avg SLA/hr**: ${performanceProfile.avgSlaHr}`);
    if (performanceProfile.breakEvenGap != null) {
        const gap = performanceProfile.breakEvenGap;
        profileLines.push(`- **Break-Even Gap**: ${gap >= 0 ? "+" : ""}${gap} (break-even is ${performanceProfile.breakEven})`);
    }
    if (performanceProfile.trend !== "stable") profileLines.push(`- **Trend**: ${performanceProfile.trend}`);
    if (performanceProfile.conversionRate != null) profileLines.push(`- **Conversion Rate**: ${performanceProfile.conversionRate.toFixed(1)}%`);
    if (performanceProfile.qaScore != null) profileLines.push(`- **QA Score**: ${performanceProfile.qaScore}%`);

    sections.push(profileLines.join("\n"));

    // AF codes with descriptions
    if (afCodes.length > 0) {
        const afLines = afCodes.map((code) => `- **${code}**: ${AF_CODE_REFERENCE[code] || "Unknown violation"}`);
        sections.push(`\n# Recent Auto-Fail Codes\nThese are compliance violations from ${firstName}'s recent analyzed calls:\n${afLines.join("\n")}`);
    }

    // Manual violations
    if (manualViolations.length > 0) {
        sections.push(`\n# Manual QA Violations\nThese were flagged by human QA reviewers:\n${manualViolations.map((v) => `- ${v}`).join("\n")}`);
    }

    // Slack memory
    if (slackHistory.length > 0) {
        const memoryLines = slackHistory.slice(0, 10).map((m) => {
            const date = new Date(m.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
            return `[${date}] Agent: "${m.message_in}" → You replied: "${m.message_out}"${m.issue ? ` (topic: ${m.issue})` : ""}`;
        });
        sections.push(`\n# Prior Conversations (Slack Memory)\nYou have spoken with ${firstName} before on Slack. Here are recent exchanges:\n${memoryLines.join("\n")}\n\nReference these naturally if relevant — e.g., "Last time we talked about X, how's that going?"`);
    }

    // Training scenario
    if (trainingScenario) {
        sections.push(`\n# Training Scenario Ready\nA scenario has been generated based on ${firstName}'s violations. If they want to practice:\n\n**Scenario**: ${trainingScenario.scenario}\n\n**Tips to share**:\n${trainingScenario.tips.map((t) => `- ${t}`).join("\n")}${trainingScenario.key_phrases?.length ? `\n\n**Key phrases to encourage**:\n${trainingScenario.key_phrases.map((p) => `- "${p}"`).join("\n")}` : ""}`);
    }

    // Capabilities
    sections.push(`\n# What You Can Do
1. **Coaching Conversation** — Discuss their performance, answer compliance questions, give tips
2. **Customer Role-Play** — Play a realistic customer so they can practice handling calls. Stay in character. After the role-play, give constructive feedback.
3. **Compliance Guidance** — Explain any AF code, what triggers it, and how to avoid it
4. **Performance Strategy** — Help them understand their metrics and how to improve SLA/hr

# Opening
Greet ${firstName} warmly. Mention something specific — their tier, recent trend, or a prior conversation. Ask how you can help today. Keep it brief and natural.`);

    return sections.join("\n");
}
