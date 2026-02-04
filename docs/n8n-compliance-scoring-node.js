/**
 * N8N Code Node: Compliance Scoring & Evidence Extraction
 * Version: 2.0.0
 *
 * PURPOSE: Post-process AI analysis to add deterministic scoring
 * INSERT AFTER: AI Agent analysis node
 * INSERT BEFORE: Supabase insert node
 *
 * MODE: Run Once for All Items
 *
 * This node:
 * 1. Detects campaign type (ACA/Medicare/WHATIF)
 * 2. Applies correct script template per campaign
 * 3. Calculates real script adherence score (0-100)
 * 4. Detects empathy phrases
 * 5. Extracts evidence with timestamps
 * 6. Validates ALL 14 auto-fail violations (AF-01 through AF-14)
 * 7. Marks AF-13 as warning (not auto-fail)
 * 8. Triggers auto-fail for critical checklist item failures
 *
 * CHANGELOG v2.0.0:
 * - Added missing AF codes: AF-02, AF-05, AF-06, AF-08, AF-10
 * - Fixed campaign detection logic
 * - Expanded BANNED_TERMS from Master Knowledge Base
 * - Added critical checklist failure → auto-fail logic
 * - Fixed parseTimeToSeconds edge cases
 * - Improved response handling score logic
 * - Normalized status values (PASS/met/pass → PASS)
 */

const items = $input.all();
const input = items[0]?.json || {};

// Get transcript and existing analysis
const transcript = input.transcript || '';
const existingAnalysis = input.analysis || input.call_analysis || {};
const productType = (input.product_type || input.productType || existingAnalysis.campaign || 'ACA').toUpperCase();

// ============================================================
// COMPLIANCE RULES (from PitchPerfect_MasterKB_Complete.pdf)
// ============================================================

const SCRIPT_TEMPLATES = {
  ACA: {
    target: "18+ without Medicare, Medicaid, or employer insurance",
    keyPhrases: [
      { phrase: "recorded line", required: true, order: 1, variations: ["recorded call", "call is recorded", "on a recorded", "call is being recorded"] },
      { phrase: "free health", required: true, order: 2, variations: ["government subsidy", "health subsidy", "free health government subsidy"] },
      { phrase: "affordable care act", required: true, order: 3, variations: ["aca", "obamacare"] },
      { phrase: "medicare or medicaid or work insurance", required: true, order: 4, variations: ["medicare, medicaid", "don't have medicare", "no medicare", "do not have medicare"] },
      { phrase: "still living in", required: true, order: 5, variations: ["state of", "you're in", "residing in", "located in"] },
      { phrase: "just to be sure", required: true, order: 6, variations: ["just to confirm", "double check", "to confirm", "just to double check"] },
      { phrase: "filed taxes", required: true, order: 7, variations: ["tax return", "past two years", "last two years"] },
      { phrase: "may qualify", required: true, order: 8, variations: ["might qualify", "may be eligible", "see what you may"] }
    ],
    checklist: [
      { order: 1, key: "client_name_confirmation", name: "Confirm Client Name", weight: 12 },
      { order: 2, key: "agent_introduction", name: "Agent Introduction", weight: 10 },
      { order: 3, key: "company_name", name: "Company Name Stated", weight: 12, validNames: ["america's health", "americas health", "benefit link", "health benefit guide"] },
      { order: 4, key: "recorded_line_disclosure", name: "Recorded Line Disclosure", weight: 14, critical: true },
      { order: 5, key: "subsidy_mention", name: "FREE Health Subsidy/ACA Mention", weight: 10 },
      { order: 6, key: "mmw_check_first", name: "No M/M/W Check (First)", weight: 12, critical: true, requiresCustomerResponse: true },
      { order: 7, key: "state_confirmation", name: "State Confirmation", weight: 10 },
      { order: 8, key: "mmw_check_second", name: "No M/M/W Check (Second)", weight: 14, critical: true, requiresCustomerResponse: true },
      { order: 9, key: "tax_filing_question", name: "Tax Filing Question", weight: 8, requiresCustomerResponse: true },
      { order: 10, key: "verbal_consent_to_transfer", name: "Verbal Consent to Transfer", weight: 8, critical: true, requiresCustomerResponse: true },
      { order: 11, key: "cold_transfer", name: "Cold Transfer Execution", weight: 6 }
    ]
  },
  MEDICARE: {
    target: "65+ with Medicare Part A AND Part B",
    keyPhrases: [
      { phrase: "recorded line", required: true, order: 1, variations: ["recorded call", "on a recorded", "call is being recorded"] },
      { phrase: "food and utility card", required: true, order: 2, variations: ["food card", "utility card", "benefits card", "grocery card"] },
      { phrase: "medicare parts a and b", required: true, order: 3, variations: ["part a and part b", "medicare a and b", "parts a and b"] },
      { phrase: "red, white, and blue", required: true, order: 4, variations: ["red white and blue", "rwb card", "red, white and blue card"] },
      { phrase: "additional food benefits", required: true, order: 5, variations: ["food benefits", "grocery benefits"] },
      { phrase: "food prices", required: false, order: 6, variations: ["prices have gone up", "rising food prices"] },
      { phrase: "zip code", required: true, order: 7, variations: ["your zip", "zipcode"] },
      { phrase: "medicare specialist", required: true, order: 8, variations: ["specialist coming on", "specialist is coming"] },
      { phrase: "hear a little bit of ringing", required: false, order: 9, variations: ["hear some ringing", "hear ringing"] }
    ],
    checklist: [
      { order: 1, key: "client_name_confirmation", name: "Confirm Client Name", weight: 12 },
      { order: 2, key: "agent_introduction", name: "Agent Introduction", weight: 10 },
      { order: 3, key: "company_name", name: "Company Name Stated", weight: 12, validNames: ["america's health", "americas health"] },
      { order: 4, key: "recorded_line_disclosure", name: "Recorded Line Disclosure", weight: 14, critical: true },
      { order: 5, key: "food_utility_card_mention", name: "Food/Utility Card Mention", weight: 10 },
      { order: 6, key: "medicare_ab_verification", name: "Medicare Part A & B Verification", weight: 14, critical: true, requiresCustomerResponse: true },
      { order: 7, key: "rwb_card_verification", name: "Red, White, Blue Card Question", weight: 12, critical: true, requiresCustomerResponse: true },
      { order: 8, key: "state_zipcode_confirmation", name: "State AND Zip Code Confirmation", weight: 12 },
      { order: 9, key: "food_benefits_mention", name: "Additional Food Benefits Mention", weight: 8 },
      { order: 10, key: "verbal_consent_to_transfer", name: "Verbal Consent to Transfer", weight: 8, critical: true, requiresCustomerResponse: true },
      { order: 11, key: "cold_transfer", name: "Cold Transfer Explanation", weight: 6 }
    ]
  }
};

// WHATIF uses Medicare rules
SCRIPT_TEMPLATES.WHATIF = SCRIPT_TEMPLATES.MEDICARE;

// ============================================================
// AUTO-FAIL VIOLATIONS (ALL 14 from Master Knowledge Base)
// ============================================================

const AUTO_FAIL_PATTERNS = {
  'AF-01': {
    name: 'Making Promises',
    description: 'Do not imply eligibility, qualification, or benefits',
    triggers: [
      "you will get", "you will receive", "you're going to get", "you're entitled to",
      "you are entitled to", "you qualify for", "you are qualified", "you're qualified",
      "guaranteed to", "i guarantee", "we guarantee", "definitely get", "definitely receive",
      "for sure get", "100% get", "will definitely", "you're approved", "you are approved",
      "you've been approved"
    ],
    safeExceptions: [
      "you may qualify", "you may be eligible", "you may be entitled", "you might qualify",
      "see what you may", "see if you qualify", "see what's available", "we can review", "let's see if"
    ],
    severity: 'critical'
  },
  'AF-02': {
    name: 'Skipping Compliance',
    description: 'All required compliance steps must be followed',
    // Detection handled via checklist validation, not patterns
    triggers: [],
    safeExceptions: [],
    severity: 'critical',
    detectionMethod: 'checklist_completion'
  },
  'AF-03': {
    name: 'Discussing Money',
    description: 'Do not mention income, expenses, payments, or financial benefits',
    triggers: [
      "how much money", "save you money", "save money", "cost you", "pay you",
      "payment", "cash back", "cash benefit", "dollar amount", "how much do you make",
      "your income", "what's your income", "annual income", "monthly income"
    ],
    safeExceptions: ["benefits", "food benefits", "health benefits", "subsidy", "assistance", "support"],
    severity: 'critical'
  },
  'AF-04': {
    name: 'Discussing Politics/Religion',
    description: 'Avoid topics like government, presidents, or faith',
    triggers: [
      "trump", "biden", "obama", "republican", "democrat", "political", "vote", "election",
      "god bless", "praise god", "church", "jesus", "pray", "amen"
    ],
    safeExceptions: ["government subsidy", "government program", "government benefits"],
    severity: 'critical'
  },
  'AF-05': {
    name: 'Incorrect Transfers',
    description: 'Do not transfer gatekeepers or non-English speakers without verified POA',
    triggers: [
      "speaking on behalf", "i'm their son", "i'm their daughter", "i'm his son", "i'm her son",
      "i'm his daughter", "i'm her daughter", "i'm the caregiver", "power of attorney",
      "they don't speak english", "no habla", "no english", "doesn't speak english",
      "can't speak english", "i'm calling for", "calling on behalf"
    ],
    safeExceptions: [],
    severity: 'critical'
  },
  'AF-06': {
    name: 'Unconfirmed Compliance',
    description: 'All compliance questions must be answered and confirmed by prospect',
    // Detection handled via customer response check
    triggers: [],
    safeExceptions: [],
    severity: 'critical',
    detectionMethod: 'customer_response_check'
  },
  'AF-07': {
    name: 'Wrong Disposition',
    description: 'Do not code incorrectly (e.g., AM as transfer)',
    // Detection requires disposition data comparison - handled by n8n workflow
    triggers: [],
    safeExceptions: [],
    severity: 'critical',
    detectionMethod: 'disposition_validation'
  },
  'AF-08': {
    name: 'No-Response Transfer',
    description: 'Do not proceed or transfer without prospect responses',
    triggers: [
      "hello?", "are you there?", "can you hear me?", "anyone there?",
      "is anyone there", "are you still there"
    ],
    safeExceptions: [],
    severity: 'critical',
    // Also check for lack of customer responses
    additionalCheck: 'customer_engagement'
  },
  'AF-09': {
    name: 'Ignoring DNC Requests',
    description: 'If prospect asks to be Do-Not-Called, end call immediately',
    triggers: [
      "do not call", "don't call me", "stop calling", "take me off", "remove me",
      "dnc", "never call again", "quit calling", "don't call again", "stop calling me"
    ],
    safeExceptions: [],
    severity: 'critical'
  },
  'AF-10': {
    name: 'Transferring DQ Prospects',
    description: 'Do not transfer prospects who are ineligible',
    // ACA DQ indicators
    acaDisqualifiers: [
      "i have medicare", "i'm on medicare", "i have medicaid", "i'm on medicaid",
      "my job provides", "employer insurance", "work insurance", "i have work insurance",
      "veteran", "va benefits", "military insurance", "ssdi", "disability insurance",
      "under 18", "i'm 17", "i'm 16"
    ],
    // Medicare DQ indicators
    medicareDisqualifiers: [
      "i don't have medicare", "no medicare", "not on medicare",
      "only part a", "only part b", "just part a", "just part b"
    ],
    safeExceptions: [],
    severity: 'critical'
  },
  'AF-11': {
    name: 'Misrepresenting Affiliation',
    description: 'Do not claim partnership with specific insurance companies',
    triggers: [
      "we're with blue cross", "calling from aetna", "calling from united",
      "calling from humana", "cigna representative", "we partner with",
      "affiliated with", "from blue shield", "from kaiser"
    ],
    safeExceptions: [],
    severity: 'critical'
  },
  'AF-12': {
    name: 'Incorrect Insurance Messaging',
    description: '"This call is not about insurance" or "You will not change your insurance"',
    triggers: [
      "not about insurance", "nothing to do with insurance", "won't change your insurance",
      "won't affect your insurance", "keep your same insurance", "this isn't about insurance"
    ],
    safeExceptions: [],
    severity: 'critical'
  },
  'AF-13': {
    name: 'Poor Call Quality',
    description: 'Do not transfer if call audio is unclear or breaking up',
    triggers: [
      "can't hear you", "you're breaking up", "bad connection", "call is cutting out",
      "audio is choppy", "can barely hear", "very hard to hear"
    ],
    safeExceptions: [],
    severity: 'warning' // NOT an auto-fail, just a warning
  },
  'AF-14': {
    name: 'Poor Prospect State',
    description: 'Do not proceed if prospect is busy, distracted, angry, or shouting',
    triggers: [
      "i'm busy", "not a good time", "call me back", "in the middle of something",
      "stop calling", "leave me alone", "this is harassment", "i'm at work",
      "can't talk right now", "you people keep calling"
    ],
    safeExceptions: [],
    severity: 'critical'
  }
};

// ============================================================
// BANNED TERMINOLOGY (from Master Knowledge Base page 13)
// ============================================================

const BANNED_TERMS = [
  // Absolutely banned
  { term: "pitch perfect", replacement: "Use DBA name for campaign", severity: 'critical' },
  { term: "pitch perfect solutions", replacement: "Use DBA name for campaign", severity: 'critical' },

  // Contextually banned - money-related
  { term: "money", replacement: "benefits", severity: 'warning', context: 'financial' },
  { term: "cash", replacement: "incentives", severity: 'warning', context: 'financial' },
  { term: "check", replacement: "support", severity: 'warning', context: 'financial' },
  { term: "funds", replacement: "assistance", severity: 'warning', context: 'financial' },

  // Contextually banned - promise-related (overlap with AF-01 but for terminology scoring)
  { term: "you qualify", replacement: "you MAY be eligible", severity: 'warning', context: 'promise' },
  { term: "guaranteed", replacement: "we can review", severity: 'warning', context: 'promise' },
  { term: "approved", replacement: "see what's available", severity: 'warning', context: 'promise' },
  { term: "you will get", replacement: "you MAY receive", severity: 'warning', context: 'promise' }
];

// Empathy detection patterns
const EMPATHY_PATTERNS = [
  "i understand", "i hear you", "that makes sense", "i appreciate",
  "thank you for", "i'm sorry to hear", "i can help", "let me help",
  "no problem", "absolutely", "of course", "great question",
  "that's a great question"
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// Parse transcript into lines with timestamps
function parseTranscriptLines(transcript) {
  const lines = [];
  const lineRegex = /\[(\d{1,2}:\d{2})\]\s*(Agent|Customer):\s*(.+)/gi;
  let match;

  while ((match = lineRegex.exec(transcript)) !== null) {
    lines.push({
      timestamp: match[1],
      speaker: match[2].toLowerCase(),
      text: match[3].trim(),
      seconds: parseTimeToSeconds(match[1])
    });
  }

  return lines;
}

// Convert MM:SS to seconds (with edge case handling)
function parseTimeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return 0;
  const mins = parseInt(parts[0], 10) || 0;
  const secs = parseInt(parts[1], 10) || 0;
  return mins * 60 + secs;
}

// Convert seconds to MM:SS
function formatTimestamp(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Find phrase in transcript with timestamp
function findPhraseInTranscript(transcript, lines, phrase, variations = []) {
  const searchTerms = [phrase, ...variations];
  const lowerTranscript = transcript.toLowerCase();

  for (const term of searchTerms) {
    const termLower = term.toLowerCase();
    if (lowerTranscript.includes(termLower)) {
      // Find the line containing this phrase
      for (const line of lines) {
        if (line.text.toLowerCase().includes(termLower)) {
          return {
            found: true,
            timestamp: line.timestamp,
            speaker: line.speaker,
            evidence: `[${line.timestamp}] ${line.speaker}: "${line.text.substring(0, 100)}${line.text.length > 100 ? '...' : ''}"`
          };
        }
      }
      // Found in transcript but no line match (might be split across lines)
      return { found: true, timestamp: null, speaker: null, evidence: `Contains: "${term}"` };
    }
  }

  return { found: false, timestamp: null, speaker: null, evidence: null };
}

// Normalize status values to consistent format
function normalizeStatus(status) {
  if (!status) return 'FAIL';
  const s = status.toString().toLowerCase().trim();
  if (s === 'pass' || s === 'met' || s === 'yes' || s === 'true' || s === '1') return 'PASS';
  if (s === 'n/a' || s === 'na' || s === 'not applicable') return 'N/A';
  return 'FAIL';
}

// Check if customer responded affirmatively near a question
function checkCustomerResponse(transcriptLines, questionIndex, expectedResponses = ['yes', 'yeah', 'correct', 'right', 'okay', 'ok', 'no', 'nope', 'uh-huh', 'mhm']) {
  // Look at next 3 customer lines after the question
  let customerResponseCount = 0;
  for (let i = questionIndex + 1; i < transcriptLines.length && customerResponseCount < 3; i++) {
    const line = transcriptLines[i];
    if (line.speaker === 'customer') {
      customerResponseCount++;
      const lowerText = line.text.toLowerCase();
      for (const response of expectedResponses) {
        if (lowerText.includes(response)) {
          return { responded: true, response: line.text, timestamp: line.timestamp };
        }
      }
    }
  }
  return { responded: false, response: null, timestamp: null };
}

// ============================================================
// MAIN PROCESSING
// ============================================================

// Determine campaign (simplified logic)
const campaign = ['WHATIF', 'MEDICARE'].includes(productType) ? 'MEDICARE' : 'ACA';
const scriptTemplate = SCRIPT_TEMPLATES[campaign] || SCRIPT_TEMPLATES.ACA;

// Parse transcript
const transcriptLines = parseTranscriptLines(transcript);
const lowerTranscript = transcript.toLowerCase();
const agentLines = transcriptLines.filter(l => l.speaker === 'agent');
const customerLines = transcriptLines.filter(l => l.speaker === 'customer');

// ============================================================
// 1. SCRIPT ADHERENCE CALCULATION
// ============================================================

const scriptAdherence = {
  score: 0,
  level: 'low',
  key_phrases_found: [],
  key_phrases_missing: [],
  sequence_correct: true,
  terminology_issues: [],
  calculation: {
    phrase_match_score: 0,
    sequence_score: 0,
    response_handling_score: 0,
    terminology_score: 0
  }
};

// Step 1: Key Phrase Matching (40%)
let phrasesFound = 0;
let requiredPhrases = 0;
let lastFoundOrder = 0;
let sequenceViolations = 0;

for (const phrase of scriptTemplate.keyPhrases) {
  if (phrase.required) requiredPhrases++;

  const result = findPhraseInTranscript(transcript, transcriptLines, phrase.phrase, phrase.variations || []);

  if (result.found) {
    phrasesFound++;
    scriptAdherence.key_phrases_found.push({
      phrase: phrase.phrase,
      order: phrase.order,
      timestamp: result.timestamp,
      evidence: result.evidence
    });

    // Check sequence
    if (phrase.order < lastFoundOrder) {
      sequenceViolations++;
    }
    lastFoundOrder = Math.max(lastFoundOrder, phrase.order);
  } else if (phrase.required) {
    scriptAdherence.key_phrases_missing.push(phrase.phrase);
  }
}

const phraseMatchScore = requiredPhrases > 0 ? (phrasesFound / requiredPhrases) * 40 : 0;
scriptAdherence.calculation.phrase_match_score = Math.round(phraseMatchScore);

// Step 2: Sequence Order (20%)
scriptAdherence.sequence_correct = sequenceViolations === 0;
const sequenceScore = sequenceViolations === 0 ? 20 : Math.max(0, 20 - (sequenceViolations * 5));
scriptAdherence.calculation.sequence_score = sequenceScore;

// Step 3: Customer Response Handling (20%) - IMPROVED
let responseHandlingScore = 20;
const criticalQuestionsAsked = agentLines.filter(l =>
  l.text.includes('?') && (
    l.text.toLowerCase().includes('medicare') ||
    l.text.toLowerCase().includes('medicaid') ||
    l.text.toLowerCase().includes('work insurance') ||
    l.text.toLowerCase().includes('okay') ||
    l.text.toLowerCase().includes('correct')
  )
).length;

// Check if customers are actually responding
if (customerLines.length === 0) {
  responseHandlingScore = 0; // No customer engagement at all
} else if (criticalQuestionsAsked > 0) {
  // Calculate response ratio for critical questions
  const responseRatio = Math.min(customerLines.length / criticalQuestionsAsked, 1);
  responseHandlingScore = Math.round(responseRatio * 20);
}
scriptAdherence.calculation.response_handling_score = responseHandlingScore;

// Step 4: Terminology Compliance (20%)
let terminologyScore = 20;

// Check for banned terms
for (const banned of BANNED_TERMS) {
  if (lowerTranscript.includes(banned.term.toLowerCase())) {
    // Check if it's in a safe context
    let isSafe = false;

    // For financial terms, check if used correctly
    if (banned.context === 'financial') {
      // Only flag if agent said it (not customer)
      const agentSaidIt = agentLines.some(l => l.text.toLowerCase().includes(banned.term.toLowerCase()));
      if (!agentSaidIt) isSafe = true;
    }

    if (!isSafe) {
      scriptAdherence.terminology_issues.push({
        term: banned.term,
        replacement: banned.replacement,
        severity: banned.severity
      });
      terminologyScore -= banned.severity === 'critical' ? 10 : 5;
    }
  }
}

scriptAdherence.calculation.terminology_score = Math.max(0, terminologyScore);

// Calculate final script adherence score
scriptAdherence.score = Math.round(
  scriptAdherence.calculation.phrase_match_score +
  scriptAdherence.calculation.sequence_score +
  scriptAdherence.calculation.response_handling_score +
  scriptAdherence.calculation.terminology_score
);

// Determine level
if (scriptAdherence.score >= 80) {
  scriptAdherence.level = 'high';
} else if (scriptAdherence.score >= 60) {
  scriptAdherence.level = 'moderate';
} else {
  scriptAdherence.level = 'low';
}

// ============================================================
// 2. EMPATHY DETECTION
// ============================================================

const empathyResult = {
  displayed: false,
  phrases_found: [],
  score: 0
};

for (const pattern of EMPATHY_PATTERNS) {
  for (const line of agentLines) {
    if (line.text.toLowerCase().includes(pattern)) {
      empathyResult.displayed = true;
      empathyResult.phrases_found.push({
        phrase: pattern,
        timestamp: line.timestamp,
        context: line.text.substring(0, 80)
      });
      empathyResult.score += 10;
      break; // Only count each pattern once
    }
  }
}

empathyResult.score = Math.min(100, empathyResult.score);

// ============================================================
// 3. AUTO-FAIL VIOLATION DETECTION (ALL 14 CODES)
// ============================================================

const autoFailViolations = [];
const warningViolations = [];
let hasCriticalViolation = false;

for (const [code, pattern] of Object.entries(AUTO_FAIL_PATTERNS)) {
  // Skip patterns that use alternative detection methods
  if (pattern.detectionMethod === 'disposition_validation') continue;

  // Handle AF-10 separately (campaign-specific DQ detection)
  if (code === 'AF-10') {
    const dqPatterns = campaign === 'ACA' ? pattern.acaDisqualifiers : pattern.medicareDisqualifiers;
    if (dqPatterns) {
      for (const trigger of dqPatterns) {
        if (lowerTranscript.includes(trigger.toLowerCase())) {
          // Check if customer said it (they're DQ'd) but agent still transferred
          const customerSaidIt = customerLines.some(l => l.text.toLowerCase().includes(trigger.toLowerCase()));
          // Check if transfer happened after
          const transferMentioned = lowerTranscript.includes('transfer') || lowerTranscript.includes('connect you');

          if (customerSaidIt && transferMentioned) {
            let evidence = null;
            let timestamp = null;
            for (const line of customerLines) {
              if (line.text.toLowerCase().includes(trigger.toLowerCase())) {
                evidence = line.text;
                timestamp = line.timestamp;
                break;
              }
            }

            autoFailViolations.push({
              code: code,
              violation: pattern.name,
              description: pattern.description,
              trigger: trigger,
              timestamp: timestamp,
              evidence: evidence || `Customer indicated: "${trigger}"`,
              speaker: 'customer',
              severity: 'critical'
            });
            hasCriticalViolation = true;
            break;
          }
        }
      }
    }
    continue;
  }

  // Handle AF-08 additional check for customer engagement
  if (code === 'AF-08' && pattern.additionalCheck === 'customer_engagement') {
    if (customerLines.length === 0 && agentLines.length > 3) {
      autoFailViolations.push({
        code: code,
        violation: pattern.name,
        description: 'No customer responses detected in transcript',
        trigger: 'No customer engagement',
        timestamp: null,
        evidence: 'Transcript shows agent speaking but no customer responses',
        speaker: 'system',
        severity: 'critical'
      });
      hasCriticalViolation = true;
    }
  }

  // Standard pattern-based detection
  for (const trigger of pattern.triggers) {
    const triggerLower = trigger.toLowerCase();

    if (lowerTranscript.includes(triggerLower)) {
      let isSafe = false;

      for (const safe of pattern.safeExceptions || []) {
        if (lowerTranscript.includes(safe.toLowerCase())) {
          isSafe = true;
          break;
        }
      }

      if (!isSafe) {
        // Find the specific line
        let evidence = null;
        let timestamp = null;
        let speaker = null;

        for (const line of transcriptLines) {
          if (line.text.toLowerCase().includes(triggerLower)) {
            evidence = line.text;
            timestamp = line.timestamp;
            speaker = line.speaker;
            break;
          }
        }

        const violation = {
          code: code,
          violation: pattern.name,
          description: pattern.description,
          trigger: trigger,
          timestamp: timestamp,
          evidence: evidence || `Transcript contains: "${trigger}"`,
          speaker: speaker || 'unknown',
          severity: pattern.severity
        };

        if (pattern.severity === 'warning') {
          warningViolations.push(violation);
        } else {
          autoFailViolations.push(violation);
          hasCriticalViolation = true;
        }

        break; // Only report each violation type once
      }
    }
  }
}

// ============================================================
// 4. CHECKLIST EVIDENCE EXTRACTION
// ============================================================

const enhancedChecklist = [];
const existingChecklist = existingAnalysis.checklist || [];
let criticalItemsFailed = [];

for (const item of scriptTemplate.checklist) {
  // Find existing AI analysis for this item
  const existingItem = existingChecklist.find(c =>
    c.name?.toLowerCase().includes(item.name.toLowerCase().split(' ')[0]) ||
    c.key === item.key
  );

  let status = normalizeStatus(existingItem?.status);
  let evidence = existingItem?.evidence || 'No clear evidence found';
  let timestamp = existingItem?.time || existingItem?.timestamp || null;
  let confidence = existingItem?.confidence || 50;

  // Try to find evidence if missing
  if (evidence === 'No clear evidence found' || !timestamp) {
    let searchPatterns = [];

    switch (item.key) {
      case 'client_name_confirmation':
        searchPatterns = ['hi ', 'hello ', 'good morning', 'good afternoon', 'speaking with', 'is this'];
        break;
      case 'agent_introduction':
        searchPatterns = ['my name is', "this is ", "i'm ", "it's "];
        break;
      case 'company_name':
        searchPatterns = item.validNames || ["america's health", "benefit link"];
        break;
      case 'recorded_line_disclosure':
        searchPatterns = ['recorded line', 'recorded call', 'call is recorded'];
        break;
      case 'mmw_check_first':
      case 'mmw_check_second':
        searchPatterns = ['medicare', 'medicaid', 'work insurance', 'employer insurance'];
        break;
      case 'state_confirmation':
        searchPatterns = ['living in', 'state of', "you're in", 'located in'];
        break;
      case 'tax_filing_question':
        searchPatterns = ['filed taxes', 'tax return'];
        break;
      case 'verbal_consent_to_transfer':
        searchPatterns = ['transfer', 'connect you', 'someone on the line', 'okay?'];
        break;
      case 'food_utility_card_mention':
        searchPatterns = ['food', 'utility', 'card'];
        break;
      case 'medicare_ab_verification':
        searchPatterns = ['part a', 'part b', 'parts a and b'];
        break;
      case 'rwb_card_verification':
        searchPatterns = ['red', 'white', 'blue'];
        break;
      case 'food_benefits_mention':
        searchPatterns = ['food benefits', 'food prices'];
        break;
      case 'subsidy_mention':
        searchPatterns = ['subsidy', 'affordable care', 'aca', 'free health'];
        break;
      case 'state_zipcode_confirmation':
        searchPatterns = ['state', 'zip', 'zipcode'];
        break;
      case 'cold_transfer':
        searchPatterns = ['everything i need', 'connecting', 'transferring', 'ringing'];
        break;
      default:
        searchPatterns = [];
    }

    for (const pattern of searchPatterns) {
      for (const line of agentLines) {
        if (line.text.toLowerCase().includes(pattern.toLowerCase())) {
          evidence = `[${line.timestamp}] Agent: "${line.text.substring(0, 100)}${line.text.length > 100 ? '...' : ''}"`;
          timestamp = line.timestamp;
          confidence = 75;
          status = 'PASS';
          break;
        }
      }
      if (timestamp) break;
    }
  }

  // Track critical item failures
  if (item.critical && status !== 'PASS') {
    criticalItemsFailed.push({
      key: item.key,
      name: item.name
    });
  }

  enhancedChecklist.push({
    order: item.order,
    key: item.key,
    name: item.name,
    status: status,
    weight: item.weight,
    critical: item.critical || false,
    requiresCustomerResponse: item.requiresCustomerResponse || false,
    evidence: evidence,
    time: timestamp,
    confidence: confidence
  });
}

// ============================================================
// 5. CHECK FOR AF-02 (Skipping Compliance) & AF-06 (Unconfirmed)
// ============================================================

// AF-02: Check if critical checklist items are missing
if (criticalItemsFailed.length > 0) {
  autoFailViolations.push({
    code: 'AF-02',
    violation: 'Skipping Compliance',
    description: 'Critical compliance steps were not completed',
    trigger: `Missing: ${criticalItemsFailed.map(i => i.name).join(', ')}`,
    timestamp: null,
    evidence: `Failed critical items: ${criticalItemsFailed.map(i => i.name).join(', ')}`,
    speaker: 'system',
    severity: 'critical',
    failedItems: criticalItemsFailed
  });
  hasCriticalViolation = true;
}

// AF-06: Check for items requiring customer response
const itemsNeedingResponse = enhancedChecklist.filter(i => i.requiresCustomerResponse && i.status === 'PASS');
for (const item of itemsNeedingResponse) {
  // Find the agent line for this item
  const agentLineIndex = agentLines.findIndex(l =>
    l.timestamp === item.time ||
    (item.evidence && l.text && item.evidence.includes(l.text.substring(0, 30)))
  );

  if (agentLineIndex >= 0) {
    const transcriptLineIndex = transcriptLines.findIndex(l => l.timestamp === agentLines[agentLineIndex].timestamp);
    if (transcriptLineIndex >= 0) {
      const responseCheck = checkCustomerResponse(transcriptLines, transcriptLineIndex);
      if (!responseCheck.responded) {
        // Mark as potential AF-06 but don't auto-fail (could be transcript issue)
        warningViolations.push({
          code: 'AF-06',
          violation: 'Unconfirmed Compliance',
          description: `Customer response not detected for: ${item.name}`,
          trigger: item.name,
          timestamp: item.time,
          evidence: `No customer confirmation found after agent asked about ${item.name}`,
          speaker: 'system',
          severity: 'warning' // Downgrade to warning since AI may have already verified
        });
      }
    }
  }
}

// ============================================================
// 6. CALCULATE FINAL COMPLIANCE SCORE
// ============================================================

let complianceScore = 0;
let totalWeight = 0;
let earnedWeight = 0;

for (const item of enhancedChecklist) {
  if (item.status !== 'N/A') {
    totalWeight += item.weight;
    if (item.status === 'PASS') {
      earnedWeight += item.weight;
    }
  }
}

complianceScore = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

// Apply auto-fail if critical violation detected
const autoFailTriggered = hasCriticalViolation;
if (autoFailTriggered) {
  complianceScore = 0;
}

// ============================================================
// 7. BUILD OUTPUT
// ============================================================

const output = {
  // Preserve original data
  ...input,

  // Campaign identification
  campaign: campaign,
  product_type: productType,

  // Compliance scoring
  compliance_score: complianceScore,
  auto_fail_triggered: autoFailTriggered,
  auto_fail_reasons: autoFailViolations,

  // Separate warnings from auto-fails
  compliance_warnings: warningViolations,

  // Critical moments for timeline
  critical_moments: {
    auto_fails: autoFailViolations.map(v => ({
      code: v.code,
      name: v.violation,
      time: v.timestamp,
      evidence: v.evidence
    })),
    warnings: warningViolations.map(v => ({
      code: v.code,
      name: v.violation,
      time: v.timestamp,
      evidence: v.evidence
    })),
    passes: enhancedChecklist.filter(i => i.status === 'PASS' && i.critical).map(i => ({
      name: i.name,
      time: i.time,
      evidence: i.evidence
    }))
  },

  // Enhanced checklist with evidence
  checklist: enhancedChecklist,

  // Script adherence (deterministic calculation)
  script_adherence: scriptAdherence,

  // Language assessment
  language_assessment: {
    ...(existingAnalysis.language_assessment || {}),
    script_adherence: scriptAdherence.level,
    empathy_displayed: empathyResult.displayed,
    empathy_details: empathyResult
  },

  // Processing metadata
  scoring_metadata: {
    processor: 'compliance-scoring-node-v2',
    processed_at: new Date().toISOString(),
    campaign_detected: campaign,
    script_template_applied: `${campaign}_TEMPLATE`,
    transcript_lines_parsed: transcriptLines.length,
    agent_lines: agentLines.length,
    customer_lines: customerLines.length,
    auto_fail_codes_checked: Object.keys(AUTO_FAIL_PATTERNS).length,
    critical_items_failed: criticalItemsFailed.length,
    terminology_issues_found: scriptAdherence.terminology_issues.length
  }
};

return [{ json: output }];
