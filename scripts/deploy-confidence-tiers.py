#!/usr/bin/env python3
"""
Deploy Confidence-Based Auto-Fail Tier System (v2.2)

Modifies the QA v2: AI Analysis workflow to add confidence scoring to auto-fails.
Changes:
  Phase 1: AI Agent prompts — add confidence/confidence_reasoning to auto_fail schema
  Phase 2: Auto Fail Filter v3.21 — add confidence to regex AFs
  Phase 3: Extract JSON v9.2 — default confidence if missing
  Phase 4: Validate Auto-Fails v2.2 — tier classification
  Phase 5: Confidence Gate node — second-pass AI for medium-tier AFs
  Phase 6: Prepare Store Payload v7.10 — tiered scoring

Usage:
  python3 scripts/deploy-confidence-tiers.py
  python3 scripts/deploy-confidence-tiers.py --dry-run   # Show changes without deploying
"""

import json
import os
import sys
import re
import uuid
from pathlib import Path

# Add project root for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import deploy wrapper
from importlib.util import spec_from_file_location, module_from_spec
spec = spec_from_file_location("deploy", str(Path(__file__).parent / "n8n-deploy.py"))
deploy = module_from_spec(spec)
spec.loader.exec_module(deploy)

DRY_RUN = "--dry-run" in sys.argv


def find_node(workflow, name):
    """Find a node by name in the workflow."""
    for node in workflow["nodes"]:
        if node["name"] == name:
            return node
    raise KeyError(f"Node '{name}' not found in workflow")


def patch_ai_agent_prompt(node, agent_name):
    """Phase 1: Add confidence fields to auto_fail schema in AI agent prompt."""
    msg = node["parameters"]["options"]["systemMessage"]

    # Find the auto_fails array schema section and add confidence fields
    # ACA format: { "code": "AF-XX", "name": "string", "triggered": boolean, "evidence": "verbatim quote", "time_seconds": number }
    # Medicare/WhatIF format: { "code": "AF-XX", "description": "name", "timestamp": "M:SS", "time_seconds": 0, "evidence": "quote" }

    confidence_instruction = """
=== CONFIDENCE SCORING (v2.2) ===
For EVERY auto_fail you detect, you MUST include TWO additional fields:
- "confidence": integer 0-100 — how confident you are this is a GENUINE violation (not a false positive)
- "confidence_reasoning": string — 1 sentence explaining your confidence level

CONFIDENCE GUIDELINES:
- 90-100: Crystal clear violation with unambiguous transcript evidence. No room for interpretation.
- 70-89: Strong evidence but minor ambiguity (e.g., transcription quality could affect reading, context is slightly unclear, or customer statement is borderline)
- 40-69: Possible violation but SIGNIFICANT ambiguity (e.g., customer might have misspoken, dual insurance coverage unclear, context could explain the behavior, or evidence is indirect)
- 0-39: Weak signal — more likely a false positive than a real violation. Flag it but express low confidence.

COMMON FALSE POSITIVE PATTERNS (reduce confidence for these):
- AF-08: Customer mentions a private insurance carrier (UnitedHealthcare, Aetna, BCBS, etc.) alongside Medicare — this is dual coverage, NOT a DQ. Reduce confidence to 30-50.
- AF-08: Customer says "I have A and B" but also mentions another plan — this IS confirmation. Reduce confidence to 20-40.
- AF-02: Agent discussing rising healthcare costs in general context — not a money discussion. Reduce confidence to 30-50.
- AF-07: Customer says "I don't want it" as offer decline, not DNC request. Reduce confidence to 20-40.
- AF-01: Agent explaining DQ criteria for educational purposes during transfer handoff. Reduce confidence to 30-50.
- Any AF where transcription quality is degraded and evidence relies on exact wording. Reduce confidence by 20-30 points.
=== END CONFIDENCE SCORING ==="""

    # Insert confidence instruction before the auto_fails schema section
    auto_fails_idx = msg.find('"auto_fails"')
    if auto_fails_idx == -1:
        print(f"  WARNING: Could not find auto_fails in {agent_name}")
        return False

    # Find the start of the line before "auto_fails" to insert before it
    line_start = msg.rfind('\n', 0, auto_fails_idx)
    if line_start == -1:
        line_start = 0

    msg = msg[:line_start] + "\n" + confidence_instruction + msg[line_start:]

    # Now add confidence fields to the auto_fails schema
    # For ACA: after "time_seconds": number in auto_fails
    if agent_name == "ACA Compliance Agent":
        old_schema = '''"code": "AF-XX",
        "name": "string",
        "triggered": boolean,
        "evidence": "verbatim quote",
        "time_seconds": number'''
        new_schema = '''"code": "AF-XX",
        "name": "string",
        "triggered": boolean,
        "evidence": "verbatim quote",
        "time_seconds": number,
        "confidence": 85,
        "confidence_reasoning": "1 sentence explaining confidence level"'''
        msg = msg.replace(old_schema, new_schema, 1)
    else:
        # Medicare and WhatIF format
        old_schema = '''"code": "AF-XX", "description": "name", "timestamp": "M:SS", "time_seconds": 0, "evidence": "quote"'''
        new_schema = '''"code": "AF-XX", "description": "name", "timestamp": "M:SS", "time_seconds": 0, "evidence": "quote", "confidence": 85, "confidence_reasoning": "1 sentence"'''
        msg = msg.replace(old_schema, new_schema, 1)

    node["parameters"]["options"]["systemMessage"] = msg
    return True


def patch_auto_fail_filter(node):
    """Phase 2: Add confidence to regex-detected auto-fails."""
    code = node["parameters"]["jsCode"]

    # Replace the addAutoFail function to include confidence
    # Note: n8n Code nodes use 2-space indentation
    old_add = "function addAutoFail(code, violation, timestamp, evidence, speaker = 'agent', timeSeconds = -1) {\n  autoFailReasons.push({ code, violation, timestamp: timestamp || 'N/A', time_seconds: timeSeconds, evidence: evidence || 'Pattern detected', speaker });\n  autoFailTriggered = true;\n}"

    new_add = "function addAutoFail(code, violation, timestamp, evidence, speaker = 'agent', timeSeconds = -1, confidence = 95) {\n  autoFailReasons.push({ code, violation, timestamp: timestamp || 'N/A', time_seconds: timeSeconds, evidence: evidence || 'Pattern detected', speaker, confidence, confidence_reasoning: 'Regex pattern match with high specificity' });\n  autoFailTriggered = true;\n}"

    if old_add not in code:
        print("  WARNING: Could not find addAutoFail function")
        return False

    code = code.replace(old_add, new_add)

    # Replace the addWarning function to include confidence
    old_warn = "function addWarning(code, violation, timestamp, evidence, speaker = 'system', timeSeconds = -1) {\n  autoFailReasons.push({ code, violation, timestamp: timestamp || 'N/A', time_seconds: timeSeconds, evidence: evidence || 'Pattern detected', speaker, severity: 'warning' });\n}"

    new_warn = "function addWarning(code, violation, timestamp, evidence, speaker = 'system', timeSeconds = -1) {\n  autoFailReasons.push({ code, violation, timestamp: timestamp || 'N/A', time_seconds: timeSeconds, evidence: evidence || 'Pattern detected', speaker, severity: 'warning', confidence: 60, confidence_reasoning: 'Warning-level detection' });\n}"

    if old_warn not in code:
        print("  WARNING: Could not find addWarning function")
        return False

    code = code.replace(old_warn, new_warn)

    # Add confidence to the direct AF-05 pushes (Disposition Integrity Check)
    # These use autoFailReasons.push({ directly instead of addAutoFail()
    # AF-05 HUT pattern
    code = code.replace(
        "additional_info: 'System-detected: transfer intent + no LA + short call (Disposition Integrity Check v3.20)'",
        "additional_info: 'System-detected: transfer intent + no LA + short call (Disposition Integrity Check v3.20)',\n      confidence: 80,\n      confidence_reasoning: 'Disposition pattern analysis — no direct transcript match'"
    )

    # AF-05 minimal engagement pattern
    code = code.replace(
        "additional_info: 'System-detected: minimal customer engagement (Disposition Integrity Check v3.20)'",
        "additional_info: 'System-detected: minimal customer engagement (Disposition Integrity Check v3.20)',\n      confidence: 85,\n      confidence_reasoning: 'Very low customer engagement metrics — strong signal'"
    )

    # Update version comment
    code = code.replace("// Auto Fail Filter v3.20", "// Auto Fail Filter v3.21 — confidence scoring")
    if "v3.20" in code:
        code = code.replace("v3.20", "v3.21")

    node["parameters"]["jsCode"] = code
    return True


def patch_extract_json(node):
    """Phase 3: Default confidence fields if AI didn't provide them."""
    code = node["parameters"]["jsCode"]

    # Find the return statement and add confidence defaulting before it
    # The Extract JSON node returns: return { json: parsed }
    # We need to add confidence defaults to auto_fails before return

    confidence_defaults = """
// v9.2: Ensure confidence fields exist on all auto_fails
if (parsed.auto_fails && Array.isArray(parsed.auto_fails)) {
  parsed.auto_fails = parsed.auto_fails.map(af => ({
    ...af,
    confidence: typeof af.confidence === 'number' ? af.confidence : 75,
    confidence_reasoning: af.confidence_reasoning || 'AI did not provide confidence assessment'
  }));
}

// Also ensure auto_fail_reasons (alternate key) has confidence
if (parsed.auto_fail_reasons && Array.isArray(parsed.auto_fail_reasons)) {
  parsed.auto_fail_reasons = parsed.auto_fail_reasons.map(af => ({
    ...af,
    confidence: typeof af.confidence === 'number' ? af.confidence : 75,
    confidence_reasoning: af.confidence_reasoning || 'AI did not provide confidence assessment'
  }));
}
"""

    # Find the pattern where parsed is returned
    # Common patterns: "return { json: parsed }" or "return [{ json: parsed }]"
    return_pattern = "return { json: parsed };"
    alt_return_pattern = "return [{ json: parsed }];"
    return_items_pattern = "return items;"

    if return_pattern in code:
        code = code.replace(return_pattern, confidence_defaults + "\n" + return_pattern)
    elif alt_return_pattern in code:
        code = code.replace(alt_return_pattern, confidence_defaults + "\n" + alt_return_pattern)
    elif return_items_pattern in code:
        # The node uses items pattern — find the last assignment to items before return
        # Insert confidence defaults before the return
        last_return_idx = code.rfind(return_items_pattern)
        code = code[:last_return_idx] + confidence_defaults + "\n" + code[last_return_idx:]
    else:
        # Try to find any return with parsed
        match = re.search(r'(return\s+\{[^}]*parsed[^}]*\})', code)
        if match:
            code = code[:match.start()] + confidence_defaults + "\n" + code[match.start():]
        else:
            print("  WARNING: Could not find return statement in Extract JSON")
            return False

    # Update version
    code = code.replace("// Extract JSON from Agent v9.1", "// Extract JSON from Agent v9.2 — confidence defaults")
    code = code.replace("v9.1:", "v9.2:")

    node["parameters"]["jsCode"] = code
    return True


def patch_validate_auto_fails(node):
    """Phase 4: Add confidence tier classification to Validate Auto-Fails."""
    code = node["parameters"]["jsCode"]

    # Replace the output section with confidence-aware version
    old_output = """const realAutoFails = autoFailReasons.filter(r => r.severity !== 'warning');
const autoFailTriggered = realAutoFails.length > 0;

// If we removed violations, adjust the score
let complianceScore = input.compliance_score;
if (!autoFailTriggered && input.auto_fail_triggered) {
  // Auto-fail was cleared by validation — restore the AI's score
  // We don't have the "original" score, so we keep whatever the AI calculated
  // but it was forced to 0 by the auto-fail. Use a placeholder that
  // Prepare Store Payload will recalculate from the checklist
  complianceScore = -1; // Signal to Prepare Store Payload to recalculate
}

// Log removed violations for debugging
if (removedReasons.length > 0) {
  console.log(`POST-AI VALIDATOR: Removed ${removedReasons.length} false positive(s):`);
  removedReasons.forEach(r => {
    console.log(`  ${r.code} "${r.violation}" — ${r.removal_reason}`);
  });
}

return {
  json: {
    ...input,
    auto_fail_triggered: autoFailTriggered,
    auto_fail_reasons: autoFailReasons,
    compliance_score: autoFailTriggered ? 0 : complianceScore,
    // Validation metadata
    _validation: {
      original_af_count: originalCount,
      validated_af_count: autoFailReasons.length,
      removed_count: removedReasons.length,
      removed_reasons: removedReasons,
      analysis_cutoff_used: analysisCutoff
    }
  }
};"""

    new_output = """// ───── CONFIDENCE TIER CLASSIFICATION (v2.2) ─────
// Classify each surviving AF into confidence tiers
// Boost confidence for AFs that passed all validation layers
autoFailReasons = autoFailReasons.map(af => {
  let confidence = typeof af.confidence === 'number' ? af.confidence : 75;
  let reasoning = af.confidence_reasoning || 'No confidence assessment provided';

  // AFs that survived all validation layers get a confidence boost (+5, max 100)
  if (af.severity !== 'warning') {
    confidence = Math.min(100, confidence + 5);
    reasoning += ' | Survived all validation layers';
  }

  // Classify tier
  let tier;
  if (confidence >= 80) tier = 'HIGH';
  else if (confidence >= 40) tier = 'MEDIUM';
  else tier = 'LOW';

  return { ...af, confidence, confidence_reasoning: reasoning, confidence_tier: tier };
});

const realAutoFails = autoFailReasons.filter(r => r.severity !== 'warning');
const highTierAFs = realAutoFails.filter(r => r.confidence_tier === 'HIGH');
const mediumTierAFs = realAutoFails.filter(r => r.confidence_tier === 'MEDIUM');
const lowTierAFs = realAutoFails.filter(r => r.confidence_tier === 'LOW');

// v2.2: Only HIGH-tier AFs trigger auto-fail (zero score)
// MEDIUM-tier AFs flag for review but preserve score
// LOW-tier AFs are warnings only
const autoFailTriggered = highTierAFs.length > 0;
const hasMediumConfidenceAFs = mediumTierAFs.length > 0;

// If we removed violations OR downgraded all to non-HIGH, adjust the score
let complianceScore = input.compliance_score;
if (!autoFailTriggered && input.auto_fail_triggered) {
  complianceScore = -1; // Signal to Prepare Store Payload to recalculate
}

// Log removed violations for debugging
if (removedReasons.length > 0) {
  console.log('POST-AI VALIDATOR: Removed ' + removedReasons.length + ' false positive(s):');
  removedReasons.forEach(r => {
    console.log('  ' + r.code + ' "' + r.violation + '" — ' + r.removal_reason);
  });
}

// Log confidence tiers
console.log('CONFIDENCE TIERS: HIGH=' + highTierAFs.length + ' MEDIUM=' + mediumTierAFs.length + ' LOW=' + lowTierAFs.length);
if (hasMediumConfidenceAFs) {
  console.log('MEDIUM-CONFIDENCE AFs (will be sent to second-pass validator):');
  mediumTierAFs.forEach(af => {
    console.log('  ' + af.code + ' (confidence=' + af.confidence + '): ' + af.confidence_reasoning);
  });
}

return {
  json: {
    ...input,
    auto_fail_triggered: autoFailTriggered,
    auto_fail_reasons: autoFailReasons,
    compliance_score: autoFailTriggered ? 0 : complianceScore,
    // v2.2: Confidence tier metadata
    has_medium_confidence_afs: hasMediumConfidenceAFs,
    medium_confidence_afs: mediumTierAFs,
    high_confidence_afs: highTierAFs,
    af_confidence_level: highTierAFs.length > 0 ? 'HIGH' : (mediumTierAFs.length > 0 ? 'MEDIUM' : (lowTierAFs.length > 0 ? 'LOW' : null)),
    // Validation metadata
    _validation: {
      original_af_count: originalCount,
      validated_af_count: autoFailReasons.length,
      removed_count: removedReasons.length,
      removed_reasons: removedReasons,
      analysis_cutoff_used: analysisCutoff,
      confidence_tiers: { high: highTierAFs.length, medium: mediumTierAFs.length, low: lowTierAFs.length }
    }
  }
};"""

    if old_output not in code:
        print("  WARNING: Could not find expected output section in Validate Auto-Fails")
        print("  Attempting partial match...")
        # Try finding just the return section
        return_idx = code.rfind("return {")
        if return_idx == -1:
            print("  ERROR: Could not find return statement")
            return False
        # Find the start of the output section (const realAutoFails)
        real_idx = code.rfind("const realAutoFails")
        if real_idx == -1:
            print("  ERROR: Could not find realAutoFails")
            return False
        old_output = code[real_idx:]
        code = code[:real_idx] + new_output
    else:
        code = code.replace(old_output, new_output)

    # Update version
    code = code.replace("// Post-AI Auto-Fail Validator v2.1", "// Post-AI Auto-Fail Validator v2.2 — confidence tiers")
    code = code.replace("// Post-AI Auto-Fail Validator v2.0", "// Post-AI Auto-Fail Validator v2.2 — confidence tiers")

    node["parameters"]["jsCode"] = code
    return True


def create_confidence_gate_node(workflow):
    """Phase 5: Create the Confidence Gate code node for second-pass AI validation."""

    # Get the position of Validate Auto-Fails to place the new node nearby
    validate_node = find_node(workflow, "Validate Auto-Fails")
    prepare_node = find_node(workflow, "Prepare Store Payload")
    validate_pos = validate_node.get("position", [0, 0])
    prepare_pos = prepare_node.get("position", [0, 0])

    # Position between Validate and Prepare
    gate_x = (validate_pos[0] + prepare_pos[0]) // 2
    gate_y = (validate_pos[1] + prepare_pos[1]) // 2

    gate_node = {
        "parameters": {
            "jsCode": """// Confidence Gate v1.0 — Second-pass AI validator for medium-confidence auto-fails
// Only triggers when medium-tier AFs exist; otherwise passes through unchanged.
// Uses DeepSeek V3 via OpenRouter for cost-effective second-pass validation.

const input = $input.item.json;
const hasMediumAFs = input.has_medium_confidence_afs === true;
const mediumAFs = input.medium_confidence_afs || [];

// Fast path: no medium-confidence AFs → pass through
if (!hasMediumAFs || mediumAFs.length === 0) {
  return { json: input };
}

console.log('CONFIDENCE GATE: ' + mediumAFs.length + ' medium-confidence AF(s) — invoking second-pass validator');

// Build the transcript context (pre-transfer only, limited to 4000 chars for cost)
const transcript = (input.transcript || '').substring(0, 4000);

// Build the validation prompt
const afDescriptions = mediumAFs.map(af =>
  'AF Code: ' + af.code + '\\n' +
  'Violation: ' + (af.violation || af.name || af.description || 'Unknown') + '\\n' +
  'Evidence: ' + (af.evidence || 'No evidence provided') + '\\n' +
  'Initial Confidence: ' + af.confidence + '\\n' +
  'Reasoning: ' + (af.confidence_reasoning || 'None provided')
).join('\\n---\\n');

const systemPrompt = `You are a QA compliance second-pass validator for a call center. You are reviewing auto-fail violations that an initial AI flagged with MEDIUM confidence (40-79 out of 100). Your job is to determine if each violation is GENUINE or a FALSE POSITIVE.

IMPORTANT CONTEXT:
- These are compliance calls where agents help customers with insurance (ACA/Medicare)
- Auto-fails are serious — they zero the agent's score and flag for escalation
- We want to CATCH genuine violations but AVOID false positives that unfairly penalize agents
- When in doubt, lean toward FALSE POSITIVE to avoid unfair penalties

COMMON FALSE POSITIVE PATTERNS:
- AF-08 (DQ Prospect): Customer has private insurance (UnitedHealthcare, Aetna, BCBS, Cigna, Humana, etc.) ALONGSIDE Medicare — dual coverage is common and does NOT disqualify
- AF-08: Customer confirms "A and B" or "both parts" — this IS qualification confirmation even if they mention another plan
- AF-08: Customer mentions Medicaid alongside Medicare — dual-eligible customers are NOT disqualified
- AF-08: Customer mentions Medicare Advantage — this CONFIRMS they have Medicare A&B
- AF-02 (Money Discussion): Agent discussing rising healthcare costs generally, or customer mentioning "saving money" casually — not a money pitch
- AF-07 (DNC): Customer says "I don't want it" or "I'm not interested" as polite offer decline — agents are allowed one soft rebuttal
- AF-01 (Promises): Agent explaining DQ criteria during transfer handoff — educational, not promising
- AF-09 (Misrepresentation): WhisperX transcription garbles (e.g., "recorded mind" = "recorded line")
- AF-12 (No Consent): Customer gives implied consent ("okay", "sure", "uh huh") near transfer language

Return ONLY valid JSON in this exact format:
{"results": [{"code": "AF-XX", "confirmed": true_or_false, "revised_confidence": 0_to_100, "reasoning": "1-2 sentence explanation"}]}`;

const userPrompt = 'Review these MEDIUM-confidence auto-fail violations against the call transcript below.\\n\\nAUTO-FAIL VIOLATIONS TO REVIEW:\\n' + afDescriptions + '\\n\\nCALL TRANSCRIPT (pre-transfer portion):\\n' + transcript;

// Call OpenRouter (DeepSeek V3)
let secondPassResults = null;
try {
  let apiKey;
  try {
    apiKey = $env.OPENROUTER_API_KEY;
  } catch (e) {
    // n8n sandbox may block $env — try alternate access
    apiKey = null;
  }

  if (!apiKey) {
    console.log('CONFIDENCE GATE: No OPENROUTER_API_KEY — keeping original confidence levels');
    return { json: { ...input, af_second_pass: { error: 'No API key available', kept_original: true } } };
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://pitchvision.io',
      'X-Title': 'PitchVision QA Confidence Gate'
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-v3.2',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.log('CONFIDENCE GATE: OpenRouter API error (' + response.status + '): ' + errText.substring(0, 200));
    return { json: { ...input, af_second_pass: { error: 'API error ' + response.status, kept_original: true } } };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = content;
  const jsonMatch = content.match(/\\{[\\s\\S]*\\}/);
  if (jsonMatch) jsonStr = jsonMatch[0];

  secondPassResults = JSON.parse(jsonStr);
  console.log('CONFIDENCE GATE: Second-pass results: ' + JSON.stringify(secondPassResults));

} catch (err) {
  console.log('CONFIDENCE GATE: Error in second-pass validation: ' + (err.message || err));
  // On error, keep original confidence — don't promote or demote
  return { json: { ...input, af_second_pass: { error: String(err.message || err), kept_original: true } } };
}

// Apply second-pass results to the auto_fail_reasons
if (secondPassResults && secondPassResults.results && Array.isArray(secondPassResults.results)) {
  const resultsMap = {};
  secondPassResults.results.forEach(r => { resultsMap[r.code] = r; });

  let updatedAFReasons = (input.auto_fail_reasons || []).map(af => {
    const spResult = resultsMap[af.code];
    if (!spResult) return af; // No second-pass result for this AF
    if (af.confidence_tier !== 'MEDIUM') return af; // Only modify MEDIUM-tier AFs

    if (spResult.confirmed) {
      // Promote to HIGH
      const newConfidence = Math.max(af.confidence, spResult.revised_confidence || 80);
      console.log('CONFIDENCE GATE: CONFIRMED ' + af.code + ' — promoting to HIGH (confidence ' + af.confidence + ' → ' + newConfidence + ')');
      return {
        ...af,
        confidence: newConfidence,
        confidence_tier: newConfidence >= 80 ? 'HIGH' : 'MEDIUM',
        confidence_reasoning: af.confidence_reasoning + ' | Second-pass CONFIRMED: ' + (spResult.reasoning || 'Confirmed by validator'),
        second_pass_confirmed: true
      };
    } else {
      // Demote to LOW
      const newConfidence = Math.min(af.confidence, spResult.revised_confidence || 30);
      console.log('CONFIDENCE GATE: REJECTED ' + af.code + ' — demoting to LOW (confidence ' + af.confidence + ' → ' + newConfidence + ')');
      return {
        ...af,
        confidence: newConfidence,
        confidence_tier: newConfidence < 40 ? 'LOW' : 'MEDIUM',
        confidence_reasoning: af.confidence_reasoning + ' | Second-pass REJECTED: ' + (spResult.reasoning || 'Rejected by validator'),
        second_pass_confirmed: false
      };
    }
  });

  // Recalculate tier counts after second-pass
  const realAFs = updatedAFReasons.filter(r => r.severity !== 'warning');
  const highAFs = realAFs.filter(r => r.confidence_tier === 'HIGH');
  const medAFs = realAFs.filter(r => r.confidence_tier === 'MEDIUM');
  const autoFailTriggered = highAFs.length > 0;

  // Recalculate compliance score based on new tier classification
  let complianceScore = input.compliance_score;
  if (autoFailTriggered) {
    complianceScore = 0;
  } else if (!autoFailTriggered && input.auto_fail_triggered) {
    // Was auto-fail but second-pass cleared it — recalculate from checklist
    complianceScore = -1;
  }

  console.log('CONFIDENCE GATE POST: HIGH=' + highAFs.length + ' MEDIUM=' + medAFs.length + ' autoFail=' + autoFailTriggered);

  return {
    json: {
      ...input,
      auto_fail_triggered: autoFailTriggered,
      auto_fail_reasons: updatedAFReasons,
      compliance_score: complianceScore,
      has_medium_confidence_afs: medAFs.length > 0,
      medium_confidence_afs: medAFs,
      high_confidence_afs: highAFs,
      af_confidence_level: highAFs.length > 0 ? 'HIGH' : (medAFs.length > 0 ? 'MEDIUM' : 'LOW'),
      af_second_pass: secondPassResults
    }
  };
}

// Fallback: no valid results from second-pass
return { json: { ...input, af_second_pass: secondPassResults || { error: 'No results parsed', kept_original: true } } };
""",
            "mode": "runOnceForEachItem"
        },
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [gate_x, gate_y],
        "id": str(uuid.uuid4()),
        "name": "Confidence Gate"
    }

    # Add node to workflow
    workflow["nodes"].append(gate_node)

    # Update connections: Validate Auto-Fails → Confidence Gate → Prepare Store Payload
    # Remove: Validate Auto-Fails → Prepare Store Payload
    # Add: Validate Auto-Fails → Confidence Gate
    # Add: Confidence Gate → Prepare Store Payload
    conns = workflow["connections"]

    # Remove old connection
    if "Validate Auto-Fails" in conns:
        conns["Validate Auto-Fails"] = {
            "main": [[{"node": "Confidence Gate", "type": "main", "index": 0}]]
        }

    # Add new connection
    conns["Confidence Gate"] = {
        "main": [[{"node": "Prepare Store Payload", "type": "main", "index": 0}]]
    }

    return True


def patch_prepare_store_payload(node):
    """Phase 6: Update Prepare Store Payload with tiered scoring logic."""
    code = node["parameters"]["jsCode"]

    # Replace the auto-fail scoring section
    old_scoring = """const finalAutoFailTriggered = input.auto_fail_triggered || false;

// Force score to zero on auto-fail
if (finalAutoFailTriggered) {
  complianceScore = 0;
}"""

    new_scoring = """const finalAutoFailTriggered = input.auto_fail_triggered || false;
const afConfidenceLevel = input.af_confidence_level || null;
const hasMediumConfidenceAFs = input.has_medium_confidence_afs || false;
const afSecondPass = input.af_second_pass || null;

// v7.10: Tiered auto-fail scoring
// HIGH-tier AFs → score = 0 (same as before)
// MEDIUM-tier AFs → keep AI score, flag for review
// LOW-tier AFs → warning only, keep AI score
if (finalAutoFailTriggered) {
  complianceScore = 0;
}"""

    if old_scoring in code:
        code = code.replace(old_scoring, new_scoring)
    else:
        print("  WARNING: Could not find exact scoring section, attempting relaxed match")
        # Try a more relaxed match
        code = code.replace(
            "const finalAutoFailTriggered = input.auto_fail_triggered || false;",
            "const finalAutoFailTriggered = input.auto_fail_triggered || false;\nconst afConfidenceLevel = input.af_confidence_level || null;\nconst hasMediumConfidenceAFs = input.has_medium_confidence_afs || false;\nconst afSecondPass = input.af_second_pass || null;"
        )

    # Add new columns to the output payload
    # Find the auto_fail_triggered line in the return payload and add new fields after it
    old_af_line = "auto_fail_triggered: finalAutoFailTriggered,"
    new_af_line = """auto_fail_triggered: finalAutoFailTriggered,
    af_confidence_level: afConfidenceLevel,
    af_needs_review: hasMediumConfidenceAFs,
    af_second_pass: afSecondPass,"""

    code = code.replace(old_af_line, new_af_line)

    # Update review priority for medium-confidence cases
    # Insert BEFORE the return statement, not inside it
    old_return_marker = "// ===== FINAL PAYLOAD ====="
    new_return_marker = """// v7.10: Escalate medium-confidence AF calls for human review
if (hasMediumConfidenceAFs && !finalAutoFailTriggered) {
  reviewPriority = 'high';
  if (!reviewFlagsArray.includes('MEDIUM_CONFIDENCE_AF')) {
    reviewFlagsArray.push('MEDIUM_CONFIDENCE_AF');
  }
  tag = 'manual_review';
}

// ===== FINAL PAYLOAD ====="""

    code = code.replace(old_return_marker, new_return_marker)

    # Update version
    code = code.replace("// Prepare complete payload for QA Results table - v7.7", "// Prepare complete payload for QA Results table - v7.10 — confidence tiers")
    code = code.replace("// Prepare complete payload for QA Results table - v7.9", "// Prepare complete payload for QA Results table - v7.10 — confidence tiers")

    node["parameters"]["jsCode"] = code
    return True


def main():
    print("=" * 60)
    print("Deploying Confidence-Based Auto-Fail Tier System (v2.2)")
    print("=" * 60)

    if DRY_RUN:
        print("\n*** DRY RUN MODE — no changes will be deployed ***\n")

    # Fetch current workflow
    print("\nFetching current workflow...")
    workflow = deploy.fetch_workflow("AhPORSIrn7Ygyadn")
    print(f"  {workflow['name']} ({len(workflow['nodes'])} nodes)")

    changes = []

    # Phase 1: AI Agent Prompts
    print("\n[Phase 1] Patching AI Agent prompts...")
    for agent_name in ["ACA Compliance Agent", "Medicare Compliance Agent", "WhatIF Compliance Agent"]:
        try:
            node = find_node(workflow, agent_name)
            if patch_ai_agent_prompt(node, agent_name):
                print(f"  ✓ {agent_name}")
                changes.append(f"Phase 1: {agent_name} prompt updated")
            else:
                print(f"  ✗ {agent_name} — could not patch")
        except KeyError as e:
            print(f"  ✗ {agent_name} — {e}")

    # Phase 2: Auto Fail Filter
    print("\n[Phase 2] Patching Auto Fail Filter...")
    try:
        node = find_node(workflow, "Auto Fail Filter")
        if patch_auto_fail_filter(node):
            print("  ✓ Auto Fail Filter v3.21")
            changes.append("Phase 2: Auto Fail Filter v3.21")
        else:
            print("  ✗ Could not patch Auto Fail Filter")
    except KeyError as e:
        print(f"  ✗ {e}")

    # Phase 3: Extract JSON
    print("\n[Phase 3] Patching Extract JSON...")
    try:
        node = find_node(workflow, "Extract JSON from Agent")
        if patch_extract_json(node):
            print("  ✓ Extract JSON v9.2")
            changes.append("Phase 3: Extract JSON v9.2")
        else:
            print("  ✗ Could not patch Extract JSON")
    except KeyError as e:
        print(f"  ✗ {e}")

    # Phase 4: Validate Auto-Fails
    print("\n[Phase 4] Patching Validate Auto-Fails...")
    try:
        node = find_node(workflow, "Validate Auto-Fails")
        if patch_validate_auto_fails(node):
            print("  ✓ Validate Auto-Fails v2.2")
            changes.append("Phase 4: Validate Auto-Fails v2.2")
        else:
            print("  ✗ Could not patch Validate Auto-Fails")
    except KeyError as e:
        print(f"  ✗ {e}")

    # Phase 5: Confidence Gate
    print("\n[Phase 5] Creating Confidence Gate node...")
    if create_confidence_gate_node(workflow):
        print(f"  ✓ Confidence Gate node added ({len(workflow['nodes'])} total nodes)")
        changes.append("Phase 5: Confidence Gate node")
    else:
        print("  ✗ Could not create Confidence Gate")

    # Phase 6: Prepare Store Payload
    print("\n[Phase 6] Patching Prepare Store Payload...")
    try:
        node = find_node(workflow, "Prepare Store Payload")
        if patch_prepare_store_payload(node):
            print("  ✓ Prepare Store Payload v7.10")
            changes.append("Phase 6: Prepare Store Payload v7.10")
        else:
            print("  ✗ Could not patch Prepare Store Payload")
    except KeyError as e:
        print(f"  ✗ {e}")

    # Summary
    print(f"\n{'=' * 60}")
    print(f"Changes prepared: {len(changes)}")
    for c in changes:
        print(f"  ✓ {c}")
    print(f"{'=' * 60}")

    if DRY_RUN:
        print("\nDry run complete. No changes deployed.")
        # Save modified workflow for inspection
        out_path = "/tmp/n8n_confidence_tiers_preview.json"
        with open(out_path, "w") as f:
            json.dump(workflow, f, indent=2)
        print(f"Preview saved to: {out_path}")
        return

    # Deploy
    print("\nDeploying...")
    try:
        result = deploy.safe_deploy(workflow, label="v2.2-confidence-tiers")
        if result["success"]:
            print("\n✓ Deployment successful!")
            print(f"  Snapshot: {result.get('snapshot_path', 'N/A')}")
        else:
            print("\n✗ Deployment failed!")
            for err in result.get("errors", []):
                print(f"  Error: {err}")
    except deploy.DeploymentError as e:
        print(f"\n✗ Deployment error: {e}")
        for err in e.errors:
            print(f"  {err['node_name']}: {err['error_message']}")
        sys.exit(1)


if __name__ == "__main__":
    main()
