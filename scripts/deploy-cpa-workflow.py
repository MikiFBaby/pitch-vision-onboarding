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
      -> CPA Pre-Screen v5.0 (3 core requirements)
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

# Load API key
API_KEY = os.environ.get("N8N_API_KEY")
if not API_KEY:
    env_path = SCRIPTS_DIR.parent / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("N8N_API_KEY="):
                API_KEY = line.split("=", 1)[1].strip()
                break
if not API_KEY:
    print("ERROR: N8N_API_KEY not found")
    sys.exit(1)

HEADERS = {"X-N8N-API-KEY": API_KEY, "Content-Type": "application/json"}


# ─── CPA Pre-Screen Code (v5.0) ────────────────────────────────────

CPA_PRESCREEN_CODE = r"""
/**
 * CPA Pre-Screen v5.0 — 3 Core Compliance Requirements
 *
 * CPA checks ONLY 3 things (the rest is the full AI pipeline's job):
 *   1. DOUBLE CONFIRM: Agent asks about Medicare Parts A & B, AND confirms Red/White/Blue card
 *   2. DISCLOSURE: Agent discloses recorded line AND states DBA company name
 *   3. VERBAL CONSENT: Customer gives verbal consent to transfer to Licensed Agent
 *
 * ALL 3 must pass for CPA pass. Any missing = CPA fail (stored directly).
 * CPA pass → forwarded to full AI pipeline for deeper AF-code analysis.
 */
const transcript = $json.merged_transcript || '';
const agentText = $json.agent_text || '';
const customerText = $json.customer_text || '';
const agentSegments = $json.agent_segments || [];
const customerSegments = $json.customer_segments || [];
const allSegments = [...agentSegments, ...customerSegments].sort((a, b) => a.start - b.start);
const audioDuration = $json.audio_duration_s || 0;

function fmt(seconds) {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function findSeg(segments, regex) {
  return segments.find(s => regex.test(s.text));
}

const findings = [];

// ═══════════════════════════════════════════════════════════════
// CHECK 1: DOUBLE CONFIRM — Medicare A&B + Red/White/Blue Card
// Both must be present. Agent must ASK and customer must CONFIRM.
// ═══════════════════════════════════════════════════════════════

// 1a. Medicare Parts A & B mentioned (agent or customer)
const abRe = /part\s*a\s*(and|&|\+)\s*(part\s*)?b/i;
const abHit = abRe.test(agentText + ' ' + customerText);
const abS = findSeg(allSegments, abRe);
findings.push({
  check: 'double_confirm_ab',
  found: abHit,
  required: true,
  description: abHit ? 'Medicare A & B confirmation found' : 'MISSING: No Medicare A & B confirmation',
  time_seconds: abS ? abS.start : null,
  time: abS ? fmt(abS.start) : null,
});

// 1b. Red/White/Blue card mentioned
const rwbRe = /red\s*,?\s*white\s*,?\s*(and|&)\s*blue/i;
const rwbHit = rwbRe.test(transcript);
const rwbS = findSeg(allSegments, rwbRe);
findings.push({
  check: 'double_confirm_rwb',
  found: rwbHit,
  required: true,
  description: rwbHit ? 'Red/White/Blue card confirmation found' : 'MISSING: No Red/White/Blue card mention',
  time_seconds: rwbS ? rwbS.start : null,
  time: rwbS ? fmt(rwbS.start) : null,
});

const doubleConfirmPass = abHit && rwbHit;

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

// 2b. DBA company name (America's Health, Benefit Link, Health Benefit Guide)
const dbaRe = /\b(america(?:'s|s)?\s*health|benefit\s*link|health\s*benefit\s*guide)\b/i;
const dbaHit = dbaRe.test(agentText);
const dbaS = findSeg(agentSegments, dbaRe);
const dbaMatch = agentText.match(dbaRe);
findings.push({
  check: 'disclosure_dba_name',
  found: dbaHit,
  required: true,
  description: dbaHit ? 'DBA company name disclosed: "' + (dbaMatch ? dbaMatch[0] : '') + '"' : 'MISSING: No DBA company name disclosed',
  phrase: dbaMatch ? dbaMatch[0] : null,
  time_seconds: dbaS ? dbaS.start : null,
  time: dbaS ? fmt(dbaS.start) : null,
});

const disclosurePass = recHit && dbaHit;

// ═══════════════════════════════════════════════════════════════
// CHECK 3: VERBAL CONSENT — Customer agrees to transfer to LA
// Must detect affirmative customer response in context of transfer.
// ═══════════════════════════════════════════════════════════════

// 3a. Did agent mention transfer/specialist/licensed agent?
const transferMentionRe = /\b(transfer|connect|specialist|licensed (?:agent|representative)|someone (?:who can|to) help|get you (?:over|connected)|grab (?:my|a|one of)|come on the line|ringing|joining)\b/i;
const transferMentioned = transferMentionRe.test(agentText);

// 3b. Customer affirmative response
const consentRe = /\b(yes|yeah|sure|okay|ok|go ahead|that's fine|uh-huh|mm-hmm|yep|alright|sounds good|that works|please|absolutely|of course|no problem|mhmm|right)\b/i;
const consentHit = consentRe.test(customerText);
const consentS = findSeg(customerSegments, consentRe);

// Consent is meaningful only if transfer was mentioned
const verbalConsentPass = transferMentioned && consentHit;

findings.push({
  check: 'verbal_consent',
  found: verbalConsentPass,
  required: true,
  description: verbalConsentPass
    ? 'Verbal consent to transfer detected'
    : !transferMentioned
      ? 'MISSING: No transfer language detected from agent'
      : 'MISSING: No customer consent to transfer detected',
  time_seconds: consentS ? consentS.start : null,
  time: consentS ? fmt(consentS.start) : null,
});

// ═══════════════════════════════════════════════════════════════
// SCORING & ROUTING
// ═══════════════════════════════════════════════════════════════

const requiredChecks = findings.filter(f => f.required);
const passedChecks = requiredChecks.filter(f => f.found);
const failedChecks = requiredChecks.filter(f => !f.found);

// All 3 core requirements must pass
const allPass = doubleConfirmPass && disclosurePass && verbalConsentPass;

// Also fail very short calls (< 20s) — hangups/wrong numbers
const tooShort = audioDuration > 0 && audioDuration < 20;

if (tooShort) {
  findings.push({
    check: 'short_call',
    found: false,
    required: true,
    description: 'Call too short (' + Math.round(audioDuration) + 's) — likely hangup',
    duration_s: Math.round(audioDuration),
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
  cpa_version: '5.0',
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
  // ─── PATH A: STEREO — definitive channel assignment ───────
  agentSegments = normalizeSegmentList(rawAgentSegments, 'Agent');
  customerSegments = normalizeSegmentList(rawCustomerSegments, 'Customer');
  console.log('STEREO MODE: ' + agentSegments.length + ' agent segs, ' + customerSegments.length + ' customer segs (Ch0=Agent, Ch1=Customer)');

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
// BUILD MERGED TRANSCRIPT
// ═══════════════════════════════════════════════════════════════
const allSegments = [...agentSegments, ...customerSegments].sort((a, b) => a.start - b.start);

const formattedTranscript = allSegments.map(seg => {
  const ts = Math.floor(seg.start);
  const mins = Math.floor(ts / 60);
  const secs = ts % 60;
  return `[${mins}:${String(secs).padStart(2, '0')}] ${seg.speaker}: ${seg.text}`;
}).join('\n');

const agentText = agentSegments.map(s => s.text).join(' ');
const customerText = customerSegments.map(s => s.text).join(' ');

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

// WPM computation
const agentWords = agentText.split(/\s+/).filter(w => w).length;
const customerWords = customerText.split(/\s+/).filter(w => w).length;
const agentWpm = agentSeconds > 0 ? Math.round((agentWords / agentSeconds) * 60) : 0;
const customerWpm = customerSeconds > 0 ? Math.round((customerWords / customerSeconds) * 60) : 0;
const overallWpm = totalSpeaking > 0 ? Math.round(((agentWords + customerWords) / totalSpeaking) * 60) : 0;
const getPace = (wpm) => wpm > 180 ? 'rushed' : wpm > 160 ? 'fast' : wpm < 100 ? 'slow' : 'appropriate';

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
  if (productType === 'UNKNOWN') productType = 'ACA';
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

  // Channel / swap metadata
  channel_count: channelCount,
  split_mode: splitMode,
  speaker_swap_detected: swapped,
  speaker_swap_scores: swapScores,

  // Normalization metadata
  transcript_corrections: totalCorrections.length > 0 ? totalCorrections : null,
  transcript_normalized: totalCorrections.length > 0,
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
const agentName = input.agent_name || '';

// Parse metadata from filename if not provided
let phoneNumber = input.phone_number || '';
let callDate = input.call_date || '';
let callTime = input.call_time || '';

// Chase pattern: CampaignID_CampaignName_AgentName_Phone_M_D_YYYY-HH_MM_SS.wav
if (!phoneNumber || !callDate) {
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
const output = {
  ...input,
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

// If RunPod returned an error
if (status === 'FAILED' || output.error) {
  return {
    error: output.error || `RunPod job ${status}`,
    job_id: jobId,
    status: status,
  };
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
 */
const data = $json;

return {
  forward_payload: {
    file_url: data.file_url || data.recording_url || '',
    file_name: data.file_name || '',
    batch_id: data.batch_id || '',
    agent_name: data.agent_name || '',
    upload_source: 'cpa_pass',
    s3_key: data.s3_key || (data.file_name ? 'chase-recordings/' + data.file_name : ''),
    cpa_status: 'pass',
    cpa_findings: data.cpa_findings || [],
    cpa_confidence: data.cpa_confidence || 0,
  },
};
""".strip()


# Enriched store payload for CPA FAIL calls → Supabase directly
CALLBACK_STORE_CODE = r"""
/**
 * Prepare enriched CPA FAIL payload for storage v3.0
 * Uses pre-computed metrics from Format Transcript v2.0:
 *   - Speaker metrics (exclusive time windows, turn counts, WPM, pace)
 *   - Conversation-flow timeline markers (merged with CPA finding markers)
 *   - Campaign detection (filename + transcript fallback)
 *   - Auto-swap detection metadata
 */
const data = $json;

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

    // CPA-specific
    cpa_status: 'fail',
    cpa_findings: data.cpa_findings || [],
    cpa_confidence: data.cpa_confidence || 0,
    compliance_score: 0,
    auto_fail_triggered: true,
    tag: 'cpa_fail',
    risk_level: 'HIGH',
    call_status: 'CPA Fail',
    call_score: '0',
    summary: 'CPA Pre-Audit: FAIL. ' + failReasons.join('; ') + '.',

    // Recording
    s3_recording_key: data.s3_key || '',
    recording_url: data.recording_url || data.file_url || '',

    // Call metadata — use Format Transcript's campaign detection
    call_duration: data.call_duration || fmtDur(data.audio_duration_s || data.call_duration_seconds || 0),
    product_type: data.product_type || 'UNKNOWN',
    campaign_type: data.campaign_type || '',

    // Speaker metrics (pre-computed by Format Transcript v2.0)
    speaker_metrics: {
      agent: {
        turnCount: data.agent_turn_count || 0,
        speakingTimeSeconds: data.agent_speaking_time || 0,
        speakingTimeFormatted: fmtDur(data.agent_speaking_time || 0),
        speakingPercentage: data.agent_speaking_pct || 0,
      },
      customer: {
        turnCount: data.customer_turn_count || 0,
        speakingTimeSeconds: data.customer_speaking_time || 0,
        speakingTimeFormatted: fmtDur(data.customer_speaking_time || 0),
        speakingPercentage: data.customer_speaking_pct || 0,
      },
      total: {
        turnCount: (data.agent_turn_count || 0) + (data.customer_turn_count || 0),
        speakingTimeSeconds: data.total_talk_time || 0,
        speakingTimeFormatted: fmtDur(data.total_talk_time || 0),
      },
    },
    agent_turn_count: data.agent_turn_count || 0,
    customer_turn_count: data.customer_turn_count || 0,
    agent_speaking_time: data.agent_speaking_time || 0,
    customer_speaking_time: data.customer_speaking_time || 0,
    agent_speaking_pct: data.agent_speaking_pct || 0,
    customer_speaking_pct: data.customer_speaking_pct || 0,
    total_talk_time: data.total_talk_time || 0,
    talk_ratio: String(data.talk_ratio || '0'),
    dominant_speaker: data.dominant_speaker || 'agent',

    // Timeline, checklist, auto-fails (merged conversation + finding markers)
    timeline_markers,
    checklist,
    auto_fail_reasons,

    // Language assessment — uses pre-computed WPM/pace from Format Transcript
    language_assessment: {
      wpm: overallWpm,
      agent_wpm: agentWpm,
      customer_wpm: customerWpm,
      pace: agentPace,
      agent_pace: agentPace,
      customer_pace: customerPace,
      engagement: {
        agent_talk_pct: data.agent_speaking_pct || 0,
        customer_talk_pct: data.customer_speaking_pct || 0,
        dominant_speaker: data.dominant_speaker || 'agent',
        turn_count: (data.agent_turn_count || 0) + (data.customer_turn_count || 0),
      },
      tone_keywords: null,
      clarity: null,
      note: 'CPA pre-screen only — tone and clarity require full AI analysis',
    },
    duration_assessment: {
      assessment: (data.audio_duration_s || data.call_duration_seconds || 0) >= 120 ? 'appropriate' : 'short',
      agent_speaking_pct: data.agent_speaking_pct || 0,
    },

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
                    {"name": "Authorization", "value": '={{ "Bearer " + $env.RUNPOD_API_KEY }}'},
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
    - Route Decision flipped (pass → forward, fail → store)
    - Forward-to-pipeline code for PASS path
    - Enriched store code for FAIL path
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
            updated.append(f"{name} -> v5.0")

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

    if not updated:
        print("  WARNING: No nodes were updated!")
        return None

    for u in updated:
        print(f"  Updated: {u}")

    if dry_run:
        print(f"\n  [DRY RUN] Would update {len(updated)} nodes. No changes made.")
        out_path = SCRIPTS_DIR.parent / ".n8n-snapshots" / "cpa-callback-preview.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        preview = {
            "name": workflow.get("name"),
            "nodes": workflow["nodes"],
            "connections": workflow.get("connections", {}),
            "settings": workflow.get("settings", {}),
        }
        out_path.write_text(json.dumps(preview, indent=2))
        print(f"  Preview saved to: {out_path}")
        return None

    # 3. PUT it back (strip to required fields only)
    print("  Deploying updated callback workflow...")
    payload = {
        "name": workflow.get("name", "CPA Callback Processor"),
        "nodes": workflow["nodes"],
        "connections": workflow.get("connections", {}),
        "settings": workflow.get("settings", {}),
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
