
/**
 * N8N Code Node: Compliance Scoring & Evidence Extraction
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
 * 6. Validates auto-fail violations
 * 7. Marks AF-13 as warning (not auto-fail)
 */

const items = $input.all();
const input = items[0]?.json || {};

// Get transcript and existing analysis
const transcript = input.transcript || '';
const existingAnalysis = input.analysis || input.call_analysis || {};
const productType = (input.product_type || input.productType || existingAnalysis.campaign || 'ACA').toUpperCase();

// ============================================================
// COMPLIANCE RULES (from compliance-rules.json)
// ============================================================

const SCRIPT_TEMPLATES = {
  ACA: {
    target: "18+ without Medicare, Medicaid, or employer insurance",
    keyPhrases: [
      { phrase: "recorded line", required: true, order: 1, variations: ["recorded call", "call is recorded", "on a recorded"] },
      { phrase: "free health", required: true, order: 2, variations: ["government subsidy", "health subsidy"] },
      { phrase: "affordable care act", required: true, order: 3, variations: ["aca", "obamacare"] },
      { phrase: "medicare or medicaid or work insurance", required: true, order: 4, variations: ["medicare, medicaid", "don't have medicare", "no medicare"] },
      { phrase: "still living in", required: true, order: 5, variations: ["state of", "you're in", "residing in"] },
      { phrase: "just to be sure", required: true, order: 6, variations: ["just to confirm", "double check", "to confirm"] },
      { phrase: "may qualify", required: true, order: 7, variations: ["might qualify", "may be eligible", "see what you may"] }
    ],
    checklist: [
      { order: 1, key: "client_name_confirmation", name: "Confirm Client Name", weight: 12 },
      { order: 2, key: "agent_introduction", name: "Agent Introduction", weight: 10 },
      { order: 3, key: "company_name", name: "Company Name Stated", weight: 12, validNames: ["america's health", "americas health", "benefit link", "health benefit guide"] },
      { order: 4, key: "recorded_line_disclosure", name: "Recorded Line Disclosure", weight: 14, critical: true },
      { order: 5, key: "subsidy_mention", name: "FREE Health Subsidy/ACA Mention", weight: 10 },
      { order: 6, key: "mmw_check_first", name: "No M/M/W Check (First)", weight: 12, critical: true },
      { order: 7, key: "state_confirmation", name: "State Confirmation", weight: 10 },
      { order: 8, key: "mmw_check_second", name: "No M/M/W Check (Second)", weight: 14, critical: true },
      { order: 9, key: "verbal_consent_to_transfer", name: "Verbal Consent to Transfer", weight: 8, critical: true },
      { order: 10, key: "cold_transfer", name: "Cold Transfer Execution", weight: 6 }
    ]
  },
  MEDICARE: {
    target: "65+ with Medicare Part A AND Part B",
    keyPhrases: [
      { phrase: "recorded line", required: true, order: 1, variations: ["recorded call", "on a recorded"] },
      { phrase: "food and utility card", required: true, order: 2, variations: ["food card", "utility card", "benefits card"] },
      { phrase: "medicare parts a and b", required: true, order: 3, variations: ["part a and part b", "medicare a and b"] },
      { phrase: "red, white, and blue", required: true, order: 4, variations: ["red white and blue", "rwb card"] },
      { phrase: "additional food benefits", required: true, order: 5, variations: ["food benefits", "grocery benefits"] },
      { phrase: "food prices", required: false, order: 6, variations: ["prices have gone up"] },
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
      { order: 6, key: "medicare_ab_verification", name: "Medicare Part A & B Verification", weight: 14, critical: true },
      { order: 7, key: "rwb_card_verification", name: "Red, White, Blue Card Question", weight: 12, critical: true },
      { order: 8, key: "state_zipcode_confirmation", name: "State AND Zip Code Confirmation", weight: 12 },
      { order: 9, key: "food_benefits_mention", name: "Additional Food Benefits Mention", weight: 8 },
      { order: 10, key: "verbal_consent_to_transfer", name: "Verbal Consent to Transfer", weight: 8, critical: true },
      { order: 11, key: "cold_transfer", name: "Cold Transfer Explanation", weight: 6 }
    ]
  }
};

// WHATIF uses Medicare rules
SCRIPT_TEMPLATES.WHATIF = SCRIPT_TEMPLATES.MEDICARE;

// Auto-fail violation patterns
const AUTO_FAIL_PATTERNS = {
  'AF-01': {
    name: 'Making Promises',
    triggers: ["you will get", "you will receive", "you're going to get", "you're entitled to", "you qualify for", "guaranteed to", "i guarantee", "definitely get", "100% get", "you're approved"],
    safeExceptions: ["you may qualify", "you may be eligible", "you might qualify", "see what you may", "let's see if"],
    severity: 'critical'
  },
  'AF-03': {
    name: 'Discussing Money',
    triggers: ["how much money", "save you money", "save money", "cost you", "pay you", "payment", "cash back", "cash benefit", "dollar amount", "your income"],
    safeExceptions: ["benefits", "food benefits", "health benefits", "subsidy", "assistance"],
    severity: 'critical'
  },
  'AF-04': {
    name: 'Discussing Politics/Religion',
    triggers: ["trump", "biden", "obama", "republican", "democrat", "political", "vote", "election", "god bless", "praise god", "church", "jesus", "pray"],
    safeExceptions: ["government subsidy", "government program"],
    severity: 'critical'
  },
  'AF-09': {
    name: 'Ignoring DNC Requests',
    triggers: ["do not call", "don't call me", "stop calling", "take me off", "remove me", "dnc", "never call again", "quit calling"],
    safeExceptions: [],
    severity: 'critical'
  },
  'AF-11': {
    name: 'Misrepresenting Affiliation',
    triggers: ["we're with blue cross", "calling from aetna", "calling from united", "calling from humana", "cigna representative", "we partner with", "affiliated with"],
    safeExceptions: [],
    severity: 'critical'
  },
  'AF-12': {
    name: 'Incorrect Insurance Messaging',
    triggers: ["not about insurance", "nothing to do with insurance", "won't change your insurance", "won't affect your insurance", "keep your same insurance"],
    safeExceptions: [],
    severity: 'critical'
  },
  'AF-13': {
    name: 'Poor Call Quality',
    triggers: ["can't hear you", "you're breaking up", "bad connection", "call is cutting out"],
    safeExceptions: [],
    severity: 'warning' // NOT an auto-fail, just a note
  },
  'AF-14': {
    name: 'Poor Prospect State',
    triggers: ["i'm busy", "not a good time", "call me back", "in the middle of something", "stop calling", "leave me alone", "this is harassment"],
    safeExceptions: [],
    severity: 'critical'
  }
};

// Empathy detection patterns
const EMPATHY_PATTERNS = [
  "i understand",
  "i hear you",
  "that makes sense",
  "i appreciate",
  "thank you for",
  "i'm sorry to hear",
  "i can help",
  "let me help",
  "no problem",
  "absolutely",
  "of course"
];

// Banned terminology
const BANNED_TERMS = [
  { term: "pitch perfect", replacement: "Use DBA name" },
  { term: "pitch perfect solutions", replacement: "Use DBA name" }
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

// Convert MM:SS to seconds
function parseTimeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return 0;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

// Convert seconds to MM:SS
function formatTimestamp(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
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

// ============================================================
// MAIN PROCESSING
// ============================================================

// Determine campaign
const campaign = productType === 'WHATIF' ? 'MEDICARE' : (productType === 'MEDICARE' ? 'MEDICARE' : 'ACA');
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

// Step 3: Customer Response Handling (20%)
// Check if customer responded to key questions
let responseHandlingScore = 20;
const customerResponses = customerLines.length;
const agentQuestions = agentLines.filter(l => l.text.includes('?')).length;

if (agentQuestions > 0 && customerResponses === 0) {
  responseHandlingScore = 0;
} else if (customerResponses < agentQuestions * 0.5) {
  responseHandlingScore = 10;
}
scriptAdherence.calculation.response_handling_score = responseHandlingScore;

// Step 4: Terminology Compliance (20%)
let terminologyScore = 20;

// Check for banned terms
for (const banned of BANNED_TERMS) {
  if (lowerTranscript.includes(banned.term.toLowerCase())) {
    scriptAdherence.terminology_issues.push(`Used "${banned.term}" - ${banned.replacement}`);
    terminologyScore -= 10;
  }
}

// Check for promises without conditional language
if (lowerTranscript.includes('you will get') || lowerTranscript.includes('you qualify')) {
  if (!lowerTranscript.includes('may qualify') && !lowerTranscript.includes('might qualify')) {
    scriptAdherence.terminology_issues.push('Used definitive language instead of conditional (MAY/MIGHT)');
    terminologyScore -= 10;
  }
}

scriptAdherence.calculation.terminology_score = Math.max(0, terminologyScore);

// Calculate final score
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
// 3. AUTO-FAIL VIOLATION DETECTION
// ============================================================

const autoFailViolations = [];
let hasCriticalViolation = false;

for (const [code, pattern] of Object.entries(AUTO_FAIL_PATTERNS)) {
  for (const trigger of pattern.triggers) {
    const triggerLower = trigger.toLowerCase();

    // Check if trigger exists and no safe exception applies
    if (lowerTranscript.includes(triggerLower)) {
      let isSafe = false;

      for (const safe of pattern.safeExceptions) {
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

        autoFailViolations.push({
          code: code,
          violation: pattern.name,
          description: `Detected: "${trigger}"`,
          timestamp: timestamp,
          evidence: evidence || `Transcript contains: "${trigger}"`,
          speaker: speaker || 'unknown',
          severity: pattern.severity
        });

        if (pattern.severity === 'critical') {
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

for (const item of scriptTemplate.checklist) {
  // Find existing AI analysis for this item
  const existingItem = existingChecklist.find(c =>
    c.name?.toLowerCase().includes(item.name.toLowerCase().split(' ')[0]) ||
    c.key === item.key
  );

  let status = existingItem?.status || 'FAIL';
  let evidence = existingItem?.evidence || 'No clear evidence found';
  let timestamp = existingItem?.time || existingItem?.timestamp || null;
  let confidence = existingItem?.confidence || 50;

  // Try to find evidence if missing
  if (evidence === 'No clear evidence found' || !timestamp) {
    // Search for relevant content based on item type
    let searchPatterns = [];

    switch (item.key) {
      case 'client_name_confirmation':
        searchPatterns = ['hi ', 'hello ', 'good morning', 'good afternoon', 'speaking with'];
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
        searchPatterns = ['living in', 'state of', "you're in"];
        break;
      case 'verbal_consent_to_transfer':
        searchPatterns = ['transfer', 'connect you', 'someone on the line'];
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

  enhancedChecklist.push({
    order: item.order,
    key: item.key,
    name: item.name,
    status: status,
    weight: item.weight,
    critical: item.critical || false,
    evidence: evidence,
    time: timestamp,
    confidence: confidence
  });
}

// ============================================================
// 5. CALCULATE FINAL COMPLIANCE SCORE
// ============================================================

let complianceScore = 0;
let totalWeight = 0;
let earnedWeight = 0;

for (const item of enhancedChecklist) {
  if (item.status !== 'N/A') {
    totalWeight += item.weight;
    if (item.status === 'PASS' || item.status === 'met') {
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
// 6. BUILD OUTPUT
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

  // Enhanced checklist with evidence
  checklist: enhancedChecklist,

  // Script adherence (NEW - real calculation)
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
    processor: 'compliance-scoring-node-v1',
    processed_at: new Date().toISOString(),
    campaign_detected: campaign,
    script_template_applied: `${campaign}_TEMPLATE`,
    transcript_lines_parsed: transcriptLines.length,
    agent_lines: agentLines.length,
    customer_lines: customerLines.length
  }
};

return [{ json: output }];
