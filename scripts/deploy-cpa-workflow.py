#!/usr/bin/env python3
"""
Deploy CPA (Compliance Pre-Audit) Pipeline to n8n v2.0

Manages two CPA workflows:
  A) Submit Workflow — slim async submitter (POST /webhook/cpa-upload)
  B) Callback Workflow — processing + routing (POST /webhook/cpa-runpod-callback)

Usage:
    python3 scripts/deploy-cpa-workflow.py --update              # update submit workflow
    python3 scripts/deploy-cpa-workflow.py --update-callback     # update callback workflow
    python3 scripts/deploy-cpa-workflow.py --update-both         # update both
    python3 scripts/deploy-cpa-workflow.py --dry-run             # preview only (combine with above)

Submit Flow (Workflow A):
    POST /webhook/cpa-upload
      -> Check Duplicates
      -> Submit to RunPod /run (async, with webhook callback)
      -> Return Accepted immediately

Callback Flow (Workflow B — triggered by RunPod completion webhook):
    POST /webhook/cpa-runpod-callback (from RunPod)
      -> Extract Transcription + metadata
      -> Check RunPod Status
      -> Format Transcript (normalization)
      -> Compute Call Metrics
      -> CPA Pre-Screen v6.0 (enhanced compliance checks)
      -> Route: PASS -> forward to full AI pipeline | FAIL -> store to DB
"""

import json
import os
import sys
import uuid
from pathlib import Path

import requests

# ─── Configuration ──────────────────────────────────────────────────

SCRIPTS_DIR = Path(__file__).parent
API_BASE = "https://n8n.pitchvision.io/api/v1/workflows"

SUBMIT_WORKFLOW_ID = "tuIPgrh5fR64knHq"
CALLBACK_WORKFLOW_ID = "JdP9HKC82GV9BdW1"

# Load keys from env or .env.local
def _load_env_key(key_name):
    val = os.environ.get(key_name)
    if val:
        return val
    env_path = SCRIPTS_DIR.parent / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith(f"{key_name}="):
                return line.split("=", 1)[1].strip()
    return None

API_KEY = _load_env_key("N8N_API_KEY")
if not API_KEY:
    print("ERROR: N8N_API_KEY not found")
    sys.exit(1)

# RunPod API key — read at deploy time, embedded into n8n workflow JSON
# (n8n community edition doesn't support $env in expression fields)
RUNPOD_API_KEY = _load_env_key("RUNPOD_API_KEY")
if not RUNPOD_API_KEY:
    # Fallback: check for the key defined elsewhere or in the main pipeline
    print("WARNING: RUNPOD_API_KEY not found in env — submit workflow auth may fail")
    RUNPOD_API_KEY = ""

HEADERS = {"X-N8N-API-KEY": API_KEY, "Content-Type": "application/json"}


# ─── CPA Pre-Screen Code (v5.0) ────────────────────────────────────

CPA_PRESCREEN_CODE = r"""
/**
 * CPA Pre-Screen v6.0 — Enhanced Compliance Requirements
 *
 * Checks 3 core compliance areas (5 individual checks):
 *   1. DOUBLE CONFIRM: A&B (agent ask + customer confirm) + RWB (mention + ack)
 *   2. DISCLOSURE: Recorded line + DBA company name (expanded + prohibited names)
 *   3. VERBAL CONSENT: Customer consent AFTER transfer mention (proximity + no objection)
 *
 * v6.0 enhancements from v5.0:
 *   - A&B/RWB: Require customer confirmation within 30s of agent mention
 *   - Verbal consent: Proximity check (within 45s) + objection-after-consent detection
 *   - DBA: Expanded approved list + prohibited name-as-company-identity detection
 *   - Short call: Word count guard (< 15 words AND < 60s)
 *   - WhisperX gap tolerance for missed brief responses
 *
 * ALL checks must pass for CPA pass. Any missing = CPA fail.
 * CPA pass → forwarded to full AI pipeline for deeper AF-code analysis.
 */
const transcript = $json.merged_transcript || '';
const audioDuration = $json.audio_duration_s || 0;

// ── Scope to FRONTER portion only (pre-LA / pre-transfer) ──
// CPA Pre-Screen analyzes the front-end agent's call BEFORE the LA joins.
// If LA was detected, cut off at LA timestamp. Otherwise use transfer timestamp.
const rawAgentSegs = $json.agent_segments || [];
const rawCustomerSegs = $json.customer_segments || [];
const laTs = $json.la_timestamp || null;
const transferTs = $json.transfer_timestamp || null;
const cutoffSec = laTs || transferTs || null;

const agentSegments = cutoffSec ? rawAgentSegs.filter(s => s.start < cutoffSec) : rawAgentSegs;
const customerSegments = cutoffSec ? rawCustomerSegs.filter(s => s.start < cutoffSec) : rawCustomerSegs;
const allSegments = [...agentSegments, ...customerSegments].sort((a, b) => a.start - b.start);

// Rebuild scoped text from filtered segments
const agentText = agentSegments.map(s => s.text).join(' ');
const customerText = customerSegments.map(s => s.text).join(' ');

function fmt(seconds) {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function findSeg(segments, regex) {
  return segments.find(s => regex.test(s.text));
}

// Find a segment matching regex AFTER afterSec, within windowSec seconds
function findSegAfter(segments, regex, afterSec, windowSec) {
  return segments.find(s => s.start >= afterSec && s.start <= afterSec + (windowSec || 9999) && regex.test(s.text));
}

// Common affirmative regex used across multiple checks
const affirmRe = /\b(yes|yeah|sure|okay|ok|uh-huh|mm-hmm|yep|alright|mhmm|right|correct|I do|that's right|I have|got it|go ahead|sounds good|that works|absolutely|of course)\b/i;

const findings = [];

// ═══════════════════════════════════════════════════════════════
// CHECK 1: DOUBLE CONFIRM — Medicare A&B + Red/White/Blue Card
// Agent must ASK and customer must CONFIRM within 30s.
// WhisperX tolerance: if agent continues within 3s (no gap), assume brief response was missed.
// ═══════════════════════════════════════════════════════════════

// 1a. Medicare Parts A & B — agent must ASK, customer must CONFIRM within 30s
const abRe = /(?:(?:medicare|parts?)\s+)?a\s*(and|&|\+)\s*(?:parts?\s*)?b/i;
const abAgentSeg = findSeg(agentSegments, abRe);
let abCustomerConfirm = false;
let abTimeSeg = abAgentSeg;

if (abAgentSeg) {
  // Look for customer affirmative within 30s after agent mentions A&B
  const custResp = findSegAfter(customerSegments, affirmRe, abAgentSeg.start, 30);
  if (custResp) {
    abCustomerConfirm = true;
  } else {
    // WhisperX tolerance: if agent continues within 3s (no gap for customer response),
    // customer likely responded but WhisperX dropped it
    const nextAgent = agentSegments.find(s => s.start > abAgentSeg.end);
    if (nextAgent && (nextAgent.start - abAgentSeg.end) < 3 && (nextAgent.start - abAgentSeg.end) > 0.3) {
      abCustomerConfirm = true; // WhisperX gap tolerance
    }
  }
}
// Fallback: customer mentions A&B themselves (they volunteered the info)
if (!abAgentSeg) {
  const abCustSeg = findSeg(customerSegments, abRe);
  if (abCustSeg) { abCustomerConfirm = true; abTimeSeg = abCustSeg; }
}

const abPass = !!abTimeSeg && abCustomerConfirm;
findings.push({
  check: 'double_confirm_ab',
  found: abPass,
  required: true,
  description: abPass
    ? 'Medicare A & B: agent asked, customer confirmed'
    : !abAgentSeg
      ? 'MISSING: Agent did not mention Medicare A & B'
      : 'MISSING: No customer confirmation of Medicare A & B within 30s',
  time_seconds: abTimeSeg ? abTimeSeg.start : null,
  time: abTimeSeg ? fmt(abTimeSeg.start) : null,
});

// 1b. Red/White/Blue card — agent must mention, customer must acknowledge within 30s
const rwbRe = /red\s*,?\s*white\s*,?\s*(and|&)\s*blue/i;
const rwbAgentSeg = findSeg(agentSegments, rwbRe);
let rwbCustomerConfirm = false;
let rwbTimeSeg = rwbAgentSeg;

if (rwbAgentSeg) {
  const custResp = findSegAfter(customerSegments, affirmRe, rwbAgentSeg.start, 30);
  if (custResp) {
    rwbCustomerConfirm = true;
  } else {
    // WhisperX tolerance
    const nextAgent = agentSegments.find(s => s.start > rwbAgentSeg.end);
    if (nextAgent && (nextAgent.start - rwbAgentSeg.end) < 3 && (nextAgent.start - rwbAgentSeg.end) > 0.3) {
      rwbCustomerConfirm = true;
    }
  }
}
// Fallback: customer mentions RWB card themselves
if (!rwbAgentSeg) {
  const rwbCustSeg = findSeg(customerSegments, rwbRe);
  if (rwbCustSeg) { rwbCustomerConfirm = true; rwbTimeSeg = rwbCustSeg; }
}

const rwbPass = !!rwbTimeSeg && rwbCustomerConfirm;
findings.push({
  check: 'double_confirm_rwb',
  found: rwbPass,
  required: true,
  description: rwbPass
    ? 'Red/White/Blue card: agent mentioned, customer confirmed'
    : !rwbAgentSeg
      ? 'MISSING: Agent did not mention Red/White/Blue card'
      : 'MISSING: No customer acknowledgment of Red/White/Blue card within 30s',
  time_seconds: rwbTimeSeg ? rwbTimeSeg.start : null,
  time: rwbTimeSeg ? fmt(rwbTimeSeg.start) : null,
});

const doubleConfirmPass = abPass && rwbPass;

// ═══════════════════════════════════════════════════════════════
// CHECK 2: DISCLOSURE — Recorded Line + DBA Company Name
// Agent must disclose both the recorded line AND their company name.
// ═══════════════════════════════════════════════════════════════

// 2a. Recorded line disclosure
const recRe = /recorded\s*(line|mind|call)/i;
const recHit = recRe.test(agentText);
const recS = findSeg(agentSegments, recRe);
findings.push({
  check: 'disclosure_recorded_line',
  found: recHit,
  required: true,
  description: recHit ? 'Recorded line disclosure found' : 'MISSING: No recorded line disclosure',
  time_seconds: recS ? recS.start : null,
  time: recS ? fmt(recS.start) : null,
});

// 2b. DBA company name — expanded approved list + prohibited name detection
const approvedDbaRe = /\b(america(?:'s|s)?\s*health|benefit\s*link|health\s*benefit\s*guide|select\s*quote|smart\s*match|recorded\s*line\s*(?:aca|insurance|health))\b/i;
const dbaHit = approvedDbaRe.test(agentText);
const dbaS = findSeg(agentSegments, approvedDbaRe);
const dbaMatch = agentText.match(approvedDbaRe);

// Prohibited names used AS company identity (not just mentioned in conversation)
// "I'm calling from Medicare" is a violation; "Do you have Medicare?" is fine
const prohibitedIdentityRe = /(?:(?:calling|call)\s+(?:from|with|on\s+behalf\s+of)|(?:this\s+is|we\s+are|I'?m?\s+(?:with|from))|representing)\s+(?:the\s+)?(?:medicare|medicaid|government|federal\s+government|social\s+security|cms|pitch\s+perfect)/i;
const prohibitedSeg = findSeg(agentSegments, prohibitedIdentityRe);
const usedProhibitedName = !!prohibitedSeg;

findings.push({
  check: 'disclosure_dba_name',
  found: dbaHit && !usedProhibitedName,
  required: true,
  description: usedProhibitedName
    ? 'VIOLATION: Agent used prohibited name as company identity'
    : dbaHit
      ? 'DBA company name disclosed: "' + (dbaMatch ? dbaMatch[0] : '') + '"'
      : 'MISSING: No approved DBA company name disclosed',
  phrase: dbaMatch ? dbaMatch[0] : (usedProhibitedName ? 'prohibited name' : null),
  time_seconds: (dbaS || prohibitedSeg) ? (dbaS || prohibitedSeg).start : null,
  time: (dbaS || prohibitedSeg) ? fmt((dbaS || prohibitedSeg).start) : null,
});

const disclosurePass = recHit && dbaHit;

// ═══════════════════════════════════════════════════════════════
// CHECK 3: VERBAL CONSENT — Customer agrees to transfer to LA
// Consent must be AFTER and NEAR the transfer mention (within 45s).
// Also checks for objection AFTER consent (DNC/withdraw/refuse).
// ═══════════════════════════════════════════════════════════════

// 3a. Find the actual transfer mention SEGMENT (not just text search)
const transferMentionRe = /\b(transfer|connect|specialist|licensed (?:agent|representative)|someone (?:who can|to) help|get you (?:over|connected)|grab (?:my|a|one of)|come on the line|ringing|joining|hand\s*(?:you|this)\s*over)\b/i;
const transferMentionSeg = findSeg(agentSegments, transferMentionRe);
const transferMentioned = !!transferMentionSeg;

// 3b. Customer consent MUST be within 45s AFTER transfer mention
let consentSeg = null;
let verbalConsentPass = false;

if (transferMentionSeg) {
  // Look for explicit consent within 45s AFTER agent's transfer mention
  consentSeg = findSegAfter(customerSegments, affirmRe, transferMentionSeg.start, 45);

  if (consentSeg) {
    // 3c. Check for objection AFTER the consent (customer changed mind)
    const objectionRe = /\b(don't want|do not want|no thank|not interested|hang up|don't call|never mind|cancel|I changed my mind|take me off|remove me|stop calling|I don't want)\b/i;
    const objectionAfter = findSegAfter(customerSegments, objectionRe, consentSeg.start + 1, 120);
    verbalConsentPass = !objectionAfter;
  } else {
    // WhisperX tolerance: agent announces transfer and continues (no gap for response)
    const nextAgentAfterTransfer = agentSegments.find(s => s.start > transferMentionSeg.end);
    if (nextAgentAfterTransfer && (nextAgentAfterTransfer.start - transferMentionSeg.end) < 3 && (nextAgentAfterTransfer.start - transferMentionSeg.end) > 0.3) {
      verbalConsentPass = true;
      consentSeg = transferMentionSeg; // Use transfer timestamp as proxy
    }

    // Implicit consent: agent announces transfer, customer speaks but doesn't object
    if (!verbalConsentPass) {
      const objectionRe = /\b(don't want|do not want|no thank|not interested|hang up|don't call|never mind|cancel|I changed my mind|take me off|remove me|stop calling|I don't want|no no|wait wait)\b/i;
      const anyObjection = findSegAfter(customerSegments, objectionRe, transferMentionSeg.start, 60);
      const anyCustomerResponse = findSegAfter(customerSegments, /\w+/, transferMentionSeg.start, 60);
      if (!anyObjection && anyCustomerResponse) {
        verbalConsentPass = true;
        consentSeg = anyCustomerResponse;
      }
    }
  }
}

findings.push({
  check: 'verbal_consent',
  found: verbalConsentPass,
  required: true,
  description: verbalConsentPass
    ? 'Verbal consent to transfer detected'
    : !transferMentioned
      ? 'MISSING: No transfer language detected from agent'
      : 'MISSING: No customer consent near transfer mention (within 45s)',
  time_seconds: consentSeg ? consentSeg.start : (transferMentionSeg ? transferMentionSeg.start : null),
  time: consentSeg ? fmt(consentSeg.start) : (transferMentionSeg ? fmt(transferMentionSeg.start) : null),
});

// ═══════════════════════════════════════════════════════════════
// SCORING & ROUTING
// ═══════════════════════════════════════════════════════════════

const requiredChecks = findings.filter(f => f.required);
const passedChecks = requiredChecks.filter(f => f.found);
const failedChecks = requiredChecks.filter(f => !f.found);

// All 3 core requirements must pass
const allPass = doubleConfirmPass && disclosurePass && verbalConsentPass;

// Short call check — duration AND word count guard
const totalWords = (agentText + ' ' + customerText).split(/\s+/).filter(w => w).length;
const tooShort = (audioDuration > 0 && audioDuration < 20) || (totalWords < 15 && audioDuration < 60);

if (tooShort) {
  findings.push({
    check: 'short_call',
    found: false,
    required: true,
    description: 'Call too short (' + Math.round(audioDuration) + 's, ' + totalWords + ' words) — likely hangup/wrong number',
    duration_s: Math.round(audioDuration),
    customer_words: totalWords,
  });
}

const cpa_status = (allPass && !tooShort) ? 'pass' : 'fail';
const confidence = Math.round((passedChecks.length / Math.max(requiredChecks.length, 1)) * 100);

return {
  ...$json,
  cpa_status,
  cpa_findings: findings,
  cpa_confidence: confidence,
  cpa_fail_reasons: failedChecks.map(f => f.check + ': ' + f.description),
  cpa_version: '6.0',
  // Scoped (pre-transfer/pre-LA) text for AI Verify to use
  cpa_scoped_agent_text: agentText,
  cpa_scoped_customer_text: customerText,
  cpa_scoped_transcript: allSegments.map(s => s.text).join(' '),
  cpa_cutoff_sec: cutoffSec,
};
""".strip()


# ─── Format Transcript Code ─────────────────────────────────────────

FORMAT_TRANSCRIPT_CODE = r"""
/**
 * Format Merged Transcript (CPA) v3.0
 * Ported from main pipeline Format Merged Transcript v5.16
 *
 * Handles TWO paths:
 *   A) STEREO (split_mode === 'stereo'): Agent/Customer pre-labeled by handler.
 *      Channel assignment is DEFINITIVE — Ch0=Agent, Ch1=Customer. No swap needed.
 *   B) MONO (split_mode === 'mono_diarize_fallback'): SPEAKER_00/01 from diarization.
 *      Auto-swap detection determines which speaker is the agent.
 *
 * Key features:
 *   - Full regex normalization dictionary (30+ WhisperX corrections)
 *   - Exclusive time-window speaker metrics (turn counts, speaking %, WPM, pace)
 *   - Conversation-flow timeline markers (speaker changes, pauses, regular coverage)
 *   - Campaign detection from filename + transcript fallback
 */
const splitMode = $json.split_mode || 'mono';
const channelCount = $json.channel_count || 1;
const isStereo = splitMode === 'stereo' && channelCount >= 2;

// For stereo: pre-labeled segments from Extract Transcription
// For mono: raw diarized segments
const rawAgentSegments = $json.agent_segments || null;
const rawCustomerSegments = $json.customer_segments || null;
const rawSegments = $json.transcription_segments || [];

const language = $json.transcription_language || 'en';
const fileName = $json.file_name || '';
const agentNameFromMeta = $json.agent_name || '';
const audioDuration = $json.audio_duration_s || 0;

// ═══════════════════════════════════════════════════════════════
// NORMALIZATION DICTIONARY (v5.16 — synced with main pipeline)
// ═══════════════════════════════════════════════════════════════
const whisperXCorrections = [
  { pattern: /\brecord(?:ed|ing)\s+mind\b/gi, replacement: 'recorded line', tag: 'accent' },
  { pattern: /\bunrecorded\s+line\b/gi, replacement: 'on a recorded line', tag: 'accent' },
  { pattern: /\bon\s+recorded\s+line\b/gi, replacement: 'on a recorded line', tag: 'accent' },
  { pattern: /\bhonorary\s+court\s+alliance\b/gi, replacement: 'on a recorded line, ACA', tag: 'accent' },
  { pattern: /\bon\s+a\s+recording\s+line\b/gi, replacement: 'on a recorded line', tag: 'accent' },
  { pattern: /\bMedicaid\s+(Parts?\s+[AB])/gi, replacement: 'Medicare $1', tag: 'impossible_phrase' },
  { pattern: /\bAmerican\s+Health\b/g, replacement: "America's Health", tag: 'dba_variant' },
  { pattern: /\bAmericas\s+Health\b/g, replacement: "America's Health", tag: 'dba_variant' },
  { pattern: /\bAmerica\s+Health\b/g, replacement: "America's Health", tag: 'dba_variant' },
  { pattern: /\bbenefit\s+ling\b/gi, replacement: 'Benefit Link', tag: 'dba_variant' },
  { pattern: /\bwith\s+Courtline\b/gi, replacement: 'on a recorded line', tag: 'accent' },
  { pattern: /\bcourt\s+alliance\b/gi, replacement: 'on a recorded line', tag: 'accent' },
  { pattern: /\b(?:in\s+the\s+|the\s+)?cord\s+line\b/gi, replacement: 'on a recorded line', tag: 'accent' },
  { pattern: /\bRecord\s+Align\b/gi, replacement: 'on a recorded line', tag: 'accent' },
  { pattern: /\bAccord\s+line\b/gi, replacement: 'on a recorded line', tag: 'accent' },
  { pattern: /\bthe\s+Coraline\b/gi, replacement: 'on a recorded line', tag: 'accent' },
  { pattern: /\ba\s+done\s+recorded\s+line\b/gi, replacement: 'on a recorded line', tag: 'accent' },
  { pattern: /\bRecorder\s+Line\b/gi, replacement: 'recorded line', tag: 'accent' },
  { pattern: /\bon\s+a\s+record\s+line\b/gi, replacement: 'on a recorded line', tag: 'accent' },
  { pattern: /\bParts?\s+C\s+and\s+B\b/gi, replacement: 'Part A and B', tag: 'impossible_phrase' },
  { pattern: /\bParts?\s+A\s+and\s+D\b/gi, replacement: 'Part A and B', tag: 'impossible_phrase' },
  { pattern: /\bAmerica'?s?\s+Alta\b/gi, replacement: "America's Health", tag: 'dba_variant' },
  { pattern: /\bRecorder\s+Alliance\b/gi, replacement: 'recorded line', tag: 'accent' },
  { pattern: /\bAccorded\s+Line\b/gi, replacement: 'on a recorded line', tag: 'accent' },
  { pattern: /\breport\s+line\b/gi, replacement: 'recorded line', tag: 'accent' },
  { pattern: /\ba\s+reporter\b/gi, replacement: 'on a recorded line', tag: 'accent' },
  { pattern: /\bPitch\s+Perfection\b/gi, replacement: 'Pitch Perfect', tag: 'dba_variant' },
  { pattern: /\bPage\s+Perfect\b/gi, replacement: 'Pitch Perfect', tag: 'dba_variant' },
  { pattern: /\bPeach\s+Perfect\b/gi, replacement: 'Pitch Perfect', tag: 'dba_variant' },
  { pattern: /\bPick\s+Perfect\b/gi, replacement: 'Pitch Perfect', tag: 'dba_variant' },
  { pattern: /\bself[- ]deported\b/gi, replacement: 'self-reported', tag: 'accent' },
];

function normalizeText(text) {
  let corrected = text;
  const applied = [];
  for (const { pattern, replacement, tag } of whisperXCorrections) {
    const before = corrected;
    corrected = corrected.replace(pattern, replacement);
    if (corrected !== before) applied.push({ pattern: pattern.source, replacement, tag });
  }
  return { text: corrected, corrections: applied };
}

// ═══════════════════════════════════════════════════════════════
// NORMALIZE + ASSIGN SPEAKERS
// Path A (stereo): segments already labeled Agent/Customer
// Path B (mono): segments have SPEAKER_00/01, need auto-swap
// ═══════════════════════════════════════════════════════════════
let totalCorrections = [];
let agentSegments = [];
let customerSegments = [];
let swapped = false;
let swapScores = { speaker_00: 0, speaker_01: 0 };

function normalizeSegmentList(segs, speakerLabel) {
  const out = [];
  for (const seg of (segs || [])) {
    const raw = (seg.text || '').trim();
    if (!raw) continue;
    const result = normalizeText(raw);
    if (result.corrections.length > 0) {
      totalCorrections.push(...result.corrections.map(c => ({ ...c, speaker: speakerLabel, time: seg.start })));
    }
    out.push({
      start: seg.start || 0,
      end: seg.end || 0,
      text: result.text,
      speaker: speakerLabel,
      words: seg.words || [],
    });
  }
  return out;
}

if (isStereo && rawAgentSegments && rawCustomerSegments) {
  // ─── PATH A: STEREO — with auto-swap detection ────────────
  // Ch0 is USUALLY Agent, Ch1 USUALLY Customer, but some recordings
  // have channels swapped. Detect by scoring agent-intro patterns.
  let ch0Segs = normalizeSegmentList(rawAgentSegments, 'Agent');
  let ch1Segs = normalizeSegmentList(rawCustomerSegments, 'Customer');

  // Score both channels for agent-likelihood (first 60s)
  const swapPatterns = [
    /\b(?:america'?s?\s+health|benefit\s+link|health\s+benefit\s+guide)\b/i,
    /\b(?:calling|call(?:ing)?\s+(?:from|on\s+behalf|about|regarding))\b/i,
    /\b(?:recorded\s+line|on\s+a\s+recorded)\b/i,
    /\b(?:my\s+name\s+is|this\s+is)\s+\w+/i,
    /\b(?:pitch\s+perfect|medicare|aca|marketplace)\b/i,
    /\b(?:how\s+are\s+you\s+(?:doing|today))\b/i,
  ];
  const nameLower = agentNameFromMeta.toLowerCase();
  const nameParts = nameLower.split(/\s+/).filter(p => p.length >= 3);

  function scoreCh(segs) {
    const first60 = segs.filter(s => s.start < 60).map(s => s.text).join(' ');
    let sc = 0;
    for (const pat of swapPatterns) { if (pat.test(first60)) sc += 2; }
    const lower = first60.toLowerCase();
    for (const part of nameParts) { if (lower.includes(part)) sc += 3; }
    return sc;
  }

  const ch0Score = scoreCh(ch0Segs);
  const ch1Score = scoreCh(ch1Segs);
  swapScores = { ch0: ch0Score, ch1: ch1Score };

  if (ch1Score > ch0Score && ch1Score >= 2) {
    // Channels are swapped — Ch1 is actually the agent
    agentSegments = ch1Segs.map(s => ({ ...s, speaker: 'Agent' }));
    customerSegments = ch0Segs.map(s => ({ ...s, speaker: 'Customer' }));
    swapped = true;
    console.log('STEREO SWAP DETECTED: Ch1 has agent patterns (score ' + ch1Score + ' vs Ch0 ' + ch0Score + '). Swapping.');
  } else {
    agentSegments = ch0Segs;
    customerSegments = ch1Segs;
    console.log('STEREO MODE: channels correct (Ch0=' + ch0Score + ' vs Ch1=' + ch1Score + ')');
  }

} else {
  // ─── PATH B: MONO — diarization with auto-swap detection ──
  const normalizedSegments = [];
  for (const seg of rawSegments) {
    const raw = (seg.text || '').trim();
    if (!raw) continue;
    const result = normalizeText(raw);
    if (result.corrections.length > 0) {
      totalCorrections.push(...result.corrections.map(c => ({ ...c, speaker: seg.speaker, time: seg.start })));
    }
    normalizedSegments.push({
      start: seg.start || 0,
      end: seg.end || 0,
      text: result.text,
      speaker: seg.speaker || 'SPEAKER_00',
      words: seg.words || [],
    });
  }

  // Auto-swap detection
  const agentIntroPatterns = [
    /\b(?:america'?s?\s+health|benefit\s+link|health\s+benefit\s+guide)\b/i,
    /\b(?:calling|call(?:ing)?\s+(?:from|on\s+behalf|about|regarding))\b/i,
    /\b(?:recorded\s+line|on\s+a\s+recorded)\b/i,
    /\b(?:my\s+name\s+is|this\s+is)\s+\w+/i,
    /\b(?:pitch\s+perfect|medicare|aca|marketplace)\b/i,
    /\b(?:how\s+are\s+you\s+(?:doing|today))\b/i,
  ];

  const agentNameLower = agentNameFromMeta.toLowerCase();
  const agentNameParts = agentNameLower.split(/\s+/).filter(p => p.length >= 3);

  function scoreAgentLikelihood(speakerSegments) {
    const first60 = speakerSegments.filter(s => s.start < 60).map(s => s.text).join(' ');
    let score = 0;
    for (const pat of agentIntroPatterns) {
      if (pat.test(first60)) score += 2;
    }
    if (agentNameParts.length > 0) {
      const lower = first60.toLowerCase();
      for (const part of agentNameParts) {
        if (lower.includes(part)) score += 3;
      }
    }
    return score;
  }

  const spk0Segs = normalizedSegments.filter(s => s.speaker === 'SPEAKER_00');
  const spk1Segs = normalizedSegments.filter(s => s.speaker === 'SPEAKER_01');

  const score0 = scoreAgentLikelihood(spk0Segs);
  const score1 = scoreAgentLikelihood(spk1Segs);
  swapScores = { speaker_00: score0, speaker_01: score1 };

  let agentSpeakerLabel = 'SPEAKER_00';
  let customerSpeakerLabel = 'SPEAKER_01';

  if (score1 > score0 && score1 >= 2) {
    agentSpeakerLabel = 'SPEAKER_01';
    customerSpeakerLabel = 'SPEAKER_00';
    swapped = true;
    console.log('SWAP DETECTED: SPEAKER_01 has agent intro patterns (score ' + score1 + ' vs ' + score0 + '). Swapping roles.');
  }

  for (const seg of normalizedSegments) {
    const role = seg.speaker === agentSpeakerLabel ? 'Agent' : 'Customer';
    const entry = { start: seg.start, end: seg.end, text: seg.text, speaker: role, words: seg.words };
    if (role === 'Agent') agentSegments.push(entry);
    else customerSegments.push(entry);
  }
  console.log('MONO MODE: ' + agentSegments.length + ' agent segs, ' + customerSegments.length + ' customer segs (swapped=' + swapped + ')');
}

// ═══════════════════════════════════════════════════════════════
// LA (LICENSED AGENT) DETECTION — ported from main pipeline v3.26
// Detects transfer initiation → LA joining → relabels segments
// ═══════════════════════════════════════════════════════════════
const transferInitiationPatterns = [
  /hear(?:ing)?\s+(?:a\s+)?(?:some\s+|a\s+slight\s+|a\s+little\s+)?ring(?:ing)?/i,
  /stay\s+(?:on|with)\s+(?:the|me)/i,
  /transfer(?:ring)?\s+(?:you|the\s+call)/i,
  /connect(?:ing)?\s+(?:you|us)\s+(?:to|with|over)/i,
  /(?:specialist|agent|coordinator|colleague|someone)\s+(?:is\s+going\s+to|will|going\s+to)\s+(?:come|join|be)\s+(?:on|with)/i,
  /(?:put|get)\s+(?:you|us)\s+(?:through|over|connected|transferred)/i,
  /grab\s+(?:that\s+)?(?:coordinator|someone|one\s+of\s+my)/i,
  /(?:agent|specialist|coordinator)\s+(?:on|to)\s+the\s+line/i,
  /(?:someone|she|he)\s+(?:will\s+be|is\s+going\s+to|gonna)\s+(?:join|come|be\s+with)/i,
  /leave\s+(?:him|her|them)\s+for\s+the\s+transfer/i,
  /warm\s+transfer/i,
  /(?:I'?(?:m|ll)|gonna|going\s+to)\s+(?:transfer|connect|get\s+(?:you|a))/i,
  /connecting\s+(?:us|you)\s+(?:over|with|to)/i,
  /(?:coordinator|specialist|someone)\s+(?:on|coming\s+on)\s+the\s+line/i,
  /see\s+with\s+my\s+(?:specialist|agent)/i,
  /talk\s+to\s+my\s+(?:specialist|agent)/i,
  /(?:specialist|agent)\s+will\s+(?:help|come|review|assist)/i,
  /(?:someone)\s+coming\s+on\s+the\s+line/i,
];

const laIntroductionPatterns = [
  /licensed\s+\w+\s+(?:insurance\s+)?agent/i,
  /(?:hi|hello|hey)[\s,]+(?:this\s+is|my\s+name\s+is|I'?m)\s+\w+/i,
  /who\s+do\s+I\s+have\s+the\s+pleasure/i,
  /do\s+you\s+mind\s+(?:if\s+I\s+)?assist/i,
  /I'?ll\s+(?:let\s+you\s+take|be)\s+(?:the|your)\s+(?:call|license)/i,
  /senior\s+managing?\s+agent/i,
  /purpose\s+(?:for|of)\s+this\s+call/i,
  /I\s+just\s+have\s+\w+\s+with\s+me/i,
  /nice\s+to\s+meet\s+you/i,
  /(?:benefit|benefits)\s+(?:review|enrollment|specialist)/i,
  /(?:I'?m|my\s+name\s+is)\s+(?:the\s+)?licensed/i,
  /let\s+me\s+(?:introduce|go\s+ahead)/i,
  /taking\s+(?:over|it)\s+from\s+here/i,
];

let transferDetected = false;
let transferTimestamp = null;
let laDetected = false;
let laTimestamp = null;
let laSegments = [];

// Only search agent segments (agent channel in stereo, agent-labeled in mono)
const agentTextFirst = agentSegments.filter(s => s.start >= 20).map(s => s.text).join(' ');
const agentNameLowerLA = agentNameFromMeta.toLowerCase().trim();
const agentNamePartsLA = agentNameLowerLA.split(/\s+/).filter(p => p.length >= 3);

// 1. Detect transfer initiation — scan agent segments after 20s
for (const seg of agentSegments) {
  if (seg.start < 20) continue; // v3.26: 20s minimum threshold
  if (transferDetected) break;
  for (const pat of transferInitiationPatterns) {
    if (pat.test(seg.text)) {
      transferDetected = true;
      transferTimestamp = seg.start;
      break;
    }
  }
}

// 2. Detect LA introduction — scan agent segments AFTER transfer
if (transferDetected) {
  const postTransferSegs = agentSegments.filter(s => s.start >= transferTimestamp);
  for (const seg of postTransferSegs) {
    // Skip segments that are clearly the original agent's own name
    const segLower = seg.text.toLowerCase();
    const isOwnName = agentNamePartsLA.some(part => {
      const nameIntroMatch = segLower.match(/(?:this\s+is|my\s+name\s+is|I'?m)\s+(\w+)/i);
      return nameIntroMatch && nameIntroMatch[1].toLowerCase() === part;
    });
    if (isOwnName) continue;

    for (const pat of laIntroductionPatterns) {
      if (pat.test(seg.text)) {
        laDetected = true;
        laTimestamp = seg.start;
        break;
      }
    }
    if (laDetected) break;
  }

  // Name-change fallback: if 2+ different names self-identify in agent channel,
  // the second name = LA. Exclude the known agent's name.
  if (!laDetected) {
    const introPattern = /(?:this\s+is|my\s+name\s+is|I'?m)\s+(\w+)/gi;
    const foundNames = [];
    for (const seg of agentSegments) {
      let m;
      while ((m = introPattern.exec(seg.text)) !== null) {
        const name = m[1].toLowerCase();
        const isAgent = agentNamePartsLA.includes(name);
        if (!isAgent && !foundNames.includes(name)) {
          foundNames.push(name);
          if (foundNames.length >= 1 && seg.start > transferTimestamp) {
            laDetected = true;
            laTimestamp = seg.start;
          }
        }
      }
      if (laDetected) break;
    }
  }

  // If transfer detected but no LA intro found, use transfer as LA start fallback
  if (!laDetected && transferDetected) {
    // Just mark transfer — don't assume LA joined without evidence
    laTimestamp = null;
  }
}

// 3. Relabel post-LA agent segments as "Licensed Agent"
if (laDetected && laTimestamp != null) {
  for (let i = 0; i < agentSegments.length; i++) {
    if (agentSegments[i].start >= laTimestamp) {
      agentSegments[i].speaker = 'Licensed Agent';
      laSegments.push(agentSegments[i]);
    }
  }
  console.log('LA DETECTION: transfer at ' + Math.floor(transferTimestamp) + 's, LA joined at ' + Math.floor(laTimestamp) + 's, ' + laSegments.length + ' segments relabeled');
} else if (transferDetected) {
  console.log('LA DETECTION: transfer at ' + Math.floor(transferTimestamp) + 's, LA intro not confirmed');
} else {
  console.log('LA DETECTION: no transfer detected');
}

// ═══════════════════════════════════════════════════════════════
// CPA 5-MINUTE TRIM — Only analyze the first 5 minutes
// CPA pre-screen only needs the intro/consent portion of the call.
// Longer recordings just add noise and cost without compliance value.
// ═══════════════════════════════════════════════════════════════
const CPA_MAX_SECONDS = 300; // 5 minutes — standard CPA trim limit
agentSegments = agentSegments.filter(s => s.end <= CPA_MAX_SECONDS);
customerSegments = customerSegments.filter(s => s.end <= CPA_MAX_SECONDS);
const trimmed = (audioDuration > CPA_MAX_SECONDS);

// ═══════════════════════════════════════════════════════════════
// BUILD MERGED TRANSCRIPT
// ═══════════════════════════════════════════════════════════════
const allSegments = [...agentSegments, ...customerSegments].sort((a, b) => a.start - b.start);

const formattedTranscript = allSegments.map(seg => {
  const ts = Math.floor(seg.start);
  const mins = Math.floor(ts / 60);
  const secs = ts % 60;
  return `[${mins}:${String(secs).padStart(2, '0')}] ${seg.speaker}: ${seg.text}`;
}).join('\n');

// Separate agent text: pre-transfer only (for compliance eval purposes)
const preTransferAgentSegs = transferDetected && laTimestamp
  ? agentSegments.filter(s => s.start < laTimestamp && s.speaker === 'Agent')
  : agentSegments.filter(s => s.speaker === 'Agent');
const agentText = preTransferAgentSegs.map(s => s.text).join(' ');
const customerText = customerSegments.map(s => s.text).join(' ');
const laText = laSegments.map(s => s.text).join(' ');

// ═══════════════════════════════════════════════════════════════
// EXCLUSIVE TIME-WINDOW SPEAKER METRICS
// Each second assigned to one speaker only (agent wins ties)
// ═══════════════════════════════════════════════════════════════
const maxEnd = allSegments.reduce((max, s) => Math.max(max, s.end || 0), 0);
const callDuration = Math.max(maxEnd, audioDuration);
const totalSeconds = Math.ceil(callDuration);
const timeline = new Array(Math.max(totalSeconds, 1)).fill(null);

agentSegments.forEach(seg => {
  for (let i = Math.floor(seg.start); i < Math.ceil(seg.end) && i < totalSeconds; i++) {
    timeline[i] = 'agent';
  }
});
customerSegments.forEach(seg => {
  for (let i = Math.floor(seg.start); i < Math.ceil(seg.end) && i < totalSeconds; i++) {
    if (timeline[i] !== 'agent') timeline[i] = 'customer';
  }
});

let agentSeconds = 0, customerSeconds = 0, silenceSeconds = 0;
timeline.forEach(s => { if (s === 'agent') agentSeconds++; else if (s === 'customer') customerSeconds++; else silenceSeconds++; });
const totalSpeaking = agentSeconds + customerSeconds;
const agentPct = totalSpeaking > 0 ? Math.round((agentSeconds / totalSpeaking) * 100) : 0;
const customerPct = totalSpeaking > 0 ? 100 - agentPct : 0;
const talkRatio = customerSeconds > 0 ? (agentSeconds / customerSeconds).toFixed(2) : 'N/A';
const dominantSpeaker = agentPct > 60 ? 'agent' : customerPct > 60 ? 'customer' : 'balanced';

// Pre-transfer speaking seconds (critical for accurate WPM when transfer detected)
// After transfer, agent channel = prospect, customer channel = LA — not our agent's speech
let preTransferAgentSecs = agentSeconds;
let preTransferCustomerSecs = customerSeconds;
if (transferDetected && laTimestamp) {
  preTransferAgentSecs = 0;
  preTransferCustomerSecs = 0;
  const cutoff = Math.min(Math.floor(laTimestamp), totalSeconds);
  for (let i = 0; i < cutoff; i++) {
    if (timeline[i] === 'agent') preTransferAgentSecs++;
    else if (timeline[i] === 'customer') preTransferCustomerSecs++;
  }
  preTransferAgentSecs = Math.max(1, preTransferAgentSecs);
}
const preTransferTotalSpeaking = preTransferAgentSecs + preTransferCustomerSecs;
const preTransferAgentPct = preTransferTotalSpeaking > 0 ? Math.round((preTransferAgentSecs / preTransferTotalSpeaking) * 100) : 0;
const preTransferCustomerPct = preTransferTotalSpeaking > 0 ? 100 - preTransferAgentPct : 0;

// WPM computation — use pre-transfer speaking seconds since agentText is pre-transfer only
const agentWords = agentText.split(/\s+/).filter(w => w).length;
const customerWords = customerText.split(/\s+/).filter(w => w).length;
const laWords = laText ? laText.split(/\s+/).filter(w => w).length : 0;
const agentWpm = preTransferAgentSecs > 0 ? Math.round((agentWords / preTransferAgentSecs) * 60) : 0;
const customerWpm = preTransferCustomerSecs > 0 ? Math.round((customerWords / preTransferCustomerSecs) * 60) : 0;
const overallWpm = preTransferTotalSpeaking > 0 ? Math.round(((agentWords + customerWords) / preTransferTotalSpeaking) * 60) : 0;
const getPace = (wpm) => wpm > 180 ? 'rushed' : wpm > 160 ? 'fast' : wpm < 100 ? 'slow' : 'appropriate';

// Pre-transfer WPM is now identical to agentWpm (both use pre-transfer data)
const preTransferWpm = agentWpm;

// ═══════════════════════════════════════════════════════════════
// BESPOKE TONE / LANGUAGE ANALYSIS (regex-based, no AI needed)
// ═══════════════════════════════════════════════════════════════
// Use pre-transfer agent text for tone scan (post-transfer is prospect/LA, not our agent)
const fullAgentText = transferDetected && laTimestamp
  ? agentSegments.filter(s => s.start < laTimestamp).map(s => s.text).join(' ')
  : agentSegments.map(s => s.text).join(' ');
const combinedText = (fullAgentText + ' ' + customerText).toLowerCase();

// Tone keyword detection — scan for indicators
const toneIndicators = {
  professional: [/\b(?:sir|ma'?am|mister|miss|mrs)\b/gi, /\bthank\s+you\b/gi, /\bplease\b/gi, /\byou'?re\s+welcome\b/gi],
  empathetic: [/\bunderstand\b/gi, /\bsorry\b/gi, /\bappreciate\b/gi, /\bconcern/gi, /\bworr(?:y|ied)\b/gi, /\bhear\s+you\b/gi],
  confident: [/\babsolutely\b/gi, /\bdefinitely\b/gi, /\bcertainly\b/gi, /\bof\s+course\b/gi, /\bexactly\b/gi],
  friendly: [/\bhow\s+are\s+you\b/gi, /\bhave\s+a\s+(?:good|great|wonderful)\b/gi, /\bnice\s+(?:to|talking|speaking)\b/gi, /\btake\s+care\b/gi],
  rushed: [/\bquickly\b/gi, /\breal\s+quick\b/gi, /\bjust\s+(?:a\s+)?(?:sec|second|moment|minute)\b/gi],
  unclear: [/\bum+\b/gi, /\buh+\b/gi, /\blike\b/gi],
};

const toneScores = {};
const toneKeywords = [];
for (const [trait, patterns] of Object.entries(toneIndicators)) {
  let count = 0;
  for (const pat of patterns) {
    const matches = fullAgentText.match(pat);
    if (matches) count += matches.length;
  }
  toneScores[trait] = count;
  if (count >= 2 && trait !== 'unclear' && trait !== 'rushed') toneKeywords.push(trait);
}

// Add pace-derived keyword
if (agentWpm >= 100 && agentWpm <= 160) toneKeywords.push('measured');
else if (agentWpm > 160) toneKeywords.push('fast-paced');
if (toneScores.rushed >= 2 || agentWpm > 180) toneKeywords.push('hurried');
if (toneScores.unclear >= 5) toneKeywords.push('hesitant');
if (toneKeywords.length === 0) toneKeywords.push('neutral');

// Ensure 3-5 keywords
while (toneKeywords.length < 3) {
  const fallbacks = ['direct', 'conversational', 'steady', 'clear', 'engaged'];
  for (const fb of fallbacks) {
    if (!toneKeywords.includes(fb)) { toneKeywords.push(fb); break; }
  }
}

// Build bespoke language summary from metrics
const fillerCount = (toneScores.unclear || 0);
const politenessCount = (toneScores.professional || 0);
const empathyCount = (toneScores.empathetic || 0);
const summaryParts = [];
summaryParts.push('Agent spoke at ' + agentWpm + ' WPM (' + getPace(agentWpm) + ' pace)');
if (politenessCount >= 3) summaryParts.push('with frequent courtesy markers');
else if (politenessCount >= 1) summaryParts.push('with some courtesy markers');
if (empathyCount >= 2) summaryParts.push('showing empathy');
if (fillerCount >= 5) summaryParts.push('with notable filler usage');
if (transferDetected) summaryParts.push('Transfer initiated at ' + Math.floor(transferTimestamp) + 's');
const languageSummary = summaryParts.join(', ') + '.';

// ═══════════════════════════════════════════════════════════════
// TIMELINE MARKERS (conversation flow)
// ═══════════════════════════════════════════════════════════════
const timelineMarkers = [];
let lastSpeaker = null;
allSegments.forEach((seg, idx) => {
  const startSec = Math.floor(seg.start);
  const mins = Math.floor(startSec / 60);
  const secs = startSec % 60;
  const timeFmt = mins + ':' + String(secs).padStart(2, '0');
  const isSpeakerChange = lastSpeaker !== null && lastSpeaker !== seg.speaker;
  const prevEnd = idx > 0 ? (allSegments[idx - 1].end || 0) : 0;
  const gap = seg.start - prevEnd;
  const hasPause = gap > 2;
  const textPreview = (seg.text || '').substring(0, 50) + ((seg.text || '').length > 50 ? '...' : '');

  if (idx === 0 || isSpeakerChange || idx % 5 === 0 || hasPause) {
    timelineMarkers.push({
      time_seconds: startSec,
      time_formatted: timeFmt,
      time: timeFmt,
      speaker: seg.speaker.toLowerCase(),
      is_speaker_change: isSpeakerChange,
      has_pause_before: hasPause,
      pause_duration: hasPause ? Math.round(gap) : 0,
      text_preview: textPreview,
      segment_index: idx,
      event: (isSpeakerChange ? seg.speaker + ' starts speaking' : textPreview),
      title: seg.speaker,
      type: seg.speaker === 'Agent' ? 'agent' : 'customer',
    });
  }
  lastSpeaker = seg.speaker;
});

// Transfer / LA markers
if (transferDetected && transferTimestamp != null) {
  const tSec = Math.floor(transferTimestamp);
  const tMin = Math.floor(tSec / 60);
  const tS = tSec % 60;
  const tFmt = tMin + ':' + String(tS).padStart(2, '0');
  timelineMarkers.push({
    time_seconds: tSec, time_formatted: tFmt, time: tFmt,
    speaker: 'agent', is_speaker_change: false, has_pause_before: false,
    pause_duration: 0, text_preview: 'Transfer initiated',
    event: 'Transfer initiated', title: 'Transfer', type: 'transfer',
    is_transfer_marker: true,
  });
}
if (laDetected && laTimestamp != null) {
  const lSec = Math.floor(laTimestamp);
  const lMin = Math.floor(lSec / 60);
  const lS = lSec % 60;
  const lFmt = lMin + ':' + String(lS).padStart(2, '0');
  timelineMarkers.push({
    time_seconds: lSec, time_formatted: lFmt, time: lFmt,
    speaker: 'licensed_agent', is_speaker_change: true, has_pause_before: false,
    pause_duration: 0, text_preview: 'Licensed Agent joined',
    event: 'Licensed Agent joined the call', title: 'Licensed Agent', type: 'la_joined',
    is_la_marker: true,
  });
}

// End-of-call marker
if (allSegments.length > 0) {
  const lastSeg = allSegments[allSegments.length - 1];
  const endSec = Math.ceil(lastSeg.end || lastSeg.start || 0);
  const lastMarkerTime = timelineMarkers.length > 0 ? timelineMarkers[timelineMarkers.length - 1].time_seconds : -1;
  if (endSec - lastMarkerTime > 10) {
    const m = Math.floor(endSec / 60);
    const s = endSec % 60;
    timelineMarkers.push({
      time_seconds: endSec, time_formatted: m + ':' + String(s).padStart(2, '0'),
      time: m + ':' + String(s).padStart(2, '0'),
      speaker: 'end', is_speaker_change: false, has_pause_before: false,
      pause_duration: 0, text_preview: '[End of call]', segment_index: allSegments.length,
      event: 'End of call', title: 'End', type: 'end',
    });
  }
}

// Sort all timeline markers by time
timelineMarkers.sort((a, b) => (a.time_seconds || 0) - (b.time_seconds || 0));

// ═══════════════════════════════════════════════════════════════
// CAMPAIGN DETECTION FROM FILENAME
// ═══════════════════════════════════════════════════════════════
function detectProductType(fn) {
  const upper = (fn || '').toUpperCase();
  if (upper.includes('JADE') || upper.includes('ACA')) return 'ACA';
  if (upper.includes('WHATIF') || upper.includes('WHAT IF')) return 'WHATIF';
  if (upper.includes('MEDICARE') || upper.includes('ARAGON') || upper.includes('ELITE') || upper.includes('FYM') || upper.includes('PITCH') || upper.includes('HOSPITAL') || upper.includes('BRANDON')) return 'MEDICARE';
  return 'UNKNOWN';
}

function detectFromTranscript(text) {
  const lower = (text || '').toLowerCase();
  let scores = { ACA: 0, MEDICARE: 0, WHATIF: 0 };
  const acaP = [/\baca\b/i, /affordable\s+care/i, /marketplace/i, /healthcare\.gov/i, /obama\s*care/i];
  const medP = [/medicare\s+part\s+[ab]/i, /part\s+a\s+and\s+(?:part\s+)?b/i, /red\s+white\s+(?:and\s+)?blue\s+card/i, /\brwb\b/i, /part\s+b\s+give\s*back/i];
  const wifP = [/select\s+quote/i, /smart\s*match/i, /what\s*if/i];
  for (const p of acaP) if (p.test(lower)) scores.ACA += 3;
  for (const p of medP) if (p.test(lower)) scores.MEDICARE += 3;
  for (const p of wifP) if (p.test(lower)) scores.WHATIF += 5;
  if (scores.WHATIF > 0) scores.WHATIF += scores.MEDICARE;
  const max = Math.max(scores.ACA, scores.MEDICARE, scores.WHATIF);
  if (max === 0) return 'UNKNOWN';
  if (scores.WHATIF >= scores.MEDICARE && scores.WHATIF >= scores.ACA) return 'WHATIF';
  if (scores.MEDICARE > scores.ACA) return 'MEDICARE';
  return 'ACA';
}

let productType = detectProductType(fileName);
let productTypeSource = 'filename';
if (productType === 'UNKNOWN') {
  productType = detectFromTranscript(agentText);
  productTypeSource = productType !== 'UNKNOWN' ? 'transcript' : 'fallback';
  // Keep UNKNOWN — do NOT default to ACA. Campaign must come from filename metadata.
}

const fnParts = (fileName || '').replace(/\.[^/.]+$/, '').split('_');
const campaignName = (fnParts[1] || '').trim() || productType;

return {
  ...$json,
  merged_transcript: formattedTranscript,
  agent_text: agentText,
  customer_text: customerText,
  agent_segments: agentSegments,
  customer_segments: customerSegments,
  all_segments: allSegments,
  segment_count: allSegments.length,
  agent_word_count: agentWords,
  customer_word_count: customerWords,

  // Speaker metrics
  agent_turn_count: agentSegments.length,
  customer_turn_count: customerSegments.length,
  agent_speaking_time: agentSeconds,
  customer_speaking_time: customerSeconds,
  total_talk_time: totalSpeaking,
  silence_time: silenceSeconds,
  agent_speaking_pct: agentPct,
  customer_speaking_pct: customerPct,
  talk_ratio: talkRatio,
  dominant_speaker: dominantSpeaker,
  call_duration_seconds: totalSeconds,

  // WPM / pace
  agent_wpm: agentWpm,
  customer_wpm: customerWpm,
  overall_wpm: overallWpm,
  agent_pace: getPace(agentWpm),
  customer_pace: getPace(customerWpm),

  // Timeline markers
  timeline_markers: timelineMarkers,

  // Campaign detection
  product_type: productType,
  product_type_source: productTypeSource,
  campaign_type: campaignName,

  // LA detection
  transfer_detected: transferDetected,
  transfer_timestamp: transferTimestamp,
  la_detected: laDetected,
  la_timestamp: laTimestamp,
  la_segment_count: laSegments.length,
  la_text: laText || null,
  pre_transfer_agent_text: agentText,
  pre_transfer_wpm: preTransferWpm,
  pre_transfer_agent_seconds: preTransferAgentSecs,
  pre_transfer_customer_seconds: preTransferCustomerSecs,
  pre_transfer_agent_pct: preTransferAgentPct,
  pre_transfer_customer_pct: preTransferCustomerPct,

  // Bespoke tone / language analysis
  tone_keywords: toneKeywords.slice(0, 5),
  tone_scores: toneScores,
  language_summary: languageSummary,
  filler_count: toneScores.unclear || 0,
  politeness_count: toneScores.professional || 0,
  empathy_count: toneScores.empathetic || 0,

  // Channel / swap metadata
  channel_count: channelCount,
  split_mode: splitMode,
  speaker_swap_detected: swapped,
  speaker_swap_scores: swapScores,

  // Normalization metadata
  transcript_corrections: totalCorrections.length > 0 ? totalCorrections : null,
  transcript_normalized: totalCorrections.length > 0,

  // CPA trim metadata
  trimmed: trimmed,
  trim_limit_seconds: CPA_MAX_SECONDS,
};
""".strip()


# ─── Check Duplicates Code ──────────────────────────────────────────

CHECK_DUPLICATES_CODE = r"""
/**
 * Check for Duplicates — query Supabase for existing agent+phone+date+time
 * n8n webhook v2 nests POST body in $json.body — normalize to top level
 */
const input = $json.body || $json;

const fileName = input.file_name || '';
let agentName = input.agent_name || '';

// Parse metadata from filename if not provided
let phoneNumber = input.phone_number || '';
let callDate = input.call_date || '';
let callTime = input.call_time || '';

// Chase pattern: CampaignID_CampaignName_AgentName_Phone_M_D_YYYY-HH_MM_SS.wav
// e.g. 225262_Elite FYM Medicare_Abda Salah_2709995127_3_9_2026-11_52_30.wav
const chaseFullMatch = fileName.match(/^\d+_([^_]+(?:\s+[^_]+)*)_([A-Za-z][A-Za-z\s'-]+?)_(\d{10,11})_(\d{1,2})_(\d{1,2})_(\d{4})-(\d{2})_(\d{2})_(\d{2})/);
if (chaseFullMatch) {
  agentName = agentName || chaseFullMatch[2].trim();
  phoneNumber = phoneNumber || chaseFullMatch[3];
  const month = chaseFullMatch[4].padStart(2, '0');
  const day = chaseFullMatch[5].padStart(2, '0');
  callDate = callDate || `${chaseFullMatch[6]}-${month}-${day}`;
  callTime = callTime || `${chaseFullMatch[7]}:${chaseFullMatch[8]}:${chaseFullMatch[9]}`;
} else if (!phoneNumber || !callDate) {
  // Fallback: just extract phone/date/time
  const chaseMatch = fileName.match(/(\d{10,11})_(\d{1,2})_(\d{1,2})_(\d{4})-(\d{2})_(\d{2})_(\d{2})/);
  if (chaseMatch) {
    phoneNumber = phoneNumber || chaseMatch[1];
    const month = chaseMatch[2].padStart(2, '0');
    const day = chaseMatch[3].padStart(2, '0');
    callDate = callDate || `${chaseMatch[4]}-${month}-${day}`;
    callTime = callTime || `${chaseMatch[5]}:${chaseMatch[6]}:${chaseMatch[7]}`;
  }
}

// Build normalized output with all fields at top level
// Normalize audio_url → file_url (RunPod submit body references $json.file_url)
const output = {
  ...input,
  file_url: input.file_url || input.audio_url || '',
  agent_name: agentName,
  phone_number: phoneNumber,
  call_date: callDate,
  call_time: callTime,
};

if (!phoneNumber || !callDate) {
  // Not enough info to dedup — proceed
  return { ...output, duplicate: false };
}

// Query Supabase REST API
let supabaseUrl, supabaseKey;
try {
  supabaseUrl = $env.SUPABASE_URL;
  supabaseKey = $env.SUPABASE_SERVICE_ROLE_KEY;
} catch (e) {
  return { ...output, duplicate: false };
}

if (!supabaseUrl || !supabaseKey) {
  return { ...output, duplicate: false };
}

const url = `${supabaseUrl}/rest/v1/QA Results?select=id&agent_name=eq.${encodeURIComponent(agentName)}&phone_number=eq.${encodeURIComponent(phoneNumber)}&call_date=eq.${encodeURIComponent(callDate)}&call_time=eq.${encodeURIComponent(callTime)}&limit=1`;

try {
  const resp = await fetch(url, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
  });
  const data = await resp.json();
  const isDuplicate = Array.isArray(data) && data.length > 0;

  return { ...output, duplicate: isDuplicate };
} catch (e) {
  return { ...output, duplicate: false };
}
""".strip()


# ─── RunPod Async Submit Body ────────────────────────────────────────
# Uses n8n expression syntax: ={{ JSON.stringify({...}) }}
# This matches the pattern used by the main pipeline's Submit Channel nodes.
# $json references the output from the previous node (Check Duplicates -> IF).

RUNPOD_SUBMIT_BODY = (
    '={{ JSON.stringify({ '
    'input: { '
    '  audio_url: $json.file_url, '
    '  language: "en", '
    '  split_channels: true, '
    '  diarize: true, '
    '  max_duration: 300, '
    '  vad_onset: 0.3, '
    '  vad_offset: 0.3, '
    '  metadata: { '
    '    file_url: $json.file_url || "", '
    '    file_name: $json.file_name || "", '
    '    agent_name: $json.agent_name || "", '
    '    phone_number: $json.phone_number || "", '
    '    call_date: $json.call_date || "", '
    '    call_time: $json.call_time || "", '
    '    batch_id: $json.batch_id || "", '
    '    s3_key: $json.s3_key || "", '
    '    upload_source: $json.upload_source || "s3_auto" '
    '  } '
    '}, '
    'webhook: "https://n8n.pitchvision.io/webhook/cpa-runpod-callback" '
    '}) }}'
)


# ─── Callback Workflow Code Constants ────────────────────────────────

# Extract Transcription — updated to include s3_key
CALLBACK_EXTRACT_CODE = r"""
/**
 * Extract Transcription from RunPod callback v3.0
 * Handles BOTH stereo split (channels object) and mono diarization (segments array).
 *
 * Stereo output: { channels: { agent: { segments }, customer: { segments } }, channel_count: 2, split_mode: "stereo" }
 * Mono output:   { segments: [...], split_mode: "mono_diarize_fallback" } or { segments: [...] }
 *
 * Normalizes both formats into a consistent shape with:
 *   - agent_segments, customer_segments (pre-labeled)
 *   - channel_count, split_mode for downstream Format Transcript
 */
const callback = $json.body || $json;
const jobId = callback.id || 'unknown';
const status = callback.status || 'unknown';
const output = callback.output || {};
const input = callback.input || {};

// Metadata from original submit request (input.metadata)
const metadata = (input.metadata && Object.keys(input.metadata).length > 0)
  ? input.metadata
  : (output.metadata || {});

// If RunPod returned an error — throw to route to error workflow (DLQ capture)
if (status === 'FAILED' || output.error) {
  const errorMsg = output.error || `RunPod job ${status}`;
  const s3Key = (metadata.s3_key || metadata.file_name || 'unknown');
  // Throw so n8n routes to error workflow → DLQ
  throw new Error(`RunPod FAILED [${s3Key}]: ${errorMsg} (job: ${jobId})`);
}

// Detect output format: stereo (channels object) vs mono (segments array)
const isStereoSplit = output.channels && output.channels.agent && output.channels.customer;

let result = {
  file_name: metadata.file_name || '',
  file_url: metadata.file_url || '',
  agent_name: metadata.agent_name || '',
  phone_number: metadata.phone_number || '',
  call_date: metadata.call_date || '',
  call_time: metadata.call_time || '',
  batch_id: metadata.batch_id || '',
  s3_key: metadata.s3_key || '',
  upload_source: metadata.upload_source || 'cpa',

  transcription_language: output.language || 'en',
  processing_time_s: output.processing_time_s || 0,
  audio_duration_s: output.audio_duration_s || 0,
  trimmed: output.trimmed || false,

  job_id: jobId,
  runpod_status: status,
  channel_count: output.channel_count || (isStereoSplit ? 2 : 1),
  split_mode: output.split_mode || (isStereoSplit ? 'stereo' : 'mono'),
};

if (isStereoSplit) {
  // STEREO: channels already labeled Agent/Customer — pass through directly
  result.agent_segments = output.channels.agent.segments || [];
  result.customer_segments = output.channels.customer.segments || [];
  // Also provide combined segments for backward compat
  result.transcription_segments = [
    ...result.agent_segments,
    ...result.customer_segments,
  ].sort((a, b) => a.start - b.start);
} else {
  // MONO: diarization output with SPEAKER_00/SPEAKER_01 labels
  // Pass raw segments — Format Transcript will handle auto-swap detection
  result.transcription_segments = output.segments || [];
  result.agent_segments = null;
  result.customer_segments = null;
}

return result;
""".strip()


# Forward payload for CPA PASS calls → full AI pipeline
CALLBACK_FORWARD_CODE = r"""
/**
 * Forward CPA-PASS calls to full AI pipeline for deeper AF-code analysis.
 * Prepares the payload for the main QA webhook (/webhook/qa-upload).
 * v3.0: Includes transcript segments so main pipeline skips re-transcription.
 *       Includes full metadata (phone, date, time) for dedup.
 */
const data = $json;
const aiVerify = data.ai_verification || {};

return {
  forward_payload: {
    file_url: data.file_url || data.recording_url || '',
    file_name: data.file_name || '',
    batch_id: data.batch_id || '',
    agent_name: data.agent_name || '',
    phone_number: data.phone_number || '',
    call_date: data.call_date || '',
    call_time: data.call_time || '',
    upload_source: 'cpa_pass',
    s3_key: data.s3_key || (data.file_name ? 'chase-recordings/' + data.file_name : ''),

    // Transcript data — main pipeline can skip re-transcription if present
    agent_segments: data.agent_segments || null,
    customer_segments: data.customer_segments || null,
    transcription_segments: data.transcription_segments || null,
    merged_transcript: data.merged_transcript || '',
    agent_text: data.agent_text || '',
    customer_text: data.customer_text || '',
    channel_count: data.channel_count || 2,
    split_mode: data.split_mode || 'stereo',
    audio_duration_s: data.audio_duration_s || 0,

    // CPA pre-screen results
    cpa_status: 'pass',
    cpa_regex_status: data.cpa_regex_status || 'pass',
    cpa_findings: data.cpa_findings || [],
    cpa_confidence: data.cpa_confidence || 0,
    cpa_ai_confidence: aiVerify.ai_cpa_confidence || null,
    cpa_ai_checks: aiVerify.checks || null,
    cpa_analyzed_at: new Date().toISOString(),
  },
};
""".strip()


# Enriched store payload for CPA FAIL calls → Supabase directly
CALLBACK_STORE_CODE = r"""
/**
 * Prepare enriched CPA FAIL payload for storage v3.1
 * Uses pre-computed metrics from Format Transcript v2.0:
 *   - Speaker metrics (exclusive time windows, turn counts, WPM, pace)
 *   - Conversation-flow timeline markers (merged with CPA finding markers)
 *   - Campaign detection (filename + transcript fallback)
 *   - Auto-swap detection metadata
 *
 * v3.1: Downstream Supabase Insert node now uses UPSERT on s3_recording_key.
 */
const data = $json;

// ─── AI Verification Output ────────────────────────────────────────
const aiVerify = (data.ai_verification && !data.ai_verification.used_regex_only)
  ? data.ai_verification
  : {};
const aiLang = aiVerify.language_assessment || {};

// ─── Helpers ────────────────────────────────────────────────────────
function fmtDur(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}

// ─── Label map ──────────────────────────────────────────────────────
const labelMap = {
  'double_confirm_ab': 'Medicare A & B Confirmation',
  'double_confirm_rwb': 'Red/White/Blue Card',
  'disclosure_recorded_line': 'Recorded Line Disclosure',
  'disclosure_dba_name': 'DBA Company Name',
  'verbal_consent': 'Verbal Consent to Transfer',
  'short_call': 'Short Call',
};

// ─── Timeline Markers ───────────────────────────────────────────────
// Merge conversation-flow markers (from Format Transcript) with CPA finding markers
const conversationMarkers = data.timeline_markers || [];

const findingMarkers = (data.cpa_findings || [])
  .filter(f => f.time_seconds != null)
  .map(f => ({
    time: f.time,
    time_formatted: f.time,
    time_seconds: f.time_seconds,
    event: f.description,
    title: labelMap[f.check] || f.check,
    type: f.found ? 'pass' : 'fail',
    status: f.found ? 'PASS' : 'FAIL',
    item_key: f.check,
    speaker: f.check === 'verbal_consent' ? 'customer' : 'agent',
    is_cpa_finding: true,
  }));

// Combine and sort by timestamp
const timeline_markers = [...conversationMarkers, ...findingMarkers]
  .sort((a, b) => (a.time_seconds || 0) - (b.time_seconds || 0));

// ─── Checklist ──────────────────────────────────────────────────────
const checklist = (data.cpa_findings || []).map(f => ({
  name: labelMap[f.check] || f.check,
  status: f.found ? 'met' : 'not_met',
  evidence: f.phrase || f.description,
  time: f.time || 'N/A',
  time_seconds: f.time_seconds != null ? f.time_seconds : -1,
  notes: f.description,
  confidence: data.cpa_confidence || 0,
}));

// ─── Auto-fail reasons ──────────────────────────────────────────────
const auto_fail_reasons = (data.cpa_findings || [])
  .filter(f => f.required && !f.found)
  .map(f => ({
    code: 'CPA',
    violation: labelMap[f.check] || f.check,
    description: f.description,
    timestamp: f.time || null,
    evidence: f.phrase || f.description,
    speaker: f.check === 'verbal_consent' ? 'customer' : 'agent',
    confidence: 95,
    confidence_tier: 'HIGH',
  }));

// ─── Unique batch_id ────────────────────────────────────────────────
const baseBatchId = data.batch_id || 'cpa';
const uniqueBatchId = data.phone_number && data.call_date
  ? baseBatchId + '_' + data.phone_number + '_' + (data.call_date || '').replace(/-/g, '') + '_' + (data.call_time || '').replace(/:/g, '')
  : baseBatchId + '_' + Date.now();

const failReasons = data.cpa_fail_reasons || [];

// Use pre-computed values from Format Transcript v2.0
const agentWpm = data.agent_wpm || 0;
const customerWpm = data.customer_wpm || 0;
const overallWpm = data.overall_wpm || 0;
const agentPace = data.agent_pace || 'appropriate';
const customerPace = data.customer_pace || 'appropriate';

return {
  supabase_payload: {
    agent_name: data.agent_name || 'Unknown',
    phone_number: data.phone_number || '',
    call_date: data.call_date || null,
    call_time: data.call_time || null,
    transcript: data.merged_transcript || '',
    upload_type: 'hourly_dialer',
    batch_id: uniqueBatchId,
    analyzed_at: new Date().toISOString(),

    // CPA-specific — AI verification enrichment
    cpa_status: data.cpa_status || 'fail',
    cpa_findings: data.cpa_findings || [],
    cpa_confidence: data.cpa_confidence || 0,
    compliance_score: 0,
    auto_fail_triggered: true,
    tag: 'cpa_fail',
    risk_level: 'HIGH',
    call_status: 'CPA Fail',
    call_score: '0',
    summary: aiVerify.summary || ('CPA Pre-Audit: FAIL. ' + failReasons.join('; ') + '.'),
    ai_verification: data.ai_verification || null,
    cpa_regex_status: data.cpa_regex_status || data.cpa_status || 'fail',

    // Recording — s3_key is the UPSERT conflict column, must never be empty
    s3_recording_key: data.s3_key
      || (data.file_name ? 'chase-recordings/' + data.file_name : '')
      || ('manual/' + (data.agent_name || 'unknown') + '_' + (data.phone_number || '0') + '_' + (data.call_date || 'nodate') + '_' + (data.call_time || 'notime').replace(/:/g, '')),
    recording_url: data.recording_url || data.file_url || '',

    // Call metadata — use Format Transcript's campaign detection
    call_duration: data.call_duration || fmtDur(data.audio_duration_s || data.call_duration_seconds || 0),
    product_type: data.product_type || 'UNKNOWN',
    campaign_type: data.campaign_type || '',

    // Speaker metrics — use pre-transfer values when transfer detected
    // After transfer, agent channel = prospect, customer channel = LA — not our agent's metrics
    speaker_metrics: {
      agent: {
        turnCount: data.agent_turn_count || 0,
        speakingTimeSeconds: data.pre_transfer_agent_seconds || data.agent_speaking_time || 0,
        speakingTimeFormatted: fmtDur(data.pre_transfer_agent_seconds || data.agent_speaking_time || 0),
        speakingPercentage: data.pre_transfer_agent_pct || data.agent_speaking_pct || 0,
        wpm: agentWpm,
        wordCount: data.agent_word_count || 0,
      },
      customer: {
        turnCount: data.customer_turn_count || 0,
        speakingTimeSeconds: data.pre_transfer_customer_seconds || data.customer_speaking_time || 0,
        speakingTimeFormatted: fmtDur(data.pre_transfer_customer_seconds || data.customer_speaking_time || 0),
        speakingPercentage: data.pre_transfer_customer_pct || data.customer_speaking_pct || 0,
        wpm: customerWpm,
        wordCount: data.customer_word_count || 0,
      },
      total: {
        turnCount: (data.agent_turn_count || 0) + (data.customer_turn_count || 0),
        speakingTimeSeconds: data.total_talk_time || 0,
        speakingTimeFormatted: fmtDur(data.total_talk_time || 0),
      },
    },
    agent_turn_count: data.agent_turn_count || 0,
    customer_turn_count: data.customer_turn_count || 0,
    agent_speaking_time: data.pre_transfer_agent_seconds || data.agent_speaking_time || 0,
    customer_speaking_time: data.pre_transfer_customer_seconds || data.customer_speaking_time || 0,
    agent_speaking_pct: data.pre_transfer_agent_pct || data.agent_speaking_pct || 0,
    customer_speaking_pct: data.pre_transfer_customer_pct || data.customer_speaking_pct || 0,
    total_talk_time: data.total_talk_time || 0,
    talk_ratio: String(data.talk_ratio || '0'),
    dominant_speaker: data.dominant_speaker || 'agent',

    // Timeline, checklist, auto-fails (merged conversation + finding markers)
    timeline_markers,
    checklist,
    auto_fail_reasons,

    // Language assessment — AI-enriched (v6.0) with regex fallback
    language_assessment: {
      wpm: overallWpm,
      agent_wpm: agentWpm,
      customer_wpm: customerWpm,
      pace: agentPace,
      agent_pace: agentPace,
      customer_pace: customerPace,
      pre_transfer_wpm: data.pre_transfer_wpm || agentWpm,
      engagement: {
        agent_talk_pct: data.agent_speaking_pct || 0,
        customer_talk_pct: data.customer_speaking_pct || 0,
        dominant_speaker: data.dominant_speaker || 'agent',
        turn_count: (data.agent_turn_count || 0) + (data.customer_turn_count || 0),
      },
      // Prefer AI output over regex-derived values
      tone_keywords: aiLang.tone_keywords || data.tone_keywords || [],
      tone_scores: data.tone_scores || null,
      language_summary: aiLang.language_summary || data.language_summary || null,
      filler_count: data.filler_count || 0,
      politeness_count: data.politeness_count || 0,
      empathy_count: data.empathy_count || 0,
      clarity: aiLang.clarity || null,
      empathy: aiLang.empathy || null,
      note: aiVerify.summary
        ? 'CPA pre-screen with AI verification'
        : (data.la_detected
          ? 'CPA pre-screen with LA detection — tone analysis is regex-based'
          : 'CPA pre-screen — tone analysis is regex-based'),
    },
    duration_assessment: {
      assessment: (data.audio_duration_s || data.call_duration_seconds || 0) >= 120 ? 'appropriate' : 'short',
      agent_speaking_pct: data.agent_speaking_pct || 0,
    },

    // LA (Licensed Agent) detection
    transfer_detected: data.transfer_detected || false,
    transfer_initiated_at_seconds: data.transfer_timestamp || null,
    la_detected: data.la_detected || false,
    la_started_at_seconds: data.la_timestamp || null,
    la_segment_count: data.la_segment_count || 0,
    la_text: data.la_text || null,
    analysis_cutoff_seconds: data.la_timestamp || null,

    // Channel / swap detection metadata
    channel_count: data.channel_count || 1,
    split_mode: data.split_mode || 'unknown',
    speaker_swap_detected: data.speaker_swap_detected || false,
    speaker_swap_scores: data.speaker_swap_scores || null,

    // Normalization metadata
    transcript_corrections: data.transcript_corrections || null,

    // Review
    review_priority: 'normal',
    qa_notes: 'CPA FAIL: ' + failReasons.join('; '),
    coaching_notes: failReasons,
  },
};
""".strip()


# ─── CPA AI Verify System Prompt ──────────────────────────────────────

CPA_AI_SYSTEM_PROMPT = r"""You are a CPA (Compliance Pre-Audit) gate for a call center QA pipeline.
Your job: determine if a call PASSES or FAILS 4 compliance checks. Binary verdicts only.

CRITICAL SCOPING RULE: You are analyzing ONLY the FRONTER (front-end agent) portion of the call —
BEFORE the Licensed Agent (LA) joined. The transcript has already been trimmed to this scope.
Do NOT look for evidence that might appear after the transfer/LA joined — it does not count.

EVIDENCE RULE: For each check, you MUST quote the exact transcript line that proves it passed.
If you cannot find a specific quote proving the check was met, it FAILS. No exceptions.

## CHECK 1: MEDICARE A&B CONFIRMATION
PASS requires BOTH:
  (a) Agent ASKS customer about Medicare Parts A & B (not just mentions it)
  (b) Customer gives an affirmative response
Quote the agent's question AND the customer's response.
FAIL if: agent only mentions A&B without asking, OR no customer response visible.

## CHECK 2: RED/WHITE/BLUE CARD
PASS requires: Agent mentions the Red, White, and Blue Medicare card AND customer acknowledges.
Quote both the mention and acknowledgment.
FAIL if: never mentioned, or mentioned but no customer acknowledgment.

## CHECK 3: DISCLOSURE
PASS requires BOTH:
  (a) Agent says "recorded line" / "recorded call" / "on a recorded line"
  (b) Agent states an approved DBA name: America's Health, Benefit Link, Health Benefit Guide
Quote both statements.
FAIL if: either part is missing.

## CHECK 4: VERBAL CONSENT TO TRANSFER
PASS requires: Customer says yes/okay/sure/go ahead IN DIRECT RESPONSE to the agent's transfer request.
Quote the agent's transfer request AND the customer's consent.
FAIL if: "okay" was to an unrelated question, or no consent visible.
PASS ALSO IF: Agent announces transfer and customer does not object (implicit consent) — but you must quote the transfer announcement and note no objection was found.

## WHISPERX NOTES
- Brief responses ("yeah", "uh-huh") are sometimes missed by WhisperX.
- If agent asks a question and then immediately continues (no gap for response), the customer likely responded but WhisperX dropped it. This is a PASS, not a fail. Note this in your reasoning.
- "recorded mind" = "recorded line" (accent artifact, already normalized).

## LANGUAGE ASSESSMENT
Assess the agent's communication quality (pre-transfer portion only):
- clarity (1-10): How clear and understandable?
- empathy (1-10): Did the agent show genuine care?
- tone_keywords: 3-5 adjectives specific to THIS call
- language_summary: 1-2 bespoke sentences about THIS call

## OUTPUT — Return ONLY this JSON:
{
  "checks": {
    "medicare_ab": {"status": "pass|fail", "evidence": "exact quote from transcript", "reasoning": "1 sentence"},
    "rwb_card": {"status": "pass|fail", "evidence": "exact quote or null if not found", "reasoning": "1 sentence"},
    "disclosure": {"status": "pass|fail", "evidence": "exact quote or null if not found", "reasoning": "1 sentence"},
    "verbal_consent": {"status": "pass|fail", "evidence": "exact quote or null if not found", "reasoning": "1 sentence"}
  },
  "ai_cpa_status": "pass|fail",
  "language_assessment": {
    "clarity": 1-10,
    "empathy": 1-10,
    "tone_keywords": ["word1", "word2", "word3"],
    "language_summary": "Bespoke 1-2 sentence assessment"
  },
  "summary": "1-2 sentence overall verdict with key reason"
}

RULES:
- ai_cpa_status = "pass" ONLY if ALL 4 checks are "pass".
- ai_cpa_status = "fail" if ANY check is "fail".
- No "inconclusive". Commit to pass or fail. If you can't find evidence, it's fail.
- Return ONLY the JSON object. No markdown, no explanation."""


# ─── CPA AI Verify Code ──────────────────────────────────────────────

CPA_AI_VERIFY_CODE = r"""
/**
 * CPA AI Verify v1.1 — Lightweight AI verification with retry logic
 *
 * Runs on ALL calls (pass and fail) to:
 * 1. Verify whether regex-detected compliance checks were genuinely met
 * 2. Provide AI-generated language assessment (clarity, empathy, tone)
 * 3. Override regex routing when AI disagrees (catch false positives/negatives)
 *
 * Pattern: Follows Confidence Gate (deploy-confidence-tiers.py) fetch + parse approach.
 * Graceful fallback: On API failure, keeps regex results unchanged.
 */
const input = $json;
const regexStatus = input.cpa_status || 'fail';
const regexFindings = input.cpa_findings || [];

// Use SCOPED (pre-transfer/pre-LA) text from Pre-Screen — fronter only
const transcript = (input.cpa_scoped_transcript || input.merged_transcript || '').substring(0, 4000);
const agentText = (input.cpa_scoped_agent_text || input.agent_text || '').substring(0, 2000);
const customerText = (input.cpa_scoped_customer_text || input.customer_text || '').substring(0, 2000);
const cutoffSec = input.cpa_cutoff_sec || null;

// System prompt injected by deploy script
const systemPrompt = SYSTEM_PROMPT_PLACEHOLDER;

const scopeNote = cutoffSec ? `\n\nIMPORTANT: This transcript has been SCOPED to the FRONTER portion only (first ${Math.round(cutoffSec)}s). Everything below is BEFORE the Licensed Agent joined. Only analyze what the front-end agent and customer said.` : '';
const userPrompt = `AGENT TRANSCRIPT (fronter only — pre-transfer/pre-LA):${scopeNote}\n${agentText}\n\nCUSTOMER TRANSCRIPT (fronter only — pre-transfer/pre-LA):\n${customerText}\n\nMERGED TRANSCRIPT (fronter only — pre-transfer/pre-LA):\n${transcript}\n\nREGEX PRE-SCREEN RESULTS:\n${JSON.stringify(regexFindings, null, 2)}\n\nAnalyze whether each compliance check was GENUINELY met by the FRONTER (front-end agent) before the LA joined.`;

// Get API key (injected at deploy time)
const apiKey = OPENROUTER_KEY_PLACEHOLDER;

if (!apiKey) {
  console.log('CPA AI VERIFY: No OPENROUTER_API_KEY — keeping regex results');
  return { json: {
    ...input,
    cpa_regex_status: regexStatus,
    ai_verification: { error: 'No API key configured', used_regex_only: true },
  }};
}

// Retry with exponential backoff (3 attempts: 0s, 2s, 4s delays)
let lastError = null;
let apiResult = null;

for (let attempt = 0; attempt < 3; attempt++) {
  try {
    apiResult = await this.helpers.httpRequest({
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://pitchvision.io',
        'X-Title': 'PitchVision CPA AI Verify'
      },
      body: {
        model: 'deepseek/deepseek-v3.2',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 800
      },
      json: true,
    });
    break; // success
  } catch (err) {
    lastError = err;
    console.log('CPA AI VERIFY: Attempt ' + (attempt + 1) + '/3 failed: ' + (err.message || String(err)));
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
    }
  }
}

if (!apiResult) {
  console.log('CPA AI VERIFY: All 3 attempts failed — keeping regex results');
  return { json: {
    ...input,
    cpa_regex_status: regexStatus,
    ai_verification: { error: 'All retries failed: ' + (lastError ? lastError.message : 'unknown'), used_regex_only: true, attempts: 3 },
  }};
}

const content = (apiResult.choices && apiResult.choices[0] && apiResult.choices[0].message)
  ? apiResult.choices[0].message.content
  : '';

if (!content) {
  console.log('CPA AI VERIFY: Empty response from API');
  return { json: {
    ...input,
    cpa_regex_status: regexStatus,
    ai_verification: { error: 'Empty API response', used_regex_only: true },
  }};
}

// Parse JSON — try direct, then extract from markdown fences, then brace extraction
let parsed = null;
try {
  parsed = JSON.parse(content);
} catch(e1) {
  const fenceMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try { parsed = JSON.parse(fenceMatch[1]); } catch(e2) {}
  }
  if (!parsed) {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try { parsed = JSON.parse(content.substring(firstBrace, lastBrace + 1)); } catch(e3) {}
    }
  }
}

if (!parsed || !parsed.checks) {
  console.log('CPA AI VERIFY: Could not parse AI response');
  return { json: {
    ...input,
    cpa_regex_status: regexStatus,
    ai_verification: { error: 'Parse failure', raw_response: content.substring(0, 500), used_regex_only: true },
  }};
}

// Validate AI response has expected check keys
const expectedKeys = ['medicare_ab', 'rwb_card', 'disclosure', 'verbal_consent'];
const missingKeys = expectedKeys.filter(k => !parsed.checks[k]);
if (missingKeys.length > 0) {
  console.log('CPA AI VERIFY: Missing check keys: ' + missingKeys.join(', '));
  // Don't fail — use whatever checks were returned, log the gaps
}

// Validate language assessment numeric fields
const aiLang = parsed.language_assessment || {};
if (aiLang.clarity && (typeof aiLang.clarity !== 'number' || aiLang.clarity < 1 || aiLang.clarity > 10)) {
  aiLang.clarity = null; // invalid, discard
}
if (aiLang.empathy && (typeof aiLang.empathy !== 'number' || aiLang.empathy < 1 || aiLang.empathy > 10)) {
  aiLang.empathy = null;
}
parsed.language_assessment = aiLang;

// AI determination — binary, no confidence scores
const aiStatus = parsed.ai_cpa_status || 'fail';

// AI verdict is authoritative — it has transcript context that regex doesn't
const finalStatus = aiStatus;

console.log('CPA AI VERIFY: regex=' + regexStatus + ', ai=' + aiStatus + ', final=' + finalStatus);

// ── Merge AI results INTO cpa_findings ──────────────────────────────
// The AI's pass/fail overrides regex findings while keeping regex timestamps
// for marker positioning. This ensures the UI displays coherent output
// (summary, violations, and markers all driven by AI).
const aiCheckMap = {
  'medicare_ab': 'double_confirm_ab',
  'rwb_card': 'double_confirm_rwb',
  'disclosure': 'disclosure_recorded_line', // AI disclosure covers both recorded_line + DBA
  'verbal_consent': 'verbal_consent',
};

const mergedFindings = JSON.parse(JSON.stringify(regexFindings)); // deep copy

for (const [aiKey, regexKey] of Object.entries(aiCheckMap)) {
  const aiCheck = parsed.checks[aiKey];
  if (!aiCheck) continue;
  const aiPassed = aiCheck.status === 'pass';

  // Find the matching regex finding(s) and override pass/fail + description
  for (const finding of mergedFindings) {
    if (finding.check === regexKey) {
      const regexWas = finding.found;
      finding.found = aiPassed;
      finding.description = aiPassed
        ? (aiCheck.evidence || finding.description)
        : (aiCheck.reasoning || finding.description);
      finding.ai_override = regexWas !== aiPassed;
      finding.ai_reasoning = aiCheck.reasoning || null;
    }
    // AI 'disclosure' also covers DBA — sync both findings
    if (aiKey === 'disclosure' && finding.check === 'disclosure_dba_name') {
      // DBA is part of the disclosure check — if AI says disclosure passed, DBA passed too
      // (AI checks recorded_line + DBA as one combined check)
      const regexWas = finding.found;
      finding.found = aiPassed;
      finding.description = aiPassed
        ? (aiCheck.evidence || finding.description)
        : (aiCheck.reasoning || finding.description);
      finding.ai_override = regexWas !== aiPassed;
      finding.ai_reasoning = aiCheck.reasoning || null;
    }
  }
}

// Recompute cpa_fail_reasons from merged findings
const updatedFailReasons = mergedFindings
  .filter(f => f.required && !f.found)
  .map(f => f.check + ': ' + f.description);
const updatedPassedCount = mergedFindings.filter(f => f.required && f.found).length;
const updatedRequiredCount = mergedFindings.filter(f => f.required).length;
const updatedConfidence = Math.round((updatedPassedCount / Math.max(updatedRequiredCount, 1)) * 100);

const overrideCount = mergedFindings.filter(f => f.ai_override).length;
if (overrideCount > 0) {
  console.log('CPA AI VERIFY: AI overrode ' + overrideCount + ' regex finding(s)');
}

return { json: {
  ...input,
  cpa_status: finalStatus,
  cpa_regex_status: regexStatus,
  cpa_findings: mergedFindings,
  cpa_fail_reasons: updatedFailReasons,
  cpa_confidence: updatedConfidence,
  ai_verification: {
    checks: parsed.checks,
    ai_cpa_status: aiStatus,
    language_assessment: parsed.language_assessment || null,
    summary: parsed.summary || null,
    used_regex_only: false,
    overrides: overrideCount,
  },
}};
""".strip()

# Inject the system prompt into the verify code (avoid nested raw strings)
CPA_AI_VERIFY_CODE = CPA_AI_VERIFY_CODE.replace(
    "SYSTEM_PROMPT_PLACEHOLDER",
    json.dumps(CPA_AI_SYSTEM_PROMPT.strip())
)

# Inject OpenRouter API key at deploy time
_openrouter_key = _load_env_key("OPENROUTER_API_KEY")
CPA_AI_VERIFY_CODE = CPA_AI_VERIFY_CODE.replace(
    "OPENROUTER_KEY_PLACEHOLDER",
    json.dumps(_openrouter_key) if _openrouter_key else "null"
)


# ═══════════════════════════════════════════════════════════════════════
# SUBMIT WORKFLOW (Workflow A) — Slim async submitter
# ═══════════════════════════════════════════════════════════════════════

def make_submit_nodes():
    """Build CPA Submit workflow nodes — slim async submitter."""
    nodes = []
    x_start = 250
    x_step = 300

    # 1. Webhook Trigger
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "CPA Webhook",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": [x_start, 300],
        "webhookId": str(uuid.uuid4()),
        "parameters": {
            "path": "cpa-upload",
            "httpMethod": "POST",
            "responseMode": "lastNode",
            "options": {},
        },
    })

    # 2. Check Duplicates
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Check Duplicates",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x_start + x_step, 300],
        "parameters": {
            "jsCode": CHECK_DUPLICATES_CODE,
            "mode": "runOnceForEachItem",
        },
    })

    # 3. Skip if Duplicate (IF node)
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Skip if Duplicate",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2,
        "position": [x_start + x_step * 2, 300],
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
                "conditions": [
                    {
                        "id": str(uuid.uuid4()),
                        "leftValue": "={{ $json.duplicate }}",
                        "rightValue": False,
                        "operator": {
                            "type": "boolean",
                            "operation": "equals",
                        },
                    }
                ],
                "combinator": "and",
            },
        },
    })

    # 4. RunPod Submit (HTTP Request — async /run with webhook callback)
    # Uses direct header auth (same pattern as main pipeline Submit Channel nodes)
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "RunPod Submit",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [x_start + x_step * 3, 200],
        "parameters": {
            "method": "POST",
            "url": "https://api.runpod.ai/v2/j9iteehc9czgcs/run",
            "authentication": "none",
            "sendHeaders": True,
            "specifyHeaders": "keypair",
            "headerParameters": {
                "parameters": [
                    {"name": "Content-Type", "value": "application/json"},
                    {"name": "Authorization", "value": f"Bearer {RUNPOD_API_KEY}"},
                ],
            },
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": RUNPOD_SUBMIT_BODY,
            "options": {
                "timeout": 30000,
            },
        },
    })

    # 5. Return Accepted
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Return Accepted",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x_start + x_step * 4, 200],
        "parameters": {
            "jsCode": (
                "const original = $('Check Duplicates').first().json;\n"
                "return { json: {\n"
                "  status: 'accepted',\n"
                "  message: 'Submitted to RunPod for async transcription',\n"
                "  job_id: $json.id || 'unknown',\n"
                "  file_name: original.file_name || '',\n"
                "} };"
            ),
            "mode": "runOnceForEachItem",
        },
    })

    # 6. Duplicate Response
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Duplicate Response",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x_start + x_step * 3, 450],
        "parameters": {
            "jsCode": 'return { json: { status: "duplicate", message: "Recording already processed", file_name: $json.file_name } };',
            "mode": "runOnceForEachItem",
        },
    })

    return nodes


def make_submit_connections():
    """Build submit workflow connections."""
    return {
        "CPA Webhook": {
            "main": [[{"node": "Check Duplicates", "type": "main", "index": 0}]]
        },
        "Check Duplicates": {
            "main": [[{"node": "Skip if Duplicate", "type": "main", "index": 0}]]
        },
        "Skip if Duplicate": {
            "main": [
                # True (not duplicate) -> RunPod Submit
                [{"node": "RunPod Submit", "type": "main", "index": 0}],
                # False (is duplicate) -> Duplicate Response
                [{"node": "Duplicate Response", "type": "main", "index": 0}],
            ]
        },
        "RunPod Submit": {
            "main": [[{"node": "Return Accepted", "type": "main", "index": 0}]]
        },
    }


# ═══════════════════════════════════════════════════════════════════════
# CALLBACK WORKFLOW UPDATE (Workflow B)
# ═══════════════════════════════════════════════════════════════════════

def update_callback_workflow(dry_run=False):
    """
    Update the callback workflow with:
    - Format Transcript v3.0 (stereo channel split + mono auto-swap)
    - Extract Transcription v3.0 (stereo channels + mono fallback)
    - CPA Pre-Screen v5.0
    - CPA AI Verify v1.0 (NEW — lightweight AI verification)
    - Route Decision flipped (pass → forward, fail → store)
    - Forward-to-pipeline code for PASS path (v2.0 — includes AI context)
    - Enriched store code for FAIL path (v6.0 — AI language assessment)
    - Supabase Insert → UPSERT on s3_recording_key (idempotent callbacks)
    - Error workflow configured for DLQ capture
    """
    print(f"\n--- Updating Callback Workflow ({CALLBACK_WORKFLOW_ID}) ---")

    # 1. Fetch current workflow
    print("  Fetching current workflow...")
    resp = requests.get(f"{API_BASE}/{CALLBACK_WORKFLOW_ID}", headers=HEADERS)
    if not resp.ok:
        print(f"  ERROR: Could not fetch callback workflow: {resp.status_code}: {resp.text}")
        return None
    workflow = resp.json()
    print(f"  Found: {workflow.get('name')} ({len(workflow.get('nodes', []))} nodes)")

    # 2. Modify specific nodes by name
    updated = []
    for node in workflow["nodes"]:
        name = node["name"]

        if name == "Format Transcript":
            node["parameters"]["jsCode"] = FORMAT_TRANSCRIPT_CODE
            updated.append(f"{name} -> v3.0 (stereo split + mono auto-swap)")

        elif name == "CPA Pre-Screen":
            node["parameters"]["jsCode"] = CPA_PRESCREEN_CODE
            updated.append(f"{name} -> v6.0 (proximity checks, expanded DBA, word count guard)")

        elif name == "Route Decision":
            # Change from checking 'fail' to checking 'pass'
            # TRUE output (pass) -> forward to pipeline
            # FALSE output (fail) -> store directly
            conds = node["parameters"]["conditions"]["conditions"]
            conds[0]["rightValue"] = "pass"
            updated.append(f"{name} -> check 'pass' (was 'fail')")

        elif name == "Prepare Flagged Payload":
            # Was: prepare fail data for Supabase
            # Now: prepare forward payload for PASS calls → full AI pipeline
            node["parameters"]["jsCode"] = CALLBACK_FORWARD_CODE
            updated.append(f"{name} -> forward-to-pipeline code (PASS path)")

        elif name == "Supabase Insert Flagged":
            # Was: POST to Supabase (store fail data)
            # Now: POST to /webhook/qa-upload (forward pass calls to full pipeline)
            node["parameters"]["url"] = "https://n8n.pitchvision.io/webhook/qa-upload"
            node["parameters"]["headerParameters"] = {
                "parameters": [
                    {"name": "Content-Type", "value": "application/json"},
                ]
            }
            node["parameters"]["jsonBody"] = "={{ JSON.stringify($json.forward_payload) }}"
            # Remove authentication if present (webhook doesn't need it)
            node["parameters"].pop("authentication", None)
            node["parameters"].pop("genericAuthType", None)
            updated.append(f"{name} -> POST to /webhook/qa-upload (was Supabase)")

        elif name == "Prepare Store Payload":
            # Was: prepare pass data for Supabase
            # Now: prepare enriched FAIL data for Supabase
            node["parameters"]["jsCode"] = CALLBACK_STORE_CODE
            updated.append(f"{name} -> enriched fail store code (FAIL path)")

        elif name == "Extract Transcription":
            # v3.0: handles stereo (channels object) + mono (segments array) + s3_key
            node["parameters"]["jsCode"] = CALLBACK_EXTRACT_CODE
            updated.append(f"{name} -> v3.0 (stereo channels + mono fallback)")

        elif name == "Supabase Insert":
            # PHASE 1: Convert INSERT → UPSERT on s3_recording_key
            # PostgREST upsert: add on_conflict param + Prefer resolution header
            base_url = "https://eyrxkirpubylgkkvcrlh.supabase.co/rest/v1/QA Results"
            node["parameters"]["url"] = f"{base_url}?on_conflict=s3_recording_key"
            # Update Prefer header to include merge-duplicates
            for param in node["parameters"].get("headerParameters", {}).get("parameters", []):
                if param.get("name") == "Prefer":
                    param["value"] = "resolution=merge-duplicates,return=representation"
            updated.append(f"{name} -> UPSERT on s3_recording_key (was INSERT)")

    # 2b. Insert CPA AI Verify node if not present
    ai_verify_exists = any(n["name"] == "CPA AI Verify" for n in workflow["nodes"])
    if not ai_verify_exists:
        # Find position from CPA Pre-Screen node
        prescreen_node = next((n for n in workflow["nodes"] if n["name"] == "CPA Pre-Screen"), None)
        route_node = next((n for n in workflow["nodes"] if n["name"] == "Route Decision"), None)

        if prescreen_node and route_node:
            ps_pos = prescreen_node.get("position", [800, 300])
            rd_pos = route_node.get("position", [1100, 300])
            # Place AI Verify between Pre-Screen and Route Decision
            ai_x = (ps_pos[0] + rd_pos[0]) // 2
            ai_y = ps_pos[1]

            # Shift Route Decision and downstream nodes right to make room
            shift_amount = 300
            for node in workflow["nodes"]:
                pos = node.get("position", [0, 0])
                if pos[0] >= rd_pos[0]:
                    node["position"] = [pos[0] + shift_amount, pos[1]]

            new_node = {
                "id": str(uuid.uuid4()),
                "name": "CPA AI Verify",
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [ai_x, ai_y],
                "parameters": {
                    "jsCode": CPA_AI_VERIFY_CODE,
                    "mode": "runOnceForEachItem",
                },
            }
            workflow["nodes"].append(new_node)
            updated.append("CPA AI Verify -> NEW node (AI verification v1.0)")

            # Rewire connections: Pre-Screen → AI Verify → Route Decision
            connections = workflow.get("connections", {})
            if "CPA Pre-Screen" in connections:
                # Re-point Pre-Screen output to AI Verify
                connections["CPA Pre-Screen"] = {
                    "main": [[{"node": "CPA AI Verify", "type": "main", "index": 0}]]
                }
            # AI Verify output → Route Decision
            connections["CPA AI Verify"] = {
                "main": [[{"node": "Route Decision", "type": "main", "index": 0}]]
            }
            updated.append("Connections: Pre-Screen → AI Verify → Route Decision")
        else:
            print("  WARNING: Could not find CPA Pre-Screen or Route Decision nodes for AI Verify insertion")
    else:
        # Update existing AI Verify node code
        for node in workflow["nodes"]:
            if node["name"] == "CPA AI Verify":
                node["parameters"]["jsCode"] = CPA_AI_VERIFY_CODE
                updated.append("CPA AI Verify -> updated code (v1.0)")
                break

    if not updated:
        print("  WARNING: No nodes were updated!")
        return None

    # 3. Configure error workflow for DLQ capture
    settings = workflow.get("settings", {})
    settings["errorWorkflow"] = "6KYZ8iIlZa0J35bt"  # QA Error Handler workflow
    updated.append("settings.errorWorkflow -> QA Error Handler (DLQ capture)")

    for u in updated:
        print(f"  Updated: {u}")

    if dry_run:
        print(f"\n  [DRY RUN] Would update {len(updated)} nodes + settings. No changes made.")
        out_path = SCRIPTS_DIR.parent / ".n8n-snapshots" / "cpa-callback-preview.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        preview = {
            "name": workflow.get("name"),
            "nodes": workflow["nodes"],
            "connections": workflow.get("connections", {}),
            "settings": settings,
        }
        out_path.write_text(json.dumps(preview, indent=2))
        print(f"  Preview saved to: {out_path}")
        return None

    # 4. PUT it back (strip to required fields only)
    print("  Deploying updated callback workflow...")
    payload = {
        "name": workflow.get("name", "CPA Callback Processor"),
        "nodes": workflow["nodes"],
        "connections": workflow.get("connections", {}),
        "settings": settings,
    }

    resp = requests.put(
        f"{API_BASE}/{CALLBACK_WORKFLOW_ID}",
        headers=HEADERS,
        json=payload,
    )
    if not resp.ok:
        print(f"  ERROR: n8n API returned {resp.status_code}: {resp.text[:500]}")
        return None

    print(f"  Callback workflow updated successfully! ({len(updated)} nodes changed)")
    return resp.json()


# ═══════════════════════════════════════════════════════════════════════
# SUBMIT WORKFLOW DEPLOYMENT
# ═══════════════════════════════════════════════════════════════════════

def create_submit_workflow(dry_run=False):
    """Create a new CPA Submit workflow via n8n API."""
    nodes = make_submit_nodes()
    connections = make_submit_connections()

    workflow = {
        "name": "CPA Pre-Audit Pipeline",
        "nodes": nodes,
        "connections": connections,
        "settings": {"executionOrder": "v1"},
    }

    print(f"\nWorkflow: {workflow['name']}")
    print(f"Nodes ({len(nodes)}):")
    for n in nodes:
        print(f"  - {n['name']} ({n['type']})")
    print(f"Connections:")
    for src, targets in connections.items():
        for output_idx, output_conns in enumerate(targets.get("main", [])):
            for conn in output_conns:
                label = f" (output {output_idx})" if len(targets.get("main", [])) > 1 else ""
                print(f"  {src}{label} -> {conn['node']}")

    if dry_run:
        print("\n[DRY RUN] Would create workflow. No changes made.")
        out_path = SCRIPTS_DIR.parent / ".n8n-snapshots" / "cpa-submit-preview.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(workflow, indent=2))
        print(f"  Preview saved to: {out_path}")
        return None

    print("\nCreating workflow via n8n API...")
    resp = requests.post(API_BASE, headers=HEADERS, json=workflow)
    if not resp.ok:
        print(f"ERROR: n8n API returned {resp.status_code}: {resp.text}")
        sys.exit(1)

    result = resp.json()
    workflow_id = result.get("id")
    print(f"  Created! ID: {workflow_id}")

    # Activate
    act_resp = requests.post(f"{API_BASE}/{workflow_id}/activate", headers=HEADERS)
    print(f"  {'Activated!' if act_resp.ok else f'Warning: Could not activate ({act_resp.status_code})'}")

    return result


def update_submit_workflow(dry_run=False):
    """Update the existing CPA Submit workflow."""
    nodes = make_submit_nodes()
    connections = make_submit_connections()

    workflow = {
        "name": "CPA Pre-Audit Pipeline",
        "nodes": nodes,
        "connections": connections,
        "settings": {"executionOrder": "v1"},
    }

    print(f"\n--- Updating Submit Workflow ({SUBMIT_WORKFLOW_ID}) ---")
    print(f"Nodes ({len(nodes)}):")
    for n in nodes:
        print(f"  - {n['name']} ({n['type']})")

    if dry_run:
        print(f"\n[DRY RUN] Would update workflow. No changes made.")
        out_path = SCRIPTS_DIR.parent / ".n8n-snapshots" / "cpa-submit-preview.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(workflow, indent=2))
        print(f"  Preview saved to: {out_path}")
        return None

    # Use the deploy library for safe deployment (snapshot + rollback)
    try:
        from importlib.util import spec_from_file_location, module_from_spec
        spec = spec_from_file_location("deploy", SCRIPTS_DIR / "n8n-deploy.py")
        deploy = module_from_spec(spec)
        spec.loader.exec_module(deploy)

        print("  Deploying via n8n-deploy.py (with snapshot + rollback)...")
        workflow["id"] = SUBMIT_WORKFLOW_ID
        result = deploy.safe_deploy(workflow, label="cpa-submit-async")
        if result["success"]:
            print("  Submit workflow updated successfully!")
        else:
            print(f"  Update failed: {result.get('errors')}")
        return result
    except Exception as e:
        # Fallback: direct PUT
        print(f"  Warning: Could not load n8n-deploy.py ({e}). Falling back to direct PUT...")
        resp = requests.put(
            f"{API_BASE}/{SUBMIT_WORKFLOW_ID}",
            headers=HEADERS,
            json=workflow,
        )
        if resp.ok:
            print("  Submit workflow updated successfully!")
            return resp.json()
        else:
            print(f"  ERROR: {resp.status_code}: {resp.text[:500]}")
            return None


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

def main():
    dry_run = "--dry-run" in sys.argv
    do_submit = "--update" in sys.argv or "--update-both" in sys.argv
    do_callback = "--update-callback" in sys.argv or "--update-both" in sys.argv
    do_create = not (do_submit or do_callback)

    print("=" * 60)
    print("CPA Pre-Audit Pipeline Deployment v2.0")
    print("  Submit Workflow:   " + SUBMIT_WORKFLOW_ID)
    print("  Callback Workflow: " + CALLBACK_WORKFLOW_ID)
    print("=" * 60)

    if do_submit:
        update_submit_workflow(dry_run=dry_run)

    if do_callback:
        update_callback_workflow(dry_run=dry_run)

    if do_create:
        print("\nUsage:")
        print("  --update            Update submit workflow (slim async)")
        print("  --update-callback   Update callback workflow (v5.0 + routing)")
        print("  --update-both       Update both workflows")
        print("  --dry-run           Preview only (combine with above)")
        print("\nTo create a brand new submit workflow:")
        print("  python3 scripts/deploy-cpa-workflow.py --create")
        if "--create" in sys.argv:
            create_submit_workflow(dry_run=dry_run)

    print("\n" + "=" * 60)
    if do_submit or do_callback:
        print("Deployment complete!")
        if do_submit:
            print("  Submit: Slim async submitter → RunPod /run + webhook callback")
        if do_callback:
            print("  Callback: v5.0 Pre-Screen + PASS→pipeline, FAIL→store")
    print("=" * 60)


if __name__ == "__main__":
    main()
