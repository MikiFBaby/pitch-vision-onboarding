/**
 * CPA Filter (Compliance Pre-Audit) — n8n Code Node
 * Version: 1.0
 *
 * Lightweight pre-gate for Medicare calls. Checks 3 things before AI analysis:
 *   1. Medicare Parts A & B confirmation (agent asked + customer affirmed)
 *   2. Red/White/Blue card confirmation (agent asked + customer affirmed)
 *   3. Verbal consent to transfer (customer agreed or implied consent)
 *
 * Non-Medicare calls pass through with cpa_status = 'n/a'.
 * CPA does NOT block AI analysis — it adds a fast-flag for QA prioritization.
 *
 * Input:  $json (from previous node) with:
 *   - mergedTranscript: string (full formatted transcript)
 *   - agentText: string (agent-only speech)
 *   - customerText: string (customer-only speech)
 *   - segments: array (timestamped segments with speaker labels)
 *   - productType: string ('MEDICARE', 'ACA', 'WHATIF', 'UNKNOWN')
 *   - laStartedAt: number (seconds when LA joined, or 0/null)
 *
 * Output: Same $json + { cpa_status, cpa_findings, cpa_confidence, cpa_details }
 */

// ─── Configuration ──────────────────────────────────────────────────

const PROXIMITY_WINDOW_SEC = 45; // Customer must respond within 45s of agent question

// ─── Affirmative patterns (customer says yes) ───────────────────────

const AFFIRMATIVE_PATTERNS = [
  /\b(?:yes|yeah|yep|yup|uh-huh|mm-hmm|mhm|correct|that's right|that is right|right|i do|i have|i am|sure|absolutely|definitely|of course)\b/i,
  /\b(?:positive|affirmative)\b/i,
];

// ─── Negative patterns (customer says no) ───────────────────────────

const NEGATIVE_PATTERNS = [
  /\b(?:no|nope|nah|i don't|i do not|not really|i'm not sure|i don't think so|negative)\b/i,
];

// ─── Check 1: Medicare Parts A & B ──────────────────────────────────

const MEDICARE_AB_AGENT_PATTERNS = [
  /(?:do you|you do|you still)\s+(?:have|got)\s+(?:both\s+)?(?:your\s+)?(?:medicare\s+)?part\s*a\s*(?:and|&)\s*(?:part\s*)?b/i,
  /(?:part\s*a\s*(?:and|&)\s*(?:part\s*)?b)/i,
  /(?:medicare\s+parts?\s+a\s+(?:and|&)\s+b)/i,
  /(?:both\s+parts?\s+of\s+(?:your\s+)?medicare)/i,
  /(?:original\s+medicare)/i,
  /(?:you(?:'re| are)\s+on\s+medicare\s+part\s+a\s+(?:and|&)\s+b)/i,
  /(?:have\s+your\s+part\s+a\s+(?:and|&)\s+(?:part\s+)?b)/i,
];

// ─── Check 2: Red, White, Blue Card ────────────────────────────────

const RWB_CARD_AGENT_PATTERNS = [
  /red[,\s]*white[,\s]*(?:and\s+)?blue\s+(?:medicare\s+)?card/i,
  /(?:that\s+is\s+the|that's\s+the)\s+red[,\s]*white[,\s]*(?:and\s+)?blue/i,
  /original\s+medicare\s+card/i,
  /(?:red\s+white\s+(?:and\s+)?blue)/i,
  /(?:rwb|r\.w\.b\.)\s+card/i,
  /double\s+confirm.*(?:red|card)/i,
  /just\s+to\s+(?:double\s+)?confirm.*card/i,
];

// ─── Check 3: Transfer Consent ─────────────────────────────────────

const TRANSFER_CONSENT_AGENT_PATTERNS = [
  /(?:can i|let me|i'm going to|i'd like to|may i)\s+(?:transfer|connect|put you through|bring|get you (?:over|connected))/i,
  /(?:okay|alright|sound good)\s+(?:to|if i)\s+(?:transfer|connect)/i,
  /(?:speak|talk)\s+with\s+(?:a\s+|my\s+)?(?:licensed\s+agent|specialist|coordinator|supervisor)/i,
  /(?:someone|specialist|agent)\s+(?:will|is going to)\s+(?:join|come on|be with|assist)/i,
  /(?:going to|gonna)\s+(?:bring|get|grab)\s+(?:a\s+|my\s+)?(?:specialist|coordinator|someone)/i,
  /(?:connecting|transferring)\s+(?:you|us)\s+(?:now|to)/i,
  /(?:i'll|let me)\s+(?:bring|get|have)\s+(?:someone|my|a)\s+(?:specialist|agent|coordinator)/i,
];

// ─── Segment Analysis ───────────────────────────────────────────────

/**
 * Parse transcript into timestamped segments.
 * Expected format: "[MM:SS] Speaker: text" per line
 */
function parseSegments(transcript) {
  if (!transcript) return [];

  const lines = transcript.split('\n').filter(l => l.trim());
  const segments = [];

  for (const line of lines) {
    const match = line.match(/^\[(\d+):(\d+)\]\s*(Agent|Customer|Prospect|AGENT|CUSTOMER|PROSPECT|Speaker\s*\d*):\s*(.+)$/i);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const speaker = match[3].toLowerCase();
      const text = match[4].trim();

      segments.push({
        timeSeconds: minutes * 60 + seconds,
        speaker: speaker.includes('agent') || speaker.includes('rep') ? 'agent' : 'customer',
        text,
      });
    }
  }

  return segments;
}

/**
 * Check if customer affirmed within PROXIMITY_WINDOW_SEC after an agent question.
 * Returns { found: boolean, agentEvidence, customerEvidence, confidence }
 */
function checkProximityConfirmation(segments, agentPatterns, cutoffSeconds) {
  const results = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.speaker !== 'agent') continue;
    if (cutoffSeconds && seg.timeSeconds > cutoffSeconds) break;

    // Check if agent segment matches any pattern
    const agentMatch = agentPatterns.some(p => p.test(seg.text));
    if (!agentMatch) continue;

    // Look for customer response within proximity window
    for (let j = i + 1; j < segments.length; j++) {
      const resp = segments[j];
      if (resp.timeSeconds - seg.timeSeconds > PROXIMITY_WINDOW_SEC) break;
      if (resp.speaker !== 'customer') continue;

      const isAffirmative = AFFIRMATIVE_PATTERNS.some(p => p.test(resp.text));
      const isNegative = NEGATIVE_PATTERNS.some(p => p.test(resp.text));

      if (isAffirmative && !isNegative) {
        results.push({
          found: true,
          agentEvidence: `[${Math.floor(seg.timeSeconds / 60)}:${String(seg.timeSeconds % 60).padStart(2, '0')}] ${seg.text}`,
          customerEvidence: `[${Math.floor(resp.timeSeconds / 60)}:${String(resp.timeSeconds % 60).padStart(2, '0')}] ${resp.text}`,
          confidence: 90,
        });
      }
    }
  }

  return results.length > 0
    ? results[0]
    : { found: false, agentEvidence: null, customerEvidence: null, confidence: 0 };
}

/**
 * Check for implied consent: agent asks, then proceeds without objection.
 * (Agent says "okay?", next agent line continues = implied yes)
 */
function checkImpliedConsent(segments, agentPatterns, cutoffSeconds) {
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.speaker !== 'agent') continue;
    if (cutoffSeconds && seg.timeSeconds > cutoffSeconds) break;

    const agentMatch = agentPatterns.some(p => p.test(seg.text));
    if (!agentMatch) continue;

    // Look at next segments: if no customer objection before next agent line = implied consent
    let customerObjected = false;
    let agentProceeded = false;

    for (let j = i + 1; j < segments.length && j <= i + 4; j++) {
      const next = segments[j];
      if (next.timeSeconds - seg.timeSeconds > PROXIMITY_WINDOW_SEC) break;

      if (next.speaker === 'customer') {
        const isNegative = NEGATIVE_PATTERNS.some(p => p.test(next.text));
        if (isNegative) {
          customerObjected = true;
          break;
        }
      }

      if (next.speaker === 'agent' && j > i + 0) {
        // Agent continued speaking = implied consent
        const continuePatterns = /(?:okay|perfect|great|wonderful|alright|so (?:we're|I'm)|let me|connecting)/i;
        if (continuePatterns.test(next.text)) {
          agentProceeded = true;
          break;
        }
      }
    }

    if (agentProceeded && !customerObjected) {
      return {
        found: true,
        agentEvidence: `[${Math.floor(seg.timeSeconds / 60)}:${String(seg.timeSeconds % 60).padStart(2, '0')}] ${seg.text}`,
        customerEvidence: '(implied consent — agent proceeded without objection)',
        confidence: 70,
      };
    }
  }

  return { found: false, agentEvidence: null, customerEvidence: null, confidence: 0 };
}

// ─── Main CPA Logic ─────────────────────────────────────────────────

const input = $json;

// Non-Medicare calls skip CPA entirely
const productType = (input.productType || '').toUpperCase();
if (productType !== 'MEDICARE' && productType !== 'WHATIF') {
  return {
    ...$json,
    cpa_status: 'n/a',
    cpa_findings: [],
    cpa_confidence: 100,
    cpa_details: { reason: 'Non-Medicare call — CPA not applicable' },
  };
}

// Parse transcript into segments
const segments = input.segments && input.segments.length > 0
  ? input.segments.map(s => ({
      timeSeconds: s.start || s.time_seconds || 0,
      speaker: (s.speaker || '').toLowerCase().includes('agent') ? 'agent' : 'customer',
      text: s.text || '',
    }))
  : parseSegments(input.mergedTranscript || '');

// Pre-transfer cutoff: only check before LA joined
const cutoffSeconds = input.laStartedAt || null;

// ─── Run 3 checks ───────────────────────────────────────────────────

const findings = [];
const details = {};
let totalConfidence = 0;
let checksRun = 0;

// Check 1: Medicare A&B
const abResult = checkProximityConfirmation(segments, MEDICARE_AB_AGENT_PATTERNS, cutoffSeconds);
if (!abResult.found) {
  // Try text-level fallback (agent text + customer text without timestamps)
  const agentMentionsAB = MEDICARE_AB_AGENT_PATTERNS.some(p => p.test(input.agentText || ''));
  const customerConfirmsAB = AFFIRMATIVE_PATTERNS.some(p => p.test(input.customerText || ''));

  if (agentMentionsAB && customerConfirmsAB) {
    abResult.found = true;
    abResult.confidence = 60; // Lower confidence — no proximity check
    abResult.agentEvidence = '(detected in agent text, no timestamp proximity)';
    abResult.customerEvidence = '(affirmative found in customer text)';
  }
}

details.medicare_ab = abResult;
if (!abResult.found) {
  findings.push('medicare_ab');
}
totalConfidence += abResult.found ? abResult.confidence : 20;
checksRun++;

// Check 2: Red/White/Blue Card
const rwbResult = checkProximityConfirmation(segments, RWB_CARD_AGENT_PATTERNS, cutoffSeconds);
if (!rwbResult.found) {
  const agentMentionsRWB = RWB_CARD_AGENT_PATTERNS.some(p => p.test(input.agentText || ''));
  const customerConfirmsRWB = AFFIRMATIVE_PATTERNS.some(p => p.test(input.customerText || ''));

  if (agentMentionsRWB && customerConfirmsRWB) {
    rwbResult.found = true;
    rwbResult.confidence = 60;
    rwbResult.agentEvidence = '(detected in agent text, no timestamp proximity)';
    rwbResult.customerEvidence = '(affirmative found in customer text)';
  }
}

details.rwb_card = rwbResult;
if (!rwbResult.found) {
  findings.push('rwb_card');
}
totalConfidence += rwbResult.found ? rwbResult.confidence : 20;
checksRun++;

// Check 3: Transfer Consent
let consentResult = checkProximityConfirmation(segments, TRANSFER_CONSENT_AGENT_PATTERNS, cutoffSeconds);
if (!consentResult.found) {
  // Try implied consent
  consentResult = checkImpliedConsent(segments, TRANSFER_CONSENT_AGENT_PATTERNS, cutoffSeconds);
}
if (!consentResult.found) {
  // Text-level fallback
  const agentAsksTransfer = TRANSFER_CONSENT_AGENT_PATTERNS.some(p => p.test(input.agentText || ''));
  const customerConsents = AFFIRMATIVE_PATTERNS.some(p => p.test(input.customerText || ''));

  if (agentAsksTransfer && customerConsents) {
    consentResult.found = true;
    consentResult.confidence = 55;
    consentResult.agentEvidence = '(transfer request in agent text)';
    consentResult.customerEvidence = '(affirmative in customer text)';
  }
}

details.transfer_consent = consentResult;
if (!consentResult.found) {
  findings.push('transfer_consent');
}
totalConfidence += consentResult.found ? consentResult.confidence : 20;
checksRun++;

// ─── Determine CPA status ───────────────────────────────────────────

const avgConfidence = Math.round(totalConfidence / checksRun);
const cpaStatus = findings.length === 0 ? 'pass' : 'fail';

return {
  ...$json,
  cpa_status: cpaStatus,
  cpa_findings: findings,
  cpa_confidence: avgConfidence,
  cpa_details: details,
};
