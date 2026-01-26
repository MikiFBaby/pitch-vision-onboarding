/**
 * Format Merged Transcript v2 - With Overlap Splitting
 *
 * This is the updated code for the "Format Merged Transcript" node in QA v2: AI Analysis
 *
 * CHANGE: Added logic to split segments when speakers overlap, creating proper turn-taking
 *
 * Copy this entire code block into the n8n Code node to replace the existing version.
 */

// Merge and format transcripts from both channels
// v2: Added OVERLAP SPLITTING - splits segments when another speaker talks within them
// Uses EXCLUSIVE TIME WINDOWS - each second assigned to one speaker only
// Timeline markers generated from COMBINED transcript for high diarization accuracy
//
// CHANNEL ASSIGNMENT (v5.9 CORRECTED):
// Channel 0 (Left) = AGENT (the person who initiates the call, introduces themselves)
// Channel 1 (Right) = CUSTOMER (the person being called)
//
const items = $input.all();
const trigger = $('Execute Workflow Trigger').first().json;

// Sort by channel
const sorted = items.sort((a, b) => (a.json.channel || 0) - (b.json.channel || 0));

// Get the recording_url from the first item
const recordingUrl = items[0]?.json?.recording_url || trigger.recording_url || '';

// Parse transcript data - CORRECTED CHANNEL ASSIGNMENT (v5.9)
// Channel 0 = Agent (initiates call), Channel 1 = Customer (receives call)
const agentTranscript = sorted.find(i => i.json.channel === 0)?.json.result_data || '{}';
const customerTranscript = sorted.find(i => i.json.channel === 1)?.json.result_data || '{}';

let agentData, customerData;
try {
  agentData = typeof agentTranscript === 'string' ? JSON.parse(agentTranscript) : agentTranscript;
  customerData = typeof customerTranscript === 'string' ? JSON.parse(customerTranscript) : customerTranscript;
} catch (e) {
  agentData = { segments: [] };
  customerData = { segments: [] };
}

const agentSegments = agentData.segments || [];
const customerSegments = customerData.segments || [];

// ===== NEW: SPLIT OVERLAPPING SEGMENTS =====
// When a segment from one speaker contains a segment from the other speaker,
// split the longer segment to create proper turn-taking

function splitOverlappingSegments(primarySegments, secondarySegments, primarySpeaker, secondarySpeaker) {
  const result = [];

  for (const seg of primarySegments) {
    // Find any secondary segments that START within this primary segment's time range
    const overlapping = secondarySegments.filter(sec =>
      sec.start > seg.start && sec.start < seg.end
    ).sort((a, b) => a.start - b.start);

    if (overlapping.length === 0) {
      // No overlap - keep segment as-is
      result.push({ ...seg, speaker: primarySpeaker });
    } else {
      // Split this segment at each overlap point
      let currentStart = seg.start;
      let remainingText = seg.text || '';
      const words = seg.words || []; // WhisperX provides word-level timestamps
      let wordIndex = 0;

      for (const overlapSeg of overlapping) {
        const splitPoint = overlapSeg.start;

        if (splitPoint > currentStart) {
          // Create segment from currentStart to splitPoint
          let segmentText = '';
          let segmentWords = [];

          if (words.length > 0) {
            // We have word-level timestamps - split accurately
            while (wordIndex < words.length && (words[wordIndex].end || words[wordIndex].start) <= splitPoint) {
              segmentText += (segmentText ? ' ' : '') + (words[wordIndex].word || '');
              segmentWords.push(words[wordIndex]);
              wordIndex++;
            }
          } else {
            // No word timestamps - estimate based on time proportion
            const totalDuration = seg.end - seg.start;
            const splitDuration = splitPoint - currentStart;
            const proportion = splitDuration / totalDuration;
            const totalWords = remainingText.split(/\s+/);
            const wordsToTake = Math.ceil(totalWords.length * proportion);
            segmentText = totalWords.slice(0, wordsToTake).join(' ');
            remainingText = totalWords.slice(wordsToTake).join(' ');
          }

          if (segmentText.trim()) {
            result.push({
              start: currentStart,
              end: splitPoint,
              text: segmentText.trim(),
              speaker: primarySpeaker,
              words: segmentWords.length > 0 ? segmentWords : undefined,
              split_from_overlap: true
            });
          }

          currentStart = overlapSeg.end; // Resume after the overlapping segment ends
        }
      }

      // Add remaining portion after last overlap
      if (currentStart < seg.end) {
        let remainingSegText = '';
        let remainingWords = [];

        if (words.length > 0 && wordIndex < words.length) {
          // Get remaining words
          while (wordIndex < words.length) {
            remainingSegText += (remainingSegText ? ' ' : '') + (words[wordIndex].word || '');
            remainingWords.push(words[wordIndex]);
            wordIndex++;
          }
        } else {
          remainingSegText = remainingText;
        }

        if (remainingSegText.trim()) {
          result.push({
            start: currentStart,
            end: seg.end,
            text: remainingSegText.trim(),
            speaker: primarySpeaker,
            words: remainingWords.length > 0 ? remainingWords : undefined,
            split_from_overlap: true
          });
        }
      }
    }
  }

  return result;
}

// Apply overlap splitting to both speakers
const splitAgentSegments = splitOverlappingSegments(agentSegments, customerSegments, 'Agent', 'Customer');
const splitCustomerSegments = splitOverlappingSegments(customerSegments, agentSegments, 'Customer', 'Agent');

// ===== MERGE SEGMENTS BY TIMESTAMP (Combined Transcript) =====
const allSegments = [
  ...splitAgentSegments,
  ...splitCustomerSegments
].sort((a, b) => (a.start || 0) - (b.start || 0));

// Format as conversation transcript with clickable time markers
const formattedTranscript = allSegments.map(seg => {
  const timestamp = Math.floor(seg.start || 0);
  const mins = Math.floor(timestamp / 60);
  const secs = timestamp % 60;
  const timeMarker = `${mins}:${secs.toString().padStart(2, '0')}`;
  return `[${timeMarker}] ${seg.speaker}: ${seg.text || ''}`;
}).join('\n');

// ===== EXCLUSIVE TIME WINDOWS CALCULATION =====
// Use the SPLIT segments for accurate metrics
const maxAgentEnd = splitAgentSegments.reduce((max, s) => Math.max(max, s.end || 0), 0);
const maxCustomerEnd = splitCustomerSegments.reduce((max, s) => Math.max(max, s.end || 0), 0);
const callDuration = Math.max(maxAgentEnd, maxCustomerEnd);
const totalSeconds = Math.ceil(callDuration);

const timeline = new Array(totalSeconds).fill(null);

// Mark agent speaking times
splitAgentSegments.forEach(seg => {
  const startSec = Math.floor(seg.start || 0);
  const endSec = Math.ceil(seg.end || 0);
  for (let i = startSec; i < endSec && i < totalSeconds; i++) {
    timeline[i] = 'agent';
  }
});

// Mark customer speaking times (don't overwrite agent)
splitCustomerSegments.forEach(seg => {
  const startSec = Math.floor(seg.start || 0);
  const endSec = Math.ceil(seg.end || 0);
  for (let i = startSec; i < endSec && i < totalSeconds; i++) {
    if (timeline[i] !== 'agent') {
      timeline[i] = 'customer';
    }
  }
});

let agentSeconds = 0;
let customerSeconds = 0;
let silenceSeconds = 0;

timeline.forEach(speaker => {
  if (speaker === 'agent') agentSeconds++;
  else if (speaker === 'customer') customerSeconds++;
  else silenceSeconds++;
});

const totalSpeakingTime = agentSeconds + customerSeconds;
const agentPercent = totalSpeakingTime > 0 ? Math.round((agentSeconds / totalSpeakingTime) * 100) : 0;
const customerPercent = totalSpeakingTime > 0 ? 100 - agentPercent : 0;

const talkRatio = customerSeconds > 0 ? (agentSeconds / customerSeconds).toFixed(2) : 'N/A';
const dominantSpeaker = agentPercent > 60 ? 'agent' : customerPercent > 60 ? 'customer' : 'balanced';

// Build comprehensive speaker metrics
const speakerMetrics = {
  agent_turn_count: splitAgentSegments.length,
  customer_turn_count: splitCustomerSegments.length,
  agent_speaking_time: agentSeconds,
  customer_speaking_time: customerSeconds,
  total_speaking_time: totalSpeakingTime,
  silence_time: silenceSeconds,
  agent_speaking_pct: agentPercent,
  customer_speaking_pct: customerPercent,
  agent_time_formatted: `${Math.floor(agentSeconds / 60)}m ${(agentSeconds % 60)}s`,
  customer_time_formatted: `${Math.floor(customerSeconds / 60)}m ${(customerSeconds % 60)}s`,
  talk_ratio: talkRatio,
  dominant_speaker: dominantSpeaker,
  call_duration_seconds: totalSeconds
};

// ===== TIMELINE MARKERS FROM COMBINED TRANSCRIPT =====
// Generate markers from actual segment boundaries for accurate audio playback
const timelineMarkers = [];
let lastSpeaker = null;
let segmentIndex = 0;

// Add marker for each segment in the combined transcript
allSegments.forEach((seg, idx) => {
  const startSec = Math.floor(seg.start || 0);
  const mins = Math.floor(startSec / 60);
  const secs = startSec % 60;
  const timeFormatted = `${mins}:${secs.toString().padStart(2, '0')}`;

  // Detect speaker change
  const isSpeakerChange = lastSpeaker !== null && lastSpeaker !== seg.speaker;

  // Get a preview of the text (first 50 chars)
  const textPreview = (seg.text || '').substring(0, 50) + ((seg.text || '').length > 50 ? '...' : '');

  // Add marker for:
  // 1. First segment (call start)
  // 2. Speaker changes
  // 3. Every 5th segment (ensure regular coverage)
  // 4. Segments with longer pauses (gap > 2 seconds from previous)
  const prevEnd = idx > 0 ? (allSegments[idx - 1].end || 0) : 0;
  const gap = seg.start - prevEnd;
  const hasSignificantPause = gap > 2;

  if (idx === 0 || isSpeakerChange || idx % 5 === 0 || hasSignificantPause) {
    timelineMarkers.push({
      time_seconds: startSec,
      time_formatted: timeFormatted,
      speaker: seg.speaker.toLowerCase(),
      is_speaker_change: isSpeakerChange,
      has_pause_before: hasSignificantPause,
      pause_duration: hasSignificantPause ? Math.round(gap) : 0,
      text_preview: textPreview,
      segment_index: idx
    });
  }

  lastSpeaker = seg.speaker;
});

// Ensure we have a marker at the end
if (allSegments.length > 0) {
  const lastSeg = allSegments[allSegments.length - 1];
  const endSec = Math.ceil(lastSeg.end || lastSeg.start || 0);
  const lastMarkerTime = timelineMarkers.length > 0 ? timelineMarkers[timelineMarkers.length - 1].time_seconds : -1;

  if (endSec - lastMarkerTime > 10) {
    const mins = Math.floor(endSec / 60);
    const secs = endSec % 60;
    timelineMarkers.push({
      time_seconds: endSec,
      time_formatted: `${mins}:${secs.toString().padStart(2, '0')}`,
      speaker: 'end',
      is_speaker_change: false,
      has_pause_before: false,
      pause_duration: 0,
      text_preview: '[End of call]',
      segment_index: allSegments.length
    });
  }
}

return [{
  json: {
    job_id: trigger.job_id,
    batch_id: trigger.batch_id,
    file_name: items[0]?.json?.audio_file || trigger.file_name || 'unknown',
    recording_url: recordingUrl,
    transcript: formattedTranscript,
    agent_segments: splitAgentSegments,
    customer_segments: splitCustomerSegments,
    all_segments: allSegments,
    total_segments: allSegments.length,
    speaker_metrics: speakerMetrics,
    timeline_markers: timelineMarkers,
    call_duration_seconds: totalSeconds,
    // v2 metadata
    overlap_splitting_applied: true,
    original_agent_segment_count: agentSegments.length,
    original_customer_segment_count: customerSegments.length
  }
}];
