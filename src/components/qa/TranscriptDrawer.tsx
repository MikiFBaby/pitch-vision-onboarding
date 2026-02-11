"use client";

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { CallData } from '@/types/qa-types';
import {
  X, Play, Pause, Loader2, Clock, CheckCircle2, XCircle,
  BarChart3, MessageSquare, Sparkles, FastForward, Rewind,
  Volume2, VolumeX, ShieldCheck, Zap, Check, Search, ExternalLink,
  Settings2, ChevronRight, Activity, MousePointer2, Calendar, Copy, Quote, AlertTriangle, MoreHorizontal,
  FileText, Lightbulb, Flag, User, Headphones, Award, CheckCircle, Sliders, Hash, Bookmark, ArrowRight, Minus, Plus, ChevronDown, ChevronUp,
  Brain, BrainCircuit, Eye, FileSearch, AlertCircle, ClipboardCheck, Send, GraduationCap, ClipboardList, Users, Layers, Maximize2, Minimize2, Target, Phone
} from 'lucide-react';
import { NeonButton } from './ui/NeonButton';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase-client';

interface AutoFailOverrideData {
  overridden: boolean;
  reason: string;
  originalScore: number;
  recalculatedScore: number;
}

interface ManualAutoFailData {
  afCode: string;
  violation: string;
  evidence: string;
  reason: string;
}

interface TranscriptDrawerProps {
  call: CallData | null;
  onClose: () => void;
  onScoreUpdate?: (callId: number | string, newScore: number) => void;
  onQASubmit?: (callId: string, reviewerName: string, notes?: string, autoFailOverride?: AutoFailOverrideData) => Promise<void>;
  onManualAutoFail?: (callId: string, data: ManualAutoFailData, reviewerName: string) => Promise<void>;
}

const DEEP_INSIGHT_PROMPTS = [
  {
    icon: FileText,
    label: "Draft Coaching Email",
    query: "Draft a short, professional coaching email to this agent. Include 2 specific positive behaviors from the call and 1 constructive actionable item for improvement based on the transcript."
  },
  {
    icon: ShieldCheck,
    label: "Compliance Root Cause",
    query: "Analyze the root cause of the risk score/compliance deduction. Was it a script adherence issue, a tone issue, or a missing legal disclosure? Quote the exact moment of failure."
  },
  {
    icon: Zap,
    label: "Objection Critique",
    query: "Identify the customer's primary objection. Rate the agent's rebuttal on a scale of 1-5 and suggest a more effective phrasing they could have used."
  },
  {
    icon: Activity,
    label: "Sentiment Shift Analysis",
    query: "Break down the call into three stages (Beginning, Middle, End) and analyze the sentiment shift of the customer. Where did the mood change and why?"
  },
  {
    icon: Lightbulb,
    label: "Missed Revenue Check",
    query: "Did the agent miss any cross-sell or up-sell cues? Quote the specific moment the customer showed interest or implied a need."
  }
];

// --- Rich Text Renderer for AI Responses ---
const FormattedCoachResponse = ({ text }: { text: string }) => {
  // Split by newlines to handle block-level elements
  const lines = text.split('\n');

  // Helper to parse bold text (**text**) into spans
  const parseInlineStyles = (line: string) => {
    const parts = line.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <span key={i} className="font-bold text-white bg-white/10 px-1.5 py-0.5 rounded text-[13px] mx-0.5 shadow-sm border border-white/5">
            {part.slice(2, -2)}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div className="space-y-3 font-sans">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        // 1. Headers (### or "Title:")
        if (trimmed.startsWith('###') || trimmed.match(/^[A-Za-z\s]+:$/) || trimmed.startsWith('**Step')) {
          return (
            <h4 key={idx} className="text-xs font-black text-purple-300 uppercase tracking-widest mt-5 mb-2 flex items-center gap-2 border-b border-white/10 pb-1">
              {trimmed.startsWith('###') ? trimmed.replace(/#/g, '') : trimmed.replace(/\*/g, '')}
            </h4>
          );
        }

        // 2. Lists (* or -)
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.match(/^\d+\./)) {
          return (
            <div key={idx} className="flex gap-3 items-start pl-1">
              <div className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              <p className="text-slate-200 text-sm leading-relaxed">
                {parseInlineStyles(trimmed.replace(/^[\*\-]\s|\d+\.\s/, ''))}
              </p>
            </div>
          );
        }

        // 3. Evidence/Quotes (Starts with "Evidence:" or ">")
        if (trimmed.toLowerCase().startsWith('evidence:') || trimmed.toLowerCase().startsWith('quote:') || trimmed.startsWith('>')) {
          const content = trimmed.replace(/^(evidence:|quote:|>)\s*/i, '');
          return (
            <div key={idx} className="bg-purple-500/10 border-l-2 border-purple-500 p-3 rounded-r-lg my-2">
              <div className="flex items-center gap-2 mb-1">
                <Quote size={12} className="text-purple-400" />
                <span className="text-[10px] font-bold text-purple-300 uppercase">Transcript Evidence</span>
              </div>
              <p className="text-sm text-purple-100 italic font-medium leading-relaxed">"{content.replace(/"/g, '')}"</p>
            </div>
          )
        }

        // 4. Standard Paragraph
        return (
          <p key={idx} className="text-slate-300 text-sm leading-relaxed">
            {parseInlineStyles(trimmed)}
          </p>
        );
      })}
    </div>
  );
};

export const TranscriptDrawer: React.FC<TranscriptDrawerProps> = ({ call, onClose, onScoreUpdate, onQASubmit, onManualAutoFail }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<'analysis' | 'transcript'>('analysis');
  const [isExpanded, setIsExpanded] = useState(false); // Drawer expansion toggle
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [expandedAuditIdx, setExpandedAuditIdx] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Coach interaction state
  const [coachQuery, setCoachQuery] = useState('');
  const [coachMessages, setCoachMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [isCoachThinking, setIsCoachThinking] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const coachSectionRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const activeTranscriptRef = useRef<HTMLDivElement | null>(null);

  // Audio Sync Offset (in seconds) - allows user to manually align text with audio
  const [syncOffset, setSyncOffset] = useState(0);

  // Hover state for markers
  const [hoveredMarker, setHoveredMarker] = useState<number | string | null>(null);

  // Get current logged-in user for override tracking
  const { user, profile } = useAuth();

  // Local state to track overrides without page reload
  const [localOverrides, setLocalOverrides] = useState<{ [key: string]: string }>({});


  // Local score that updates based on overrides
  const [localScore, setLocalScore] = useState<number | null>(null);

  // Track which low-confidence items have been manually reviewed
  const [reviewedItems, setReviewedItems] = useState<Set<string>>(new Set());

  // Toggle for confidence evidence details
  const [showConfidenceDetails, setShowConfidenceDetails] = useState(false);

  // QA Review state
  const [qaReviewNotes, setQaReviewNotes] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Local tags state for immediate UI feedback
  const [localTags, setLocalTags] = useState<string[]>([]);

  // Auto-fail override state - allows QA to override false positive auto-fails
  const [autoFailOverride, setAutoFailOverride] = useState(false);
  const [autoFailOverrideReason, setAutoFailOverrideReason] = useState('');

  // Manual auto-fail state - allows QA to flag missed auto-fails
  const [showManualAutoFail, setShowManualAutoFail] = useState(false);
  const [manualAfCode, setManualAfCode] = useState('AF-01');
  const [manualAfEvidence, setManualAfEvidence] = useState('');
  const [manualAfReason, setManualAfReason] = useState('');
  const [isSubmittingManualAF, setIsSubmittingManualAF] = useState(false);

  // Initialize override state from database when call changes
  useEffect(() => {
    if (call) {
      // Check if this call was previously overridden (from database)
      const wasOverridden = call.autoFailOverridden === true;
      const savedReason = call.autoFailOverrideReason || '';
      setAutoFailOverride(wasOverridden);
      setAutoFailOverrideReason(savedReason);
    } else {
      setAutoFailOverride(false);
      setAutoFailOverrideReason('');
    }
  }, [call?.id]);

  // Confidence threshold for requiring manual review
  const CONFIDENCE_THRESHOLD = 90;

  // Computed auto-fail data with fallback to call_analysis (n8n extraction bug workaround)
  const effectiveAutoFailTriggered = useMemo(() => {
    // Check if auto-fail was triggered
    const flagged = call?.autoFailTriggered === true || call?.callAnalysis?.auto_fail_triggered === true;
    if (!flagged) return false;

    // If flagged, verify there are actual (non-warning) auto-fail reasons
    // This prevents severity:'warning' items (like speaker swap) from triggering auto-fail display
    const reasons = (call?.autoFailReasons && Array.isArray(call.autoFailReasons) && call.autoFailReasons.length > 0)
      ? call.autoFailReasons
      : (call?.callAnalysis?.auto_fail_reasons && Array.isArray(call.callAnalysis.auto_fail_reasons))
        ? call.callAnalysis.auto_fail_reasons
        : [];
    const realAutoFails = reasons.filter((r: any) => typeof r === 'string' || r?.severity !== 'warning');
    // If the only reasons are warnings, don't treat as auto-fail
    if (reasons.length > 0 && realAutoFails.length === 0) return false;

    return true;
  }, [call?.autoFailTriggered, call?.callAnalysis?.auto_fail_triggered, call?.autoFailReasons, call?.callAnalysis?.auto_fail_reasons]);

  const effectiveAutoFailReasons = useMemo(() => {
    // First check top-level column if it's a valid array
    if (call?.autoFailReasons && Array.isArray(call.autoFailReasons) && call.autoFailReasons.length > 0) {
      return call.autoFailReasons;
    }
    // Fallback to call_analysis
    if (call?.callAnalysis?.auto_fail_reasons && Array.isArray(call.callAnalysis.auto_fail_reasons)) {
      return call.callAnalysis.auto_fail_reasons;
    }
    return [];
  }, [call?.autoFailReasons, call?.callAnalysis?.auto_fail_reasons]);

  // Auto-tagging logic based on score


  useEffect(() => {
    if (call?.qaNotes) {
      try {
        // Only attempt JSON parse if it looks like JSON (starts with { or [)
        const notesStr = String(call.qaNotes).trim();
        if (notesStr.startsWith('{') || notesStr.startsWith('[')) {
          const notes = JSON.parse(notesStr);
          if (notes.tags && Array.isArray(notes.tags)) {
            setLocalTags(notes.tags);
          }
        }
        // Plain text notes are valid - just don't try to parse them as JSON
      } catch (e) {
        // Silently ignore parse errors for plain text notes
      }
    }
  }, [call?.qaNotes]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [coachMessages, isCoachThinking]);

  // Auto-scroll active transcript line into view
  useEffect(() => {
    if (activeTab === 'transcript' && activeTranscriptRef.current) {
      activeTranscriptRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentTime, activeTab]);

  // Auto-tagging logic based on score (must be at top level, not in JSX)
  useEffect(() => {
    if (!call || call.complianceScore === undefined) return;

    const scoreVal = typeof call.complianceScore === 'number'
      ? call.complianceScore
      : parseInt(String(call.complianceScore || 0).replace(/\/.*$/, ''), 10);

    setLocalTags(prev => {
      const next = new Set(prev);

      // 1. Remove stale auto-tags based on new score
      if (scoreVal >= 50) next.delete('escalated');
      if (scoreVal < 85) next.delete('training_review');

      // 2. Add correct auto-tags
      if (scoreVal < 50) next.add('escalated');
      else if (scoreVal >= 85) next.add('training_review');

      const nextArray = Array.from(next);
      // Only update if changed to avoid re-renders
      if (JSON.stringify(nextArray.sort()) !== JSON.stringify(prev.sort())) {
        return nextArray;
      }
      return prev;
    });
  }, [call?.complianceScore]);


  const handleTimeUpdate = () => {
    if (audioRef.current) {
      // Always use the audio element's actual duration as the source of truth
      const actualDuration = audioRef.current.duration;
      const currentAudioTime = audioRef.current.currentTime;

      // If we've reached the end, stop playing
      if (currentAudioTime >= actualDuration && !isNaN(actualDuration)) {
        audioRef.current.pause();
        setIsPlaying(false);
        setCurrentTime(actualDuration); // Show exactly at end
      } else {
        setCurrentTime(currentAudioTime);
      }

      // Update duration state if it hasn't been set yet
      if (!duration && actualDuration && !isNaN(actualDuration)) {
        setDuration(actualDuration);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const actualDuration = audioRef.current.duration;
      console.log('Audio loaded - actual duration:', actualDuration, 'metadata duration:', call?.duration);
      setDuration(actualDuration);
      audioRef.current.volume = volume;
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const parseTimeToSeconds = (timeStr: string) => {
    if (!timeStr) return 0;

    // Clean up: remove surrounding brackets/parens, trim
    let clean = timeStr.replace(/[\[\]\(\)]/g, '').trim();

    // Handle "X seconds" or "Xs" e.g. "14s", "14 seconds"
    if (/^\d+\s*(s|sec|seconds)$/i.test(clean)) {
      return parseInt(clean, 10);
    }

    // Handle range "0:20-0:49" -> take 0:20
    if (clean.includes('-')) {
      clean = clean.split('-')[0].trim();
    }

    // Handle "MM:SS" or "HH:MM:SS" with potential trailing text
    // Extract the first occurrence of \d+:\d+(:\d+)?
    const match = clean.match(/(\d+):(\d+)(?::(\d+))?/);
    if (match) {
      const p1 = parseInt(match[1], 10);
      const p2 = parseInt(match[2], 10);
      const p3 = match[3] ? parseInt(match[3], 10) : 0;

      if (match[3]) {
        // HH:MM:SS
        return p1 * 3600 + p2 * 60 + p3;
      } else {
        // MM:SS
        return p1 * 60 + p2;
      }
    }

    return 0;
  };

  const handleSeek = (time: string | number) => {
    if (audioRef.current) {
      const seconds = typeof time === 'string' ? parseTimeToSeconds(time) : time;
      // Ensure we have a valid duration to clamp to
      const maxDur = duration || parseTimeToSeconds(call?.duration || "0:00") || 1;
      audioRef.current.currentTime = Math.min(seconds, maxDur);
      setCurrentTime(audioRef.current.currentTime);
      if (!isPlaying) {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    // Use state duration or fallback to parsed metadata string
    const activeDuration = duration || parseTimeToSeconds(call?.duration || "0:00");
    if (!activeDuration) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    handleSeek(pct * activeDuration);
  };

  const scrollToCoach = () => {
    setActiveTab('analysis');
    setTimeout(() => {
      if (coachSectionRef.current) {
        coachSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const handleAskCoach = async (prompt?: string) => {
    const textToSend = prompt || coachQuery;
    if (!textToSend.trim() || !call) return;

    setCoachQuery('');
    setCoachMessages(prev => [...prev, { role: 'user', text: textToSend }]);
    setIsCoachThinking(true);

    try {
      const response = await fetch('/api/ai/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToSend,
          context: {
            callId: call.id,
            callDate: call.createdAt,
            duration: call.duration,
            phoneNumber: call.phoneNumber,
            agentName: call.agentName,
            campaignType: call.campaignType,
            complianceScore: call.complianceScore,
            riskLevel: call.riskLevel,
            transcript: call.transcript,
            reviewerName: profile?.first_name && profile?.last_name
              ? `${profile.first_name} ${profile.last_name}`
              : user?.displayName || 'QA Reviewer',
            reviewerRole: profile?.role || profile?.job_title || 'QA Compliance Coach'
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      const answer = data.response || "I couldn't generate a response.";
      setCoachMessages(prev => [...prev, { role: 'model', text: answer }]);
    } catch (e: any) {
      setCoachMessages(prev => [...prev, { role: 'model', text: e.message || "Connection error. Please try again." }]);
    } finally {
      setIsCoachThinking(false);
    }
  };

  const handleToggleOverride = (itemName: string, currentStatus: string) => {
    const itemKey = itemName.toLowerCase();
    // Toggle logic: if currently passing, make it fail, and vice versa
    const isCurrentlyPassing = ['met', 'pass', 'yes', 'true'].includes(currentStatus.toLowerCase());
    const newStatus = isCurrentlyPassing ? 'fail' : 'pass';

    setLocalOverrides(prev => ({
      ...prev,
      [itemKey]: newStatus
    }));

    // Toast feedback
    setToast({
      message: `Marked "${itemName}" as ${newStatus.toUpperCase()}`,
      type: newStatus === 'pass' ? 'success' : 'error'
    });
  };

  // Enhanced checklist parser to handle various formats from n8n
  const getChecklistArray = (cl: any) => {
    if (!cl) return [];

    // Helper to extract and normalize time from various field names
    const extractTime = (item: any): string | undefined => {
      // Check various possible time field names
      const timeField = item.time || item.timestamp || item.start_time ||
        item.speaker_start || item.startTime || item.timeStamp;

      if (!timeField) return undefined;

      // If it's a number (seconds), convert to M:SS format
      if (typeof timeField === 'number') {
        const mins = Math.floor(timeField / 60);
        const secs = Math.floor(timeField % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
      }

      // If it's already a string, return as-is
      return String(timeField);
    };

    // Already an array
    if (Array.isArray(cl)) {
      return cl.map((item, idx) => {
        // If item is just a string, convert to object
        if (typeof item === 'string') {
          return { name: item, status: 'PASS' };
        }
        // Ensure name and time are present
        return {
          ...item,
          name: item.name || item.requirement || item.requirement_name || `Item ${idx + 1}`,
          time: extractTime(item)
        };
      });
    }

    // Object format: {"recorded_line": {status: "PASS", evidence: "..."}} 
    if (typeof cl === 'object') {
      return Object.entries(cl).map(([key, value]: [string, any]) => {
        // Convert snake_case/camelCase key to readable name
        const readableName = key
          .replace(/_/g, ' ')  // snake_case -> spaces
          .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase -> spaces
          .replace(/\b\w/g, c => c.toUpperCase())  // Capitalize words
          .trim();

        // Value might be an object with status, or just a string status
        if (typeof value === 'string') {
          return { name: readableName, status: value };
        }

        return {
          ...value,
          name: value?.name || readableName,
          status: value?.status || 'PASS',
          time: extractTime(value)
        };
      });
    }

    return [];
  };

  // Calculate confidence for each item based on real data
  const calculateItemConfidence = (item: any): number => {
    let confidence = 70; // Base confidence

    // 1. Evidence quality (0-15 points)
    const evidence = item.evidence || '';
    if (evidence.length > 100) confidence += 15; // Detailed evidence
    else if (evidence.length > 50) confidence += 10;
    else if (evidence.length > 20) confidence += 5;
    else if (evidence.length === 0) confidence -= 10; // No evidence = lower confidence

    // 2. Notes presence and detail (0-10 points)
    const notes = item.notes || '';
    if (notes.length > 80) confidence += 10;
    else if (notes.length > 40) confidence += 7;
    else if (notes.length > 0) confidence += 3;

    // 3. Sub-checks consistency (if present) (-10 to +5 points)
    if (item.sub_checks && typeof item.sub_checks === 'object') {
      const subCheckValues = Object.values(item.sub_checks) as string[];
      const passCount = subCheckValues.filter((v: string) =>
        v?.toUpperCase?.()?.includes('PASS') || v?.toUpperCase?.()?.includes('YES')
      ).length;
      const failCount = subCheckValues.filter((v: string) =>
        v?.toUpperCase?.()?.includes('FAIL') || v?.toUpperCase?.()?.includes('NO')
      ).length;
      const naCount = subCheckValues.filter((v: string) =>
        v?.toUpperCase?.()?.includes('N/A') || v?.toUpperCase?.()?.includes('PARTIAL')
      ).length;

      // Mixed results = lower confidence (uncertainty)
      if (passCount > 0 && failCount > 0) {
        confidence -= 10; // Inconsistent sub-checks
      } else if (naCount > passCount + failCount) {
        confidence -= 5; // Mostly N/A = uncertain
      } else {
        confidence += 5; // Consistent sub-checks
      }
    }

    // 4. Weight affects confidence slightly (critical items are usually clearer)
    const weight = (item.weight || '').toUpperCase();
    if (weight === 'CRITICAL') confidence += 3;
    else if (weight === 'HIGH') confidence += 2;

    // 5. AUTO-FAIL notes indicate high certainty
    if (notes.toUpperCase().includes('AUTO-FAIL') || notes.toUpperCase().includes('AUTO FAIL')) {
      confidence += 5;
    }

    // 6. Partial matches reduce confidence
    if (notes.toUpperCase().includes('PARTIAL') || evidence.toUpperCase().includes('PARTIAL')) {
      confidence -= 5;
    }

    // Clamp between 50 and 100
    return Math.min(100, Math.max(50, confidence));
  };

  const fullAuditList = useMemo(() => {
    // Try primary checklist first, fall back to call_analysis.checklist if empty/string
    let checklistData = call?.checklist;

    // If checklist is a string (broken data) or empty, try call_analysis.checklist
    if (!checklistData || typeof checklistData === 'string' ||
        (Array.isArray(checklistData) && checklistData.length === 0) ||
        (typeof checklistData === 'object' && Object.keys(checklistData).length === 0)) {
      checklistData = call?.callAnalysis?.checklist;
    }

    const parsed = getChecklistArray(checklistData);

    // Helper to parse time strings like "0:18", "1:21", "00:40" to seconds
    const timeToSeconds = (timeStr: string | undefined): number => {
      if (!timeStr) return 999999; // Put items without time at the end
      const match = timeStr.match(/(\d+):(\d+)/);
      if (!match) return 999999;
      return parseInt(match[1]) * 60 + parseInt(match[2]);
    };

    // Helper to normalize confidence - handles both decimal (0.95) and percentage (95) formats
    const normalizeConfidence = (conf: any): number => {
      if (conf === undefined || conf === null) return 0;
      const num = typeof conf === 'string' ? parseFloat(conf) : conf;
      // If <= 1, likely a decimal (0.95 = 95%), multiply by 100
      // If > 1 but <= 100, already a percentage
      if (num <= 1) return Math.round(num * 100);
      return Math.round(num);
    };

    // Sort by timestamp and attach confidence
    return parsed.sort((a: any, b: any) => {
      const timeA = timeToSeconds(a.time || a.timestamp || a.start_time);
      const timeB = timeToSeconds(b.time || b.timestamp || b.start_time);
      return timeA - timeB;
    }).map((item: any) => {
      // Use API confidence if available and valid, otherwise calculate
      const apiConfidence = item.confidence;
      const calculatedConf = calculateItemConfidence(item);

      // Normalize API confidence if provided
      const normalizedApiConf = apiConfidence !== undefined ? normalizeConfidence(apiConfidence) : null;

      // Use API confidence only if it's valid (> 10), otherwise use calculated
      // This handles cases where AI returns 0 or very low values incorrectly
      const finalConfidence = (normalizedApiConf !== null && normalizedApiConf > 10)
        ? normalizedApiConf
        : calculatedConf;

      return {
        ...item,
        confidence: finalConfidence
      };
    });
  }, [call?.checklist, call?.callAnalysis?.checklist]);

  // Frontend phrase detection for flagging potential AI false positives/negatives
  const transcriptFlags = useMemo(() => {
    const transcript = (call?.transcript || '').toLowerCase();
    if (!transcript) return {};

    // Define detection patterns for critical compliance items
    const detectionPatterns: { [key: string]: { patterns: string[], itemKeys: string[] } } = {
      recorded_line: {
        patterns: [
          'recorded line', 'recorded call', 'call is recorded', 'call is being recorded',
          'on a recorded', 'this call may be recorded', 'call may be monitored',
          'recorded for quality', 'recording this call', 'line is recorded'
        ],
        itemKeys: ['recorded_line_disclosure', 'recorded line', 'recorded line disclosure']
      },
      verbal_consent: {
        patterns: [
          'is that okay', 'is that ok', 'sound good', 'sounds good', 'alright with you',
          'okay with you', 'do you agree', 'do you consent', 'are you okay with',
          'can i transfer', 'may i transfer', 'ready to speak'
        ],
        itemKeys: ['verbal_consent_to_transfer', 'verbal consent', 'transfer consent']
      },
      medicare_verification: {
        patterns: [
          'part a and b', 'part a and part b', 'parts a and b', 'medicare a and b',
          'a and b medicare', 'both parts', 'both part a'
        ],
        itemKeys: ['medicare_ab_verification', 'medicare part', 'medicare a&b', 'medicare verification']
      },
      rwb_card: {
        patterns: [
          'red white and blue', 'red, white, and blue', 'red white blue',
          'rwb card', 'medicare card'
        ],
        itemKeys: ['rwb_card_verification', 'rwb card', 'red white blue', 'red, white, blue']
      }
    };

    const flags: { [itemKey: string]: { found: boolean, matchedPhrase?: string, position?: number } } = {};

    // Check each pattern group
    Object.entries(detectionPatterns).forEach(([category, { patterns, itemKeys }]) => {
      let found = false;
      let matchedPhrase: string | undefined;
      let position: number | undefined;

      for (const pattern of patterns) {
        const idx = transcript.indexOf(pattern);
        if (idx !== -1) {
          found = true;
          matchedPhrase = pattern;
          position = idx;
          break;
        }
      }

      // Apply to all matching item keys
      itemKeys.forEach(key => {
        flags[key.toLowerCase()] = { found, matchedPhrase, position };
      });
    });

    return flags;
  }, [call?.transcript]);

  // Helper to check if an item has a potential false negative flag
  const getItemFlag = (itemName: string, status: string): { type: 'false_negative' | 'false_positive' | null, phrase?: string } => {
    const itemKey = itemName.toLowerCase();
    const isFail = !['met', 'pass', 'yes', 'true'].includes(status.toLowerCase());

    // Check against all flag keys
    for (const [flagKey, flagData] of Object.entries(transcriptFlags)) {
      if (itemKey.includes(flagKey) || flagKey.includes(itemKey.split(' ')[0])) {
        if (isFail && flagData.found) {
          // AI said FAIL but we found the phrase - potential false negative
          return { type: 'false_negative', phrase: flagData.matchedPhrase };
        }
        // Could add false_positive detection here if needed
      }
    }
    return { type: null };
  };

  const timelineMarkers = useMemo(() => {
    const list: { title: string, time: string, seconds: number, position: number, color: string, type: 'pass' | 'fail' | 'chapter' | 'transfer', isEstimated?: boolean }[] = [];

    // Calculate effective duration (audio object or metadata string)
    const effectiveDuration = duration > 0 ? duration : parseTimeToSeconds(call?.duration || "0:00");
    if (!effectiveDuration) return [];

    // Minimum time threshold (in seconds) - markers before this are likely before the call was actually answered
    // This filters out false markers at 0:00 or very early in the recording
    const MIN_MARKER_TIME_SECONDS = 5;

    // Parse database overrides
    let dbOverrides: any[] = [];
    try {
      const qaNotes = (call as any)?.qaNotes || (call as any)?.['QA Notes'];
      if (qaNotes) {
        const parsed = typeof qaNotes === 'string' ? JSON.parse(qaNotes) : qaNotes;
        dbOverrides = parsed.overrides || [];
      }
    } catch (e) { }

    // Helper to get effective status including overrides
    const getEffectiveStatus = (itemName: string, originalStatus: string): boolean => {
      const itemKey = itemName.toLowerCase();

      // Check local overrides first
      if (localOverrides[itemKey]) {
        return localOverrides[itemKey].toLowerCase() === 'pass';
      }

      // Check database overrides
      const dbOverride = dbOverrides.find((o: any) =>
        o.itemKey?.toLowerCase() === itemKey ||
        o.itemKey?.toLowerCase().includes(itemKey) ||
        itemKey.includes(o.itemKey?.toLowerCase() || '')
      );

      if (dbOverride) {
        return dbOverride.overrideStatus.toLowerCase() === 'pass';
      }

      return ['met', 'pass', 'yes', 'true'].includes(originalStatus.toLowerCase());
    };

    if (call?.chapters && call.chapters.length > 0) {
      call.chapters.forEach(c => {
        const secs = parseTimeToSeconds(c.startTime);
        const pos = (secs / effectiveDuration) * 100;
        if (pos <= 100) {
          list.push({ title: c.title, time: c.startTime, seconds: secs, position: pos, color: 'bg-indigo-500', type: 'chapter' });
        }
      });
    }

    // Add significant timeline events from database
    if (call?.timelineMarkers && call.timelineMarkers.length > 0) {
      call.timelineMarkers.forEach(m => {
        let timeVal = m.time;
        let secs = -1;

        // Priority 1: Use time_seconds if valid (this is often populated correctly when time is "N/A")
        const markerTimeSeconds = (m as any).time_seconds;
        if (markerTimeSeconds !== undefined && markerTimeSeconds !== null && markerTimeSeconds >= 0 && markerTimeSeconds !== -1) {
          secs = markerTimeSeconds;
          // Also generate timeVal for display if not already set
          if (!timeVal || timeVal === 'N/A') {
            timeVal = `${Math.floor(markerTimeSeconds / 60)}:${String(markerTimeSeconds % 60).padStart(2, '0')}`;
          }
        }
        // Priority 2: Parse time string
        else if (timeVal && timeVal !== 'N/A') {
          secs = parseTimeToSeconds(timeVal);
        }
        // Priority 3: Extract time from Evidence
        else if (m.evidence) {
          const match = m.evidence.match(/\[(\d+:\d+)\]/);
          if (match) {
            timeVal = match[1];
            secs = parseTimeToSeconds(timeVal);
          } else if (m.evidence.includes('[0:00]')) {
            timeVal = '0:00';
            secs = 0;
          }
        }

        // If still no valid time, skip this marker
        if (secs < 0) return;
        const pos = (secs / effectiveDuration) * 100;

        // Filter out markers before the call is actually live (e.g., during ringing/answering)
        // Also verify pos is valid number and within range
        if (secs >= MIN_MARKER_TIME_SECONDS && pos <= 100 && !isNaN(pos)) {
          const markerType = (m.type || '').toLowerCase();
          const markerStatus = (m.status || '').toLowerCase();

          // Determine marker type and color
          let type: 'pass' | 'fail' | 'chapter' | 'transfer' = 'fail';
          let color = 'bg-rose-500';

          if (markerType === 'transfer' || markerStatus === 'info') {
            type = 'transfer';
            color = 'bg-blue-500'; // Blue for LA transfer point
          } else if (markerStatus.includes('pass') || markerType === 'pass') {
            type = 'pass';
            color = 'bg-emerald-500';
          }

          list.push({
            title: m.title || m.event || m.item_key || 'Marker',
            time: timeVal,
            seconds: secs,
            position: pos,
            color: color,
            type: type
          });
        }
      });
    }

    // Add auto-fail violation markers (AF-01 through AF-14)
    if (call?.autoFailReasons && Array.isArray(effectiveAutoFailReasons)) {
      const warningOnlyCodes = ['AF-13']; // AF-13 is warning-only

      effectiveAutoFailReasons.forEach((reason: any, idx: number) => {
        const isString = typeof reason === 'string';
        const code = isString ? `AF-${String(idx + 1).padStart(2, '0')}` : (reason.code || `AF-${String(idx + 1).padStart(2, '0')}`);
        const violation = isString ? reason : (reason.violation || 'Violation');
        const timestamp = isString ? null : reason.timestamp;
        const isSeverityWarning = !isString && reason?.severity === 'warning';

        // Skip if no valid timestamp
        if (!timestamp || timestamp === '-1' || timestamp === '' || timestamp === 'N/A') return;

        const secs = parseTimeToSeconds(timestamp);
        const pos = (secs / effectiveDuration) * 100;

        if (secs >= MIN_MARKER_TIME_SECONDS && pos <= 100 && !isNaN(pos)) {
          const isWarning = warningOnlyCodes.includes(code) || isSeverityWarning;
          list.push({
            title: `${code}: ${violation}`,
            time: timestamp,
            seconds: secs,
            position: pos,
            color: isWarning ? 'bg-amber-500' : 'bg-rose-600',
            type: 'fail'
          });
        }
      });
    }

    // Process all checklist items with override support
    // Filter out N/A items first, then process
    const validItems = fullAuditList.filter((item: any) => {
      const status = (item.status || '').toLowerCase();
      return status !== 'n/a';
    });

    validItems.forEach((item: any, idx: number) => {
      const originalStatus = (item.status || '').toLowerCase();
      const itemName = item.name || item.requirement || 'Check';
      const isMet = getEffectiveStatus(itemName, originalStatus);

      // Use explicit time from multiple sources
      let timeStr = item.time || item.timestamp;
      let itemSecs = -1;
      let hasExplicitTime = false;

      // Priority 1: Use time_seconds if valid (this is often populated when time string is "N/A")
      if (item.time_seconds !== undefined && item.time_seconds !== null && item.time_seconds >= 0 && item.time_seconds !== -1) {
        itemSecs = item.time_seconds;
        hasExplicitTime = true;
        // Generate timeStr for display
        if (!timeStr || timeStr === 'N/A') {
          timeStr = `${Math.floor(item.time_seconds / 60)}:${String(item.time_seconds % 60).padStart(2, '0')}`;
        }
      }
      // Priority 2: Parse time string if valid
      else if (timeStr && timeStr !== 'N/A' && /^\d{1,2}:\d{2}$/.test(timeStr)) {
        itemSecs = parseTimeToSeconds(timeStr);
        hasExplicitTime = true;
      }
      // Priority 3: Estimate based on position in checklist
      else {
        const startOffset = effectiveDuration * 0.1; // Start at 10% of call
        const spreadDuration = effectiveDuration * 0.8; // Spread across 80% of call
        const estimatedSeconds = Math.round(startOffset + (idx / Math.max(validItems.length - 1, 1)) * spreadDuration);
        itemSecs = estimatedSeconds;
        const mins = Math.floor(estimatedSeconds / 60);
        const secs = estimatedSeconds % 60;
        timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
        hasExplicitTime = false;
      }
      const pos = (itemSecs / effectiveDuration) * 100;

      // For explicit timestamps, allow any position > 0
      // For estimated timestamps, use the minimum threshold
      const minTime = hasExplicitTime ? 1 : MIN_MARKER_TIME_SECONDS;

      if (pos <= 100 && itemSecs >= minTime) {
        list.push({
          title: itemName,
          time: timeStr,
          seconds: itemSecs,
          position: pos,
          color: isMet ? 'bg-emerald-500' : 'bg-rose-500',
          type: isMet ? 'pass' : 'fail',
          isEstimated: !hasExplicitTime
        });
      }
    });

    // Sort by seconds first
    list.sort((a, b) => a.seconds - b.seconds);

    // Spread overlapping markers visually
    // If markers are within 0.8% of each other, push the next one to the right
    // This assumes a visual width of roughly 0.8% prevents total overlap
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const curr = list[i];

      // If current is too close to previous (visual collision)
      if (curr.position - prev.position < 1.2) {
        // Shift current
        curr.position = prev.position + 1.2;
      }
    }

    // Clamp to 100% just in case
    list.forEach(item => {
      if (item.position > 100) item.position = 100;
    });

    return list;
  }, [call?.chapters, fullAuditList, duration, call?.duration, localOverrides, call?.timelineMarkers]);

  // Cluster markers that are too close together
  const clusteredMarkers = useMemo(() => {
    if (timelineMarkers.length === 0) return [];

    const clusters: { position: number, startTime: number, items: typeof timelineMarkers }[] = [];
    const THRESHOLD = 2.0; // % distance threshold for clustering

    // Sort by position first
    const sorted = [...timelineMarkers].sort((a, b) => a.position - b.position);

    let currentCluster = {
      position: sorted[0].position,
      startTime: sorted[0].seconds,
      items: [sorted[0]]
    };

    for (let i = 1; i < sorted.length; i++) {
      const marker = sorted[i];
      if (marker.position - currentCluster.position < THRESHOLD) {
        // Add to cluster
        currentCluster.items.push(marker);
      } else {
        // Push finished cluster
        clusters.push(currentCluster);
        // Start new cluster
        currentCluster = {
          position: marker.position,
          startTime: marker.seconds,
          items: [marker]
        };
      }
    }
    // Push final cluster
    clusters.push(currentCluster);

    return clusters;
  }, [timelineMarkers]);

  const waveformBars = useMemo(() => {
    return Array.from({ length: 60 }).map(() => Math.random() * 0.7 + 0.1);
  }, []);

  // Define scoring weights (total = 100 points)
  const SCORING_WEIGHTS: { [key: string]: number } = {
    'recorded line disclosure': 20,
    'company identification': 15,
    'geographic verification': 15,
    'eligibility verification': 20,
    'verbal consent': 15,
    'handoff execution': 10,
    'benefit mention': 5,
  };

  // Helper to get weight for an item based on name matching
  const getItemWeight = (itemName: string): number => {
    const nameLower = itemName.toLowerCase();
    for (const [key, weight] of Object.entries(SCORING_WEIGHTS)) {
      if (nameLower.includes(key) || key.includes(nameLower.split(' ')[0])) {
        return weight;
      }
    }
    // Default weight for unmatched items
    return 10;
  };

  // Scoring Logic Breakdown Calculation
  const { scoringBreakdown, calculatedScore, totalPossible, totalEarned, avgConfidence } = useMemo(() => {
    if (!call) return { scoringBreakdown: [], calculatedScore: 0, totalPossible: 0, totalEarned: 0, avgConfidence: 0 };

    const steps: any[] = [];
    let earnedPoints = 0;
    let possiblePoints = 0;

    // Parse QA overrides from database
    let dbOverrides: any[] = [];
    try {
      const qaNotes = (call as any).qaNotes || (call as any)['QA Notes'];
      if (qaNotes) {
        const parsed = typeof qaNotes === 'string' ? JSON.parse(qaNotes) : qaNotes;
        dbOverrides = parsed.overrides || [];
      }
    } catch (e) {
      // No overrides
    }

    // Helper to get override status (checks LOCAL first, then DB)
    const getEffectiveStatus = (itemName: string, originalStatus: string): { status: string; isOverridden: boolean } => {
      const itemKey = itemName.toLowerCase();

      // Check local overrides first (for immediate UI updates)
      if (localOverrides[itemKey]) {
        return {
          status: localOverrides[itemKey].toLowerCase() === 'pass' ? 'met' : 'fail',
          isOverridden: true
        };
      }

      // Check database overrides
      const dbOverride = dbOverrides.find((o: any) =>
        o.itemKey?.toLowerCase() === itemKey ||
        o.itemKey?.toLowerCase().includes(itemKey) ||
        itemKey.includes(o.itemKey?.toLowerCase() || '')
      );

      if (dbOverride) {
        return {
          status: dbOverride.overrideStatus.toLowerCase() === 'pass' ? 'met' : 'fail',
          isOverridden: true
        };
      }

      return { status: originalStatus.toLowerCase(), isOverridden: false };
    };

    // Process each checklist item
    fullAuditList.forEach((item: any) => {
      const requirementName = item.name || item.requirement || item.requirement_name || 'Requirement';
      const originalStatus = (item.status || '').toLowerCase();

      // Skip N/A items - they don't count toward score
      if (originalStatus === 'n/a') return;

      const { status, isOverridden } = getEffectiveStatus(requirementName, originalStatus);
      const isMet = ['met', 'pass', 'yes', 'true'].includes(status);
      const weight = getItemWeight(requirementName);

      possiblePoints += weight;

      if (isMet) {
        earnedPoints += weight;
        steps.push({
          label: isOverridden ? `${requirementName} (Verified)` : requirementName,
          earnedValue: weight,
          possibleValue: weight,
          type: 'positive',
          icon: CheckCircle2,
          description: isOverridden ? 'Manually verified by QA' : 'Compliance verified'
        });
      } else {
        steps.push({
          label: requirementName,
          earnedValue: 0,
          possibleValue: weight,
          type: 'negative',
          icon: XCircle,
          description: 'Not verified in call'
        });
      }
    });

    // Calculate AI confidence from real data (evidence, notes, sub_checks)
    const confidence = fullAuditList.length > 0
      ? fullAuditList.reduce((acc: number, item: any) => acc + calculateItemConfidence(item), 0) / fullAuditList.length
      : 0;

    // Calculate final score percentage
    const score = possiblePoints > 0 ? Math.round((earnedPoints / possiblePoints) * 100) : 0;

    return {
      scoringBreakdown: steps,
      calculatedScore: score,
      totalPossible: possiblePoints,
      totalEarned: earnedPoints,
      avgConfidence: Math.round(confidence)
    };
  }, [call, fullAuditList, localOverrides]);

  // Generate supporting evidence for confidence display
  const confidenceEvidence = useMemo(() => {
    if (fullAuditList.length === 0) return null;

    let strongEvidenceCount = 0;
    let detailedNotesCount = 0;
    let consistentSubChecksCount = 0;
    let mixedSubChecksCount = 0;
    let hasAutoFail = false;
    let hasPartialMatches = false;

    // Arrays to store names of items needing review
    const itemsMissingQuotes: string[] = [];
    const itemsWithBriefNotes: string[] = [];

    fullAuditList.forEach((item: any) => {
      const evidence = item.evidence || '';
      const notes = item.notes || '';
      const itemStatus = (item.status || '').toLowerCase();
      const isPass = itemStatus.includes('pass') || itemStatus.includes('met') || itemStatus.includes('yes');

      // Check for explicit quote key OR evidence resembling a quote
      const hasQuote = item.quote && item.quote.length > 5;

      // Count items with strong evidence (Explicit quote is best)
      if (hasQuote) {
        strongEvidenceCount++;
      } else {
        // Track items missing quotes for specific feedback
        // Only consider it a "gap" if it was a PASS (should have quote) 
        // OR if it's a FAIL without clear reasoning
        if (isPass) {
          // Pass without quote is suspicious
          itemsMissingQuotes.push(item.name || item.requirement || 'Unknown Item');
        } else {
          // Fail might not have quote (e.g. "Silence"), check reasoning len
          if (notes.length < 20) itemsMissingQuotes.push(item.name || item.requirement || 'Unknown Item');
        }
      }

      // Count items with detailed notes
      if (notes.length > 40) detailedNotesCount++;
      else itemsWithBriefNotes.push(item.name || item.requirement || 'Unknown Item');

      // Check sub-checks consistency

      // Check sub-checks consistency
      if (item.sub_checks && typeof item.sub_checks === 'object') {
        const subCheckValues = Object.values(item.sub_checks) as string[];
        const passCount = subCheckValues.filter((v: string) =>
          v?.toUpperCase?.()?.includes('PASS')
        ).length;
        const failCount = subCheckValues.filter((v: string) =>
          v?.toUpperCase?.()?.includes('FAIL')
        ).length;

        if (passCount > 0 && failCount > 0) {
          mixedSubChecksCount++;
        } else if (passCount > 0 || failCount > 0) {
          consistentSubChecksCount++;
        }
      }

      // Check for definitive markers
      if (notes.toUpperCase().includes('AUTO-FAIL') || notes.toUpperCase().includes('AUTO FAIL')) {
        hasAutoFail = true;
      }
      if (notes.toUpperCase().includes('PARTIAL') || evidence.toUpperCase().includes('PARTIAL')) {
        hasPartialMatches = true;
      }
    });

    const total = fullAuditList.length;
    const evidencePercent = Math.round((strongEvidenceCount / total) * 100);
    const notesPercent = Math.round((detailedNotesCount / total) * 100);

    return {
      total,
      strongEvidenceCount,
      detailedNotesCount,
      consistentSubChecksCount,
      mixedSubChecksCount,
      hasAutoFail,
      hasPartialMatches,
      evidencePercent,
      notesPercent,
      itemsMissingQuotes,
      itemsWithBriefNotes
    };
  }, [fullAuditList]);

  // Sync calculated score to database if it differs from stored score
  useEffect(() => {
    const syncScoreToDatabase = async () => {
      if (!call || calculatedScore === 0 || totalPossible === 0) return;

      // Only sync if there's a meaningful difference (more than rounding error)
      const storedScore = call.complianceScore || 0;
      if (Math.abs(calculatedScore - storedScore) < 1) return;

      console.log(`Score sync: stored=${storedScore}%, calculated=${calculatedScore}%`);

      try {
        const response = await fetch('/api/qa/update-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callId: String(call.id),
            newScore: calculatedScore,
            reason: 'Weighted score recalculation'
          })
        });

        if (response.ok) {
          console.log('Score synced to database:', calculatedScore);
          // Notify parent to update their local state with the new score
          if (onScoreUpdate) {
            onScoreUpdate(call.id, calculatedScore);
          }
        }
      } catch (err) {
        console.error('Failed to sync score:', err);
      }
    };

    // Debounce to avoid multiple updates
    const timer = setTimeout(syncScoreToDatabase, 1000);
    return () => clearTimeout(timer);
  }, [call?.id, calculatedScore, totalPossible, onScoreUpdate]);

  useEffect(() => {
    if (call) {
      setCurrentTime(0);
      setIsPlaying(false);
      setCoachMessages([]);
      setCoachQuery('');
      setExpandedAuditIdx(null);
      setAudioError(null); // Reset audio error for new call

      // Always default to analysis tab - user requested this
      setActiveTab('analysis');

      // Only set metadata duration if we don't have a duration yet
      // The actual audio element duration will be set in handleLoadedMetadata
      // and should always take priority
      if (!duration && call.duration) {
        const metadataDuration = parseTimeToSeconds(call.duration);
        console.log('Setting initial duration from metadata:', metadataDuration);
        setDuration(metadataDuration);
      }
    }
  }, [call?.id, timelineMarkers]); // Added timelineMarkers to ensure seek works once calculated

  // CRITICAL: When audio actually loads, always update to the real duration
  useEffect(() => {
    if (audioRef.current && audioRef.current.duration && !isNaN(audioRef.current.duration)) {
      const actualDuration = audioRef.current.duration;
      if (actualDuration > 0 && Math.abs(actualDuration - duration) > 1) {
        console.log('Audio element duration differs from state. Updating:', actualDuration, 'was:', duration);
        setDuration(actualDuration);
      }
    }
  }, [audioRef.current?.duration]);

  const parsedTranscript = useMemo(() => {
    if (!call?.transcript) return [];

    // 1. Initial Parse: Break lines and extract raw timestamps/speakers
    const rawLines = call.transcript.split(/\n+/).filter(l => l.trim().length > 0);
    const tempLines: any[] = [];

    let lastSpeaker = 'Unknown';
    let lastTime = '0:00';
    let lastStartSeconds = 0;

    rawLines.forEach((line, idx) => {
      let content = line.trim();
      let time = null;
      let speaker = null;

      // Extract Timestamp if present at start (e.g. [00:12], 00:12, (00:12))
      const timeMatch = content.match(/^\[?\(?(\d{1,2}:\d{2})\)?\]?\s*/);
      if (timeMatch) {
        time = timeMatch[1];
        content = content.replace(/^\[?\(?(\d{1,2}:\d{2})\)?\]?\s*/, '');
      }

      // Extract Speaker if present (e.g. "Agent Name:")
      const speakerMatch = content.match(/^([^:]+):\s*(.*)/);
      if (speakerMatch) {
        speaker = speakerMatch[1].trim();
        content = speakerMatch[2].trim();
      }

      // Fallback: If speaker is included in brackets like "Speaker [00:00]:"
      if (!time && speaker && speaker.match(/\[\d{1,2}:\d{2}\]/)) {
        const extraction = speaker.match(/(.*)\s+\[(\d{1,2}:\d{2})\]/);
        if (extraction) {
          speaker = extraction[1].trim();
          time = extraction[2];
        }
      }

      // Update state for continuation lines
      if (speaker) lastSpeaker = speaker;
      if (time) {
        lastTime = time;
        lastStartSeconds = parseTimeToSeconds(time);
      }

      tempLines.push({
        id: idx,
        original: line,
        time: time || (speaker ? lastTime : null),
        startSeconds: lastStartSeconds,
        speaker: speaker || lastSpeaker,
        content: content,
      });
    });

    // 2. Finalize & Correct Labels Per Line
    const agentNameParts = (call.agentName || '').toLowerCase().split(/\s+/).filter(p => p.length > 2);

    const processedLines = tempLines.map((line, i, arr) => {

      // A. Semantic Signal Score (-10 Customer ... +10 Agent)
      const t = line.content.toLowerCase();
      const contentLength = t.length;
      let semanticScore = 0;

      // LENGTH-BASED HEURISTIC: Long utterances are usually agents (scripts are verbose)
      if (contentLength > 150) semanticScore += 8; // Very long = likely agent script
      else if (contentLength > 80) semanticScore += 4; // Long = probably agent
      else if (contentLength < 20) semanticScore -= 4; // Short = probably customer response

      // AGENT SIGNALS (+) - Strong indicators
      if (t.includes('recorded line') || t.includes('recorded call')) semanticScore += 12;
      if (t.includes('calling from') || t.includes('calling on behalf')) semanticScore += 8;
      if (t.includes('my name is') && agentNameParts.some(p => t.includes(p))) semanticScore += 10;
      if (t.includes('reason for the call')) semanticScore += 6;
      if (t.includes('looking for') && contentLength < 60) semanticScore += 3;

      // AGENT SCRIPTED PITCH SIGNALS (+) - Sales/verification language
      if (t.includes('additional benefits') || t.includes('new benefits')) semanticScore += 10;
      if (t.includes('making sure you') || t.includes('just making sure')) semanticScore += 8;
      if (t.includes('not missing out') || t.includes("don't miss out")) semanticScore += 8;
      if (t.includes('i do need to confirm') || t.includes('need to confirm with you')) semanticScore += 10;
      if (t.includes('is that correct') || t.includes('that correct?')) semanticScore += 6;
      if (t.includes('you qualify') || t.includes('may qualify')) semanticScore += 8;
      if (t.includes('benefits released') || t.includes('been released')) semanticScore += 8;
      if (t.includes("we're calling") || t.includes("we are calling")) semanticScore += 8;
      if (t.includes('wanted to reach out') || t.includes('reaching out')) semanticScore += 6;

      // AGENT ELIGIBILITY QUESTIONS (+) - Compliance verification phrases
      if (t.includes('medicare') && (t.includes('medicaid') || t.includes('work insurance'))) semanticScore += 12;
      if (t.includes("don't have any type of") || t.includes("do not have any type of")) semanticScore += 10;
      if (t.includes('part a') && t.includes('part b')) semanticScore += 10;
      if (t.includes('red, white and blue') || t.includes('red white and blue')) semanticScore += 8;
      if (t.includes('state of') && t.includes('zip')) semanticScore += 8;

      // AGENT TRANSITION PHRASES (+)
      if (t.includes('all right, perfect') || t.includes('alright, perfect') || t.includes('all right perfect')) semanticScore += 8;
      if (t.includes('perfect, so') || t.includes('great, so') || t.includes('okay, so')) semanticScore += 6;
      if (t.includes("that's great") || t.includes("that's perfect") || t.includes("that's wonderful")) semanticScore += 5;
      if (t.includes('let me') && (t.includes('connect') || t.includes('transfer') || t.includes('verify'))) semanticScore += 8;
      if (t.includes("i'm going to") || t.includes("going to connect")) semanticScore += 6;

      // AGENT HANDOFF SIGNALS (+) - Warm handoff phrases
      if (t.includes('take it from here') || t.includes('take the call from here')) semanticScore += 15;
      if (t.includes('specialist take') || t.includes('let the specialist')) semanticScore += 12;
      if (t.includes('i have') && (t.includes('in the state') || t.includes('confirmed medicare'))) semanticScore += 15;
      if (t.includes('please take it from here')) semanticScore += 15;
      if (t.includes("i'll introduce you") || t.includes('introduce you quickly')) semanticScore += 10;
      if (t.includes('connecting over') || t.includes('connecting through')) semanticScore += 8;
      if (t.includes('we should be connected') || t.includes('we are connected')) semanticScore += 8;
      if (t.includes('elevator music') || t.includes('slight ringing')) semanticScore += 8;

      // AGENT PROCESS SIGNALS
      if (t.includes('just to confirm') || t.includes('just to verify')) semanticScore += 6;
      if (t.includes('last thing') && t.includes('confirm')) semanticScore += 6;
      if (t.includes("that's everything i need")) semanticScore += 8;
      if (t.includes('do you still have') && (t.includes('part a') || t.includes('part b') || t.includes('medicare'))) semanticScore += 10;

      // AGENT SHORT CONFIRMATION QUESTIONS (+) - Questions asking for confirmation
      // "Correct?" with question mark = AGENT asking for confirmation
      if (t.match(/^(correct|right|okay|ok|is that right|is that correct)\??$/i) && line.content.includes('?')) semanticScore += 12;
      // "And you're in [location]?" pattern = AGENT geographic verification
      if (t.match(/and you('re| are) in [a-z]+\??/i)) semanticScore += 15;
      // Agent typically asks location questions
      if ((t.includes("you're in") || t.includes('you are in') || t.includes('in michigan') || t.includes('in florida') || t.includes('in texas')) && t.includes('?')) semanticScore += 12;
      // "Great." or "Perfect." followed by question = AGENT transition
      if (t.match(/^(great|perfect|wonderful|excellent|okay|alright|all right)[.,!]?\s+(and|so|now)/i)) semanticScore += 10;
      // Any short sentence starting with "Great." followed by a question is likely agent
      if (t.match(/^(great|perfect)\.\s+.*\?$/i)) semanticScore += 12;
      // "Just to be sure" patterns = AGENT double-checking
      if (t.includes('just to be sure') || t.includes('just to make sure')) semanticScore += 10;

      // CUSTOMER SIGNALS (-)
      if (t.includes('who is this')) semanticScore -= 10;
      if (t.includes('stop calling') || t.includes('do not call')) semanticScore -= 12;
      // "this is she/he" pattern - but NOT if it's a handoff intro
      if ((t.includes('this is she') || t.includes('this is he')) && !t.includes('in the state') && !t.includes('take it from')) semanticScore -= 15;
      // Short "this is [name]" from customer answering phone - but agent handoffs are longer with state/Medicare
      if (t.match(/^this is [a-z]+\.?$/) && contentLength < 25) semanticScore -= 12;
      if (t.match(/^speaking\.?$/) || t.match(/^speaking$/)) semanticScore -= 10;
      if (t.includes('subsidy for what') || t.includes('what is this about')) semanticScore -= 6;
      if (t.includes('how did you get my number')) semanticScore -= 8;

      // SHORT AFFIRMATIVE RESPONSES = almost always customer
      // Note: "Correct." (statement) is customer, but "Correct?" (question) is agent (handled above)
      if (t.match(/^(yes|yeah|yep|yup|okay|ok|sure|alright|mhmm|mm-hmm|uh-huh|right|that's right)\.?$/i)) semanticScore -= 10;
      if (t.match(/^correct\.$/i) && !line.content.includes('?')) semanticScore -= 10; // Statement, not question
      if (t.match(/^(no|nope|not really|i don't think so)\.?$/i)) semanticScore -= 10;
      if (t.match(/^(as well|you too|have a good day|thank you|thanks|bye|goodbye)\.?$/i)) semanticScore -= 8;
      if (t.match(/^(hello|hi|hey)\.?\??$/i) && contentLength < 10) semanticScore -= 6; // Customer answering phone

      // B. Determine Role
      // PRIORITY 1: Trust channel labels (since channels are transcribed separately)
      const lowerLabel = line.speaker.toLowerCase();
      const labelMatchesAgentName = agentNameParts.some(p => lowerLabel.includes(p));

      let isAgent = false;
      let labelIsDefinitive = false;

      // Check if label explicitly identifies the speaker
      if (labelMatchesAgentName) {
        isAgent = true;
        labelIsDefinitive = true;
      } else if (lowerLabel.includes('agent') || lowerLabel.includes('rep') || lowerLabel.includes('specialist')) {
        isAgent = true;
        labelIsDefinitive = true;
      } else if (lowerLabel.includes('customer') || lowerLabel.includes('prospect') || lowerLabel.includes('caller')) {
        isAgent = false;
        labelIsDefinitive = true;
      }

      // PRIORITY 2: ONLY use semantic scoring if label is ambiguous (e.g., "SPEAKER_0", "Speaker 1")
      if (!labelIsDefinitive) {
        if (semanticScore >= 5) {
          isAgent = true;
        } else if (semanticScore <= -5) {
          isAgent = false;
        } else if (i > 0) {
          // Fallback: continue from previous speaker
          isAgent = arr[i - 1].isAgent;
        } else {
          isAgent = false; // Default first line to customer
        }
      }

      // C. Normalize Display Label
      const displaySpeaker = isAgent ? 'Agent' : 'Prospect';

      // Determine End Seconds & Markers for UI
      const nextItem = arr[i + 1];
      const endSeconds = nextItem ? nextItem.startSeconds : line.startSeconds + 5;
      const associatedMarkers = timelineMarkers.filter(m =>
        m.seconds >= line.startSeconds && m.seconds < endSeconds
      );

      return {
        ...line,
        speaker: displaySpeaker,
        isAgent,
        endSeconds,
        markers: associatedMarkers
      };
    });

    return processedLines;
  }, [call?.transcript, call?.agentName, timelineMarkers, duration, call?.duration]);

  if (!call) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end font-sans overflow-hidden">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-500" onClick={onClose} />

      <div
        className="relative bg-[#F2F2F7] h-full shadow-2xl flex flex-col animate-slide-in-right ring-1 ring-black/5 transition-all duration-300 ease-out"
        style={{
          width: isExpanded ? '1080px' : '720px',
          maxWidth: isExpanded ? '1080px' : '720px'
        }}
      >
        {/* Left Edge Expand/Collapse Toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-50 w-6 h-16 bg-white border border-slate-200 rounded-l-lg shadow-md flex items-center justify-center text-slate-400 hover:text-[#007AFF] hover:bg-slate-50 transition-all duration-200"
          title={isExpanded ? "Collapse panel" : "Expand panel"}
        >
          {isExpanded ? <ChevronRight size={14} /> : <ChevronRight size={14} className="rotate-180" />}
        </button>

        {/* Navigation Bar */}
        <div className="px-6 py-3 flex flex-col items-center bg-white/80 backdrop-blur-2xl border-b border-slate-200 z-50 sticky top-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full mb-4 opacity-50" />
          <div className="flex items-center justify-between w-full mb-4">
            <button onClick={onClose} className="text-[#007AFF] font-medium text-[17px] flex items-center gap-1 transition-opacity active:opacity-50">
              <X size={20} strokeWidth={2.5} /> Close
            </button>
            {/* 
            <div className="text-center">
              <h2 className="text-[17px] font-bold text-black leading-tight tracking-tight">{call.agentName}</h2>
              <div className="flex items-center justify-center gap-1.5 mt-0.5">
                <CheckCircle size={10} className="text-emerald-500" strokeWidth={3} />
                <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest">ID: {call.callId}</p>
              </div>
            </div>
            */}
            {/* Spacer to balance header */}
            <div className="w-10" />
          </div>

          {/* Metadata Bar - Sleek connected design */}
          <div className="w-full mb-4">
            <div className="flex items-stretch bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-nowrap">
              {/* Score - Shows 0 for auto-fail (unless overridden), otherwise computed weighted score */}
              {(() => {
                // Check for CRITICAL auto-fail violations (AF-13 "Poor Call Quality" is warning-only, not auto-fail)
                const warningOnlyCodes = ['AF-13']; // AF-13 is a warning, not a critical auto-fail
                const violations = Array.isArray(effectiveAutoFailReasons) ? effectiveAutoFailReasons : [];
                const criticalViolations = violations.filter((v: any) => {
                  if (typeof v === 'object' && v?.severity === 'warning') return false;
                  const code = typeof v === 'string' ? v : (v.code || '');
                  return !warningOnlyCodes.includes(code);
                });
                const hasAutoFail = effectiveAutoFailTriggered || criticalViolations.length > 0;

                // If auto-fail is overridden, show the recalculated score
                const effectiveAutoFail = hasAutoFail && !autoFailOverride;
                const displayScore = effectiveAutoFail ? 0 : (calculatedScore || 0);
                const isOverridden = hasAutoFail && autoFailOverride;

                const scoreColorBg = isOverridden ? 'bg-amber-50/50' : (effectiveAutoFail ? 'bg-rose-50/50' : (displayScore >= 85 ? 'bg-emerald-50/50' : displayScore >= 70 ? 'bg-amber-50/50' : 'bg-rose-50/50'));
                const scoreColorText = isOverridden ? 'text-amber-500' : (effectiveAutoFail ? 'text-rose-500' : (displayScore >= 85 ? 'text-emerald-500' : displayScore >= 70 ? 'text-amber-500' : 'text-rose-500'));
                const scoreColorValue = isOverridden ? 'text-amber-600' : (effectiveAutoFail ? 'text-rose-600' : (displayScore >= 85 ? 'text-emerald-600' : displayScore >= 70 ? 'text-amber-600' : 'text-rose-600'));

                return (
                  <div className={`shrink-0 py-2 px-3 text-center border-r border-slate-100 min-w-[60px] ${scoreColorBg}`}>
                    <div className={`flex items-center justify-center gap-1 mb-0.5 ${scoreColorText}`}>
                      <Award size={11} />
                      <span className="text-[9px] font-bold uppercase tracking-wider">Score</span>
                    </div>
                    <p className={`text-lg font-black leading-none ${scoreColorValue}`}>{displayScore}</p>
                    {isOverridden && <span className="text-[8px] text-amber-500 font-bold">(Override)</span>}
                  </div>
                );
              })()}

              {/* Status - Shows AUTO-FAIL when critical violations exist (unless overridden), otherwise based on score */}
              <div className="shrink-0 py-2 px-3 text-center border-r border-slate-100 flex flex-col items-center justify-center min-w-[70px]">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Status</div>
                {(() => {
                  // Check for CRITICAL auto-fail violations (AF-13 is warning-only)
                  const warningOnlyCodes = ['AF-13'];
                  const violations = Array.isArray(effectiveAutoFailReasons) ? effectiveAutoFailReasons : [];
                  const criticalViolations = violations.filter((v: any) => {
                    if (typeof v === 'object' && v?.severity === 'warning') return false;
                    const code = typeof v === 'string' ? v : (v.code || '');
                    return !warningOnlyCodes.includes(code);
                  });
                  // Auto-fail if there are critical violations OR if the flag is explicitly true
                  const hasAutoFail = effectiveAutoFailTriggered || criticalViolations.length > 0;

                  // If auto-fail is overridden, use the recalculated score for status
                  const effectiveAutoFail = hasAutoFail && !autoFailOverride;
                  const scoreVal = effectiveAutoFail ? 0 : (calculatedScore || 0);
                  const isOverridden = hasAutoFail && autoFailOverride;

                  let status = 'REVIEW';
                  let colorClass = 'text-amber-600 bg-amber-100';
                  let icon = <AlertCircle size={12} />;

                  if (effectiveAutoFail) {
                    status = 'AUTO-FAIL';
                    colorClass = 'text-rose-600 bg-rose-100';
                    icon = <XCircle size={12} />;
                  } else if (scoreVal < 50) {
                    status = 'FAIL';
                    colorClass = 'text-rose-600 bg-rose-100';
                    icon = <XCircle size={12} />;
                  } else if (scoreVal >= 85) {
                    status = 'PASS';
                    colorClass = isOverridden ? 'text-amber-600 bg-amber-100' : 'text-emerald-600 bg-emerald-100';
                    icon = isOverridden ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />;
                  } else if (isOverridden) {
                    // Score between 50-85 with override - show as REVIEW with amber
                    status = 'REVIEW';
                    colorClass = 'text-amber-600 bg-amber-100';
                    icon = <AlertCircle size={12} />;
                  }

                  return (
                    <div className="flex flex-col items-center gap-0.5">
                      <div className={`px-2.5 py-1 rounded-full ${colorClass} flex items-center gap-1`}>
                        {icon}
                        <span className="text-[10px] font-black">{status}</span>
                      </div>
                      {isOverridden && (
                        <span className="text-[8px] text-amber-500 font-bold">(Override)</span>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Agent */}
              <div className="shrink-0 py-2 px-2 text-center border-r border-slate-100 max-w-[120px]">
                <div className="flex items-center justify-center gap-1 text-slate-500 mb-0.5">
                  <User size={10} />
                  <span className="text-[8px] font-bold uppercase tracking-wider">Agent</span>
                </div>
                <p className="text-xs font-bold text-slate-800 truncate" title={call.agentName}>{call.agentName}</p>
              </div>

              {/* Campaign */}
              <div className="shrink-0 py-2 px-2 text-center border-r border-slate-100 min-w-[65px]">
                <div className="flex items-center justify-center gap-1 text-slate-500 mb-0.5">
                  <Zap size={10} />
                  <span className="text-[8px] font-bold uppercase tracking-wider">Campaign</span>
                </div>
                <p className="text-xs font-bold text-slate-800">{call.campaignType || 'ACA'}</p>
              </div>

              {/* Call Date */}
              <div className="shrink-0 py-2 px-2 text-center border-r border-slate-100 min-w-[80px]">
                <div className="flex items-center justify-center gap-1 text-slate-500 mb-0.5">
                  <Calendar size={10} />
                  <span className="text-[8px] font-bold uppercase tracking-wider whitespace-nowrap">Call Date</span>
                </div>
                <p className="text-xs font-bold text-slate-800 whitespace-nowrap">{new Date(call.callDate || call.createdAt || new Date()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>

              {/* Phone Number */}
              <div className="shrink-0 py-2 px-2 text-center min-w-[100px]">
                <div className="flex items-center justify-center gap-1 text-slate-500 mb-0.5">
                  <Phone size={10} />
                  <span className="text-[8px] font-bold uppercase tracking-wider whitespace-nowrap">Phone</span>
                </div>
                <p className="text-xs font-bold text-slate-800 whitespace-nowrap">
                  {call.phoneNumber ? call.phoneNumber.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3') : 'N/A'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex p-0.5 bg-[#E3E3E8] rounded-xl w-full max-w-[280px]">
            <button
              onClick={() => setActiveTab('analysis')}
              className={`flex-1 py-1.5 rounded-[9px] text-[13px] font-semibold transition-all duration-200 ${activeTab === 'analysis' ? 'bg-white text-black shadow-md' : 'text-[#8E8E93]'}`}
            >
              Analysis
            </button>
            <button
              onClick={() => setActiveTab('transcript')}
              className={`flex-1 py-1.5 rounded-[9px] text-[13px] font-semibold transition-all duration-200 ${activeTab === 'transcript' ? 'bg-white text-black shadow-md' : 'text-[#8E8E93]'}`}
            >
              Transcript
            </button>
          </div>
        </div>

        {/* Metadata section moved to header */}

        {/* Audio Player */}
        <div className="px-6 pt-4 pb-2 z-40 bg-[#F2F2F7]">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-4 flex items-center gap-4 relative overflow-visible">
            {/* Only render audio element if we have a valid, non-empty URL */}
            {call.recordingUrl && call.recordingUrl.trim() !== '' && (
              <audio
                ref={audioRef}
                src={call.recordingUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setIsPlaying(false)}
                onError={(e) => {
                  const target = e.target as HTMLAudioElement;
                  const mediaError = target.error;

                  // Map MediaError codes to human-readable messages
                  const errorCodes: Record<number, string> = {
                    1: 'MEDIA_ERR_ABORTED - Playback aborted by user',
                    2: 'MEDIA_ERR_NETWORK - Network error while downloading',
                    3: 'MEDIA_ERR_DECODE - Error decoding the media',
                    4: 'MEDIA_ERR_SRC_NOT_SUPPORTED - Source not supported or file not found (404)'
                  };

                  const errorCode = mediaError?.code || 0;
                  const errorMessage = mediaError?.message || errorCodes[errorCode] || 'Unknown error';

                  // Use console.warn for expected missing-file scenarios (code 4) 
                  // to keep the console cleaner during development
                  if (errorCode === 4) {
                    console.warn('[Audio] Recording file not found or format unsupported:', {
                      url: call.recordingUrl?.substring(0, 80),
                      errorCode,
                      hint: 'Verify file exists in R2 bucket and URL is public'
                    });
                  } else {
                    console.error('[Audio] Playback failed:', {
                      url: call.recordingUrl?.substring(0, 80),
                      errorCode,
                      errorMessage
                    });
                  }

                  setAudioError(
                    errorCode === 4
                      ? 'Recording file not found - verify upload completed'
                      : `Playback error: ${errorMessage}`
                  );
                }}
              />
            )}

            <button
              onClick={togglePlay}
              disabled={!call.recordingUrl || call.recordingUrl.trim() === '' || !!audioError}
              className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 transition-transform shadow-lg ${!call.recordingUrl || call.recordingUrl.trim() === '' || audioError
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-black text-white active:scale-90'
                }`}
              title={audioError || (!call.recordingUrl || call.recordingUrl.trim() === '' ? 'No recording available' : 'Play/Pause')}
            >
              {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
            </button>

            {/* Playback Speed Control */}
            <button
              onClick={() => {
                const speeds = [1, 1.25, 1.5, 2];
                const currentIdx = speeds.indexOf(playbackRate);
                const nextIdx = (currentIdx + 1) % speeds.length;
                const newRate = speeds[nextIdx];
                setPlaybackRate(newRate);
                if (audioRef.current) {
                  audioRef.current.playbackRate = newRate;
                }
              }}
              disabled={!call.recordingUrl || call.recordingUrl.trim() === '' || !!audioError}
              className={`h-8 min-w-[42px] px-2 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold transition-all ${!call.recordingUrl || call.recordingUrl.trim() === '' || audioError
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-purple-100 text-purple-700 hover:bg-purple-200 active:scale-95 border border-purple-200'
                }`}
              title="Change playback speed"
            >
              {playbackRate}x
            </button>

            <div className="flex-1 min-w-0">
              {/* Time display - use actual audio duration when available */}
              <div className="flex justify-between text-[11px] font-bold text-[#8E8E93] tabular-nums mb-2">
                <span>{formatTime(currentTime)}</span>
                <span className="text-purple-600 font-extrabold uppercase tracking-tighter">Pitch Sync Active</span>
                <span>{formatTime(duration || 0)}</span>
              </div>

              {/* Timeline Marker Legend - Moved Above Audio */}
              <div className="flex items-center justify-end gap-3 px-1 mb-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-[2px] h-3 bg-emerald-500" />
                  <span className="text-[9px] text-slate-500 font-medium uppercase tracking-wider">Passed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-[2px] h-3 bg-rose-500" />
                  <span className="text-[9px] text-slate-500 font-medium uppercase tracking-wider">Failed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-[2px] h-3 bg-blue-500" />
                  <span className="text-[9px] text-slate-500 font-medium uppercase tracking-wider">Transfer</span>
                </div>
              </div>

              {/* TIMELINE CONTAINER */}
              <div
                ref={timelineRef}
                className="relative h-8 w-full cursor-pointer group select-none"
                onClick={handleTimelineClick}
              >
                {/* Background Bars */}
                <div className="absolute inset-0 flex items-center gap-[2.5px] z-10 pointer-events-none opacity-50">
                  {waveformBars.map((h, i) => {
                    const progress = (i / waveformBars.length);
                    const activeDuration = duration || 1;
                    const currentProgress = Math.min(1, currentTime / activeDuration);
                    const isActive = progress <= currentProgress;
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-full transition-all duration-300 ${isActive ? 'bg-purple-600' : 'bg-[#E5E5EA]'}`}
                        style={{ height: `${h * 100}%` }}
                      />
                    );
                  })}
                </div>

                {/* MARKERS LAYER - Clustered & Expanded */}
                <div className="absolute inset-0 z-30 pointer-events-none">
                  {clusteredMarkers.map((cluster, idx) => {
                    const isCluster = cluster.items.length > 1;
                    const primaryType = cluster.items.some(i => i.type === 'fail') ? 'fail' :
                      cluster.items.some(i => i.type === 'transfer') ? 'transfer' :
                      cluster.items.some(i => i.type === 'chapter') ? 'chapter' : 'pass';

                    // Background Class Logic
                    const bgClass = primaryType === 'transfer' ? 'bg-blue-500' :
                      primaryType === 'chapter' ? 'bg-indigo-500' :
                      primaryType === 'pass' ? 'bg-emerald-500' : 'bg-rose-500';

                    // Shadow/Glow colors
                    const shadowGlow = primaryType === 'fail' ? 'shadow-[0_0_12px_rgba(244,63,94,0.8)]' :
                      primaryType === 'transfer' ? 'shadow-[0_0_12px_rgba(59,130,246,0.8)]' :
                      primaryType === 'pass' ? 'shadow-[0_0_12px_rgba(16,185,129,0.8)]' : 'shadow-[0_0_12px_rgba(99,102,241,0.8)]';

                    // Icon Logic for Pill
                    let MarkerIcon = isCluster ? Layers :
                      primaryType === 'transfer' ? Activity :
                      primaryType === 'pass' ? Check :
                        primaryType === 'fail' ? AlertTriangle : Flag;

                    return (
                      <div
                        key={idx}
                        className="absolute inset-y-0 group/marker pointer-events-auto cursor-pointer z-30 flex items-center justify-center -ml-[3px] w-6"
                        style={{ left: `${cluster.position}%` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSeek(cluster.startTime);
                        }}
                        onMouseEnter={() => setHoveredMarker(idx)}
                        onMouseLeave={() => setHoveredMarker(null)}
                      >
                        {/* 1. VISUAL: SIMPLE COLORED LINE (Top/Bottom Split) */}
                        {/* Pass = Top Half, Fail = Bottom Half to be "opposite" */}
                        <div className={`
                            absolute w-[3px] rounded-full transition-all duration-300
                            ${bgClass} ${shadowGlow} opacity-80 group-hover/marker:opacity-100 group-hover/marker:w-[4px]
                            ${primaryType === 'pass' ? 'top-0 h-1/2 rounded-b-none' :
                            primaryType === 'fail' ? 'bottom-0 h-1/2 rounded-t-none' :
                            primaryType === 'transfer' ? 'inset-y-0 w-[4px]' : 'inset-y-0'}
                         `} />

                        {/* HOVER BADGE ONLY (No permanent pill) */}
                        <div className={`
                            absolute left-1/2 -translate-x-1/2 z-40
                            transition-all duration-200 pointer-events-none transform
                            opacity-0 group-hover/marker:opacity-100 
                            ${primaryType === 'pass' ? '-top-2 -translate-y-1' : primaryType === 'fail' ? 'bottom-0 translate-y-full' : '-top-2'}
                        `}>
                          {isCluster ? (
                            <div className="bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm whitespace-nowrap">
                              <Layers size={8} />
                              <span className="font-bold">{cluster.items.length}</span>
                            </div>
                          ) : (
                            <div className={`p-1 rounded-full shadow-sm ${bgClass} text-white`}>
                              <MarkerIcon size={8} strokeWidth={3} />
                            </div>
                          )}
                        </div>

                        {/* Expandable Tooltip (New "Tesla" Floating Card Style) */}
                        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-2xl border border-white/50 rounded-2xl opacity-0 group-hover/marker:opacity-100 transition-all duration-300 transform translate-y-2 group-hover/marker:translate-y-0 pointer-events-none shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] z-50 min-w-[200px] overflow-hidden">
                          {/* Header */}
                          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                              {isCluster ? <Layers size={10} /> : <Activity size={10} />}
                              {isCluster ? 'Event Stack' : 'Timeline Event'}
                            </span>
                            <span className="text-[10px] font-mono font-medium text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                              {formatTime(cluster.startTime)}
                            </span>
                          </div>

                          {/* Content List */}
                          <div className="p-2 space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                            {cluster.items.map((item, i) => {
                              const iconColor = item.type === 'fail' ? 'text-rose-500' :
                                item.type === 'transfer' ? 'text-blue-500' :
                                item.type === 'pass' ? 'text-emerald-500' : 'text-indigo-500';
                              const Icon = item.type === 'fail' ? AlertTriangle :
                                item.type === 'transfer' ? Activity :
                                item.type === 'pass' ? Check : Flag;

                              return (
                                <div key={i} className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-slate-50 transition-colors">
                                  <div className={`mt-0.5 shrink-0 ${iconColor}`}>
                                    <Icon size={12} strokeWidth={2.5} />
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-slate-700 leading-tight mb-0.5">{item.title}</p>
                                    <p className="text-[10px] text-slate-500 font-mono">{item.time}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Playhead - Premium Update */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-[3px] bg-purple-600 h-10 rounded-full shadow-[0_0_15px_rgba(147,51,234,0.6)] transition-all pointer-events-none z-20 border border-white/50"
                  style={{ left: `${Math.min(100, (currentTime / (duration || 1)) * 100)}%` }}
                />
              </div>


            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-white relative">
          {activeTab === 'transcript' ? (
            <div className="px-6 py-8 space-y-6">
              {/* Transcript Content */}
              {parsedTranscript.map((msg, idx) => {
                // Apply Sync Offset to the current time check
                // If audio is "ahead" (need to delay), syncOffset should be positive?
                // Actually: isActive if currentTime is within [start - offset, end - offset]
                // Let's think: if user sets +1s offset, it means "Audio is 1s late", so we want the text to highlight 1s LATER.
                // So if Audio Time is 10s, and offset is +1s, we effectively want to treat it as 9s?
                // Or: User sets +1s because "Audio is 1s ahead of text". 
                // Let's standard: 
                // Offset acts as adjustment to CurrentTime. 
                // adjustedTime = currentTime + syncOffset.
                const adjustedTime = Math.max(0, currentTime + syncOffset);
                const isActive = adjustedTime >= msg.startSeconds && adjustedTime < msg.endSeconds;
                return (
                  <div
                    key={idx}
                    ref={isActive ? activeTranscriptRef : null}
                    className={`flex w-full ${msg.isAgent ? 'justify-end' : 'justify-start'} transition-opacity duration-500 ${!isActive && isPlaying ? 'opacity-50' : 'opacity-100'}`}
                  >
                    <div className={`flex gap-3 max-w-[85%] ${msg.isAgent ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center border shrink-0 ${msg.isAgent ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white border-slate-200 text-slate-400'}`}>
                        {msg.isAgent ? <Headphones size={14} /> : <User size={14} />}
                      </div>
                      <div className={`flex flex-col ${msg.isAgent ? 'items-end' : 'items-start'} flex-1`}>
                        <div className="flex items-baseline gap-2 mb-1 px-1">
                          <span className="text-[11px] font-bold text-slate-400 uppercase">{msg.speaker}</span>
                          {msg.time && (
                            <button onClick={() => handleSeek(msg.time || 0)} className="text-[10px] text-slate-300 hover:text-purple-600 flex items-center gap-1">
                              <Play size={8} fill="currentColor" /> {msg.time}
                            </button>
                          )}
                          {/* Indicator Dot in Header REMOVED per user request */}
                        </div>
                        <div className={`px-5 py-3.5 text-[15px] leading-relaxed shadow-sm relative transition-all duration-300 border-2 
                                ${msg.isAgent
                            ? `rounded-2xl rounded-tr-none ${isActive ? 'bg-indigo-600 text-white border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'bg-indigo-600 text-white border-transparent'}`
                            : `rounded-2xl rounded-tl-none ${isActive ? 'bg-white text-slate-900 border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'bg-slate-50 text-slate-700 border-slate-200'}`
                          }`}>
                          {msg.content}


                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-5 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-400">
              {/* Meta Grid */}
              {/* Talk Time Distribution - Moved from below */}

              {/* AUTO-FAIL VIOLATIONS SECTION - Only critical violations */}
              {effectiveAutoFailReasons && Array.isArray(effectiveAutoFailReasons) && (() => {
                const warningOnlyCodes = ['AF-13'];
                const criticalViolations = effectiveAutoFailReasons.filter((v: any) => {
                  const code = typeof v === 'string' ? v : (v.code || '');
                  return !warningOnlyCodes.includes(code);
                });

                if (criticalViolations.length === 0) return null;

                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pl-2">
                      <AlertTriangle size={14} className="text-rose-500" />
                      <h4 className="text-[11px] font-black text-rose-500 uppercase tracking-widest">Auto-Fail Violations</h4>
                      <span className="ml-auto bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {criticalViolations.length} {criticalViolations.length === 1 ? 'Violation' : 'Violations'}
                      </span>
                    </div>
                    <div className="bg-rose-50 rounded-2xl border border-rose-200 overflow-hidden shadow-sm">
                      {criticalViolations.map((reason: any, idx: number) => {
                        const isString = typeof reason === 'string';
                        const violation = isString
                          ? reason
                          : (typeof reason.violation === 'string' ? reason.violation : (reason.violation ? JSON.stringify(reason.violation) : 'Violation'));
                        const code = isString ? `AF-${String(idx + 1).padStart(2, '0')}` : (typeof reason.code === 'string' ? reason.code : `AF-${String(idx + 1).padStart(2, '0')}`);
                        const description = isString ? null : (typeof reason.description === 'string' ? reason.description : null);
                        const timestamp = isString ? null : (typeof reason.timestamp === 'string' && reason.timestamp !== '-1' && reason.timestamp !== '' ? reason.timestamp : null);
                        const evidence = isString ? null : (typeof reason.evidence === 'string' ? reason.evidence : null);
                        const speaker = isString ? null : (typeof reason.speaker === 'string' ? reason.speaker : null);

                        return (
                          <div key={idx} className={`p-4 ${idx > 0 ? 'border-t border-rose-200' : ''}`}>
                            <div className="flex items-start gap-3">
                              <span className="shrink-0 bg-rose-600 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                                {code}
                              </span>
                              <div className="flex-1 min-w-0 space-y-2">
                                <div className="flex items-baseline justify-between gap-2">
                                  <h5 className="text-sm font-bold text-rose-800">{violation}</h5>
                                  {timestamp && (
                                    <button
                                      onClick={() => handleSeek(timestamp)}
                                      className="shrink-0 text-[10px] text-rose-600 hover:text-rose-800 flex items-center gap-1 font-medium"
                                    >
                                      <Play size={8} fill="currentColor" /> {timestamp}
                                    </button>
                                  )}
                                </div>
                                {description && (
                                  <p className="text-xs text-rose-700 leading-relaxed">{description}</p>
                                )}
                                {evidence && (
                                  <div className="bg-white/80 border border-rose-200 rounded-lg p-3 mt-2">
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                      <Quote size={10} className="text-rose-400" />
                                      <span className="text-[9px] font-bold text-rose-400 uppercase tracking-wider">
                                        {speaker ? `${speaker} said` : 'Evidence'}
                                      </span>
                                    </div>
                                    <p className="text-xs text-rose-900 italic leading-relaxed">"{evidence}"</p>
                                  </div>
                                )}
                                {!evidence && (
                                  <p className="text-[10px] text-rose-400 italic">Evidence required from transcript</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* CALL QUALITY NOTES SECTION - Warnings only (AF-13, etc.) */}
              {effectiveAutoFailReasons && Array.isArray(effectiveAutoFailReasons) && (() => {
                const warningOnlyCodes = ['AF-13'];
                const warningViolations = effectiveAutoFailReasons.filter((v: any) => {
                  const code = typeof v === 'string' ? v : (v.code || '');
                  return warningOnlyCodes.includes(code);
                });

                if (warningViolations.length === 0) return null;

                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pl-2">
                      <AlertCircle size={14} className="text-amber-500" />
                      <h4 className="text-[11px] font-black text-amber-600 uppercase tracking-widest">Call Quality Notes</h4>
                      <span className="ml-auto bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {warningViolations.length} {warningViolations.length === 1 ? 'Note' : 'Notes'}
                      </span>
                    </div>
                    <div className="bg-amber-50 rounded-2xl border border-amber-200 overflow-hidden shadow-sm">
                      {warningViolations.map((reason: any, idx: number) => {
                        const isString = typeof reason === 'string';
                        const violation = isString
                          ? reason
                          : (typeof reason.violation === 'string' ? reason.violation : (reason.violation ? JSON.stringify(reason.violation) : 'Note'));
                        const code = isString ? 'NOTE' : (typeof reason.code === 'string' ? reason.code : 'NOTE');
                        const description = isString ? null : (typeof reason.description === 'string' ? reason.description : null);
                        const timestamp = isString ? null : (typeof reason.timestamp === 'string' && reason.timestamp !== '-1' && reason.timestamp !== '' ? reason.timestamp : null);
                        const evidence = isString ? null : (typeof reason.evidence === 'string' ? reason.evidence : null);
                        const speaker = isString ? null : (typeof reason.speaker === 'string' ? reason.speaker : null);

                        return (
                          <div key={idx} className={`p-4 ${idx > 0 ? 'border-t border-amber-200' : ''}`}>
                            <div className="flex items-start gap-3">
                              <span className="shrink-0 bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                                {code}
                              </span>
                              <div className="flex-1 min-w-0 space-y-2">
                                <div className="flex items-baseline justify-between gap-2">
                                  <h5 className="text-sm font-bold text-amber-800">{violation}</h5>
                                  {timestamp && (
                                    <button
                                      onClick={() => handleSeek(timestamp)}
                                      className="shrink-0 text-[10px] text-amber-600 hover:text-amber-800 flex items-center gap-1 font-medium"
                                    >
                                      <Play size={8} fill="currentColor" /> {timestamp}
                                    </button>
                                  )}
                                </div>
                                {description && (
                                  <p className="text-xs text-amber-700 leading-relaxed">{description}</p>
                                )}
                                {evidence && (
                                  <div className="bg-white/80 border border-amber-200 rounded-lg p-3 mt-2">
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                      <Quote size={10} className="text-amber-400" />
                                      <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">
                                        {speaker ? `${speaker} said` : 'Evidence'}
                                      </span>
                                    </div>
                                    <p className="text-xs text-amber-900 italic leading-relaxed">"{evidence}"</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-amber-600 italic pl-2">
                      Note: Call quality issues do not trigger auto-fail but should be reviewed for coaching purposes.
                    </p>
                  </div>
                );
              })()}



              {/* Language Assessment Section */}
              {call.languageAssessment && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pl-2">
                    <MessageSquare size={14} className="text-indigo-500" />
                    <h4 className="text-[11px] font-black text-[#8E8E93] uppercase tracking-widest">Language Assessment</h4>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div className="space-y-5">
                      {/* Left Column: Key Metrics */}
                      <div className="space-y-6">
                        {/* WPM */}
                        {(() => {
                          const agentMetrics = call.speakerMetrics?.agent as any;
                          let wpm = call.languageAssessment.wpm || call.languageAssessment.WPM;

                          // Fallback to speaker metrics
                          if (!wpm && agentMetrics?.wpm) {
                            wpm = agentMetrics.wpm;
                          }
                          // Calculate if needed
                          if (!wpm && agentMetrics?.wordCount && agentMetrics?.speakingTimeSeconds) {
                            wpm = Math.round((agentMetrics.wordCount / agentMetrics.speakingTimeSeconds) * 60);
                          }

                          const displayWpm = wpm || 'N/A';
                          const wpmValue = typeof wpm === 'number' ? wpm : 0;

                          return (
                            <div>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-semibold text-slate-700">Pace (WPM)</span>
                                <span className="text-sm font-bold text-slate-900">
                                  {displayWpm}
                                </span>
                              </div>
                              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-indigo-500 rounded-full"
                                  style={{ width: `${Math.min((wpmValue / 200) * 100, 100)}%` }}
                                />
                              </div>
                              <p className="text-xs text-slate-500 mt-1">Target: 120-150 words per minute</p>
                            </div>
                          );
                        })()}

                        {/* Clarity Score */}
                        {(() => {
                          let clarity = call.languageAssessment.clarity_score ?? call.languageAssessment.clarityScore;

                          if (clarity === undefined || clarity === null) {
                            const agentMetrics = call.speakerMetrics?.agent as any;
                            clarity = agentMetrics?.clarity_score ?? agentMetrics?.clarityScore ?? agentMetrics?.clarity;
                          }
                          const clarityValue = clarity || 0;

                          return (
                            <div>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-semibold text-slate-700">Clarity</span>
                                <span className="text-sm font-bold text-slate-900">{clarityValue}/100</span>
                              </div>
                              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${clarityValue >= 80 ? 'bg-emerald-500' :
                                    clarityValue >= 60 ? 'bg-yellow-500' : 'bg-rose-500'
                                    }`}
                                  style={{ width: `${clarityValue}%` }}
                                />
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Additional Metrics Grid */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* Script Adherence - Enhanced with section-by-section breakdown */}
                        {call.languageAssessment.script_adherence !== undefined && call.languageAssessment.script_adherence !== null && (
                          (() => {
                            // Support multiple formats: string ("moderate"), number (90), or object ({level, score, ...})
                            const scriptData = call.languageAssessment.script_adherence;
                            const isDetailedFormat = typeof scriptData === 'object' && scriptData !== null;
                            const isNumericFormat = typeof scriptData === 'number';

                            // Handle all three formats - but we'll recalculate score below
                            let level: string;
                            let score: number | null;
                            let apiProvidedScore: number | null = null;
                            if (isDetailedFormat) {
                              level = scriptData.level || 'moderate';
                              apiProvidedScore = scriptData.score ?? scriptData.overall_adherence ?? null;
                              score = apiProvidedScore; // Will be recalculated below if 0
                            } else if (isNumericFormat) {
                              // Number format: 90 = high, 50-89 = moderate, <50 = low
                              score = scriptData;
                              apiProvidedScore = scriptData;
                              level = scriptData >= 80 ? 'high' : scriptData >= 50 ? 'moderate' : 'low';
                            } else {
                              // String format: "high", "moderate", "low"
                              level = String(scriptData);
                              score = null;
                            }

                            const phrasesFound = isDetailedFormat ? (scriptData.key_phrases_found || []) : [];
                            const phrasesMissing = isDetailedFormat ? (scriptData.key_phrases_missing || []) : [];
                            const sequenceCorrect = isDetailedFormat ? scriptData.sequence_correct : null;
                            const terminologyIssues = isDetailedFormat ? (scriptData.terminology_issues || []) : [];

                            // Section scores from new format
                            const sectionScores = isDetailedFormat ? (scriptData.section_scores || {}) : {};
                            const hasSectionScores = Object.keys(sectionScores).length > 0;

                            // CALCULATE scores from actual data instead of relying on AI-provided zeros
                            // Key Phrases Score: percentage of required phrases that were found
                            const totalPhrases = phrasesFound.length + phrasesMissing.length;
                            const calculatedKeyPhrasesScore = totalPhrases > 0
                              ? Math.round((phrasesFound.length / totalPhrases) * 100)
                              : 0;

                            // Sequence Order Score: based on sequence_correct flag
                            // Also check checklist timestamps to verify order if available
                            let calculatedSequenceScore = 50; // Default to "minor deviations"
                            if (sequenceCorrect === true) {
                              calculatedSequenceScore = 100;
                            } else if (sequenceCorrect === false) {
                              calculatedSequenceScore = 50;
                            } else if (call.checklist && typeof call.checklist === 'object') {
                              // Try to determine sequence from checklist timestamps
                              const checklistItems = Object.entries(call.checklist)
                                .filter(([_, item]: [string, any]) => item && item.time_seconds >= 0)
                                .sort((a: any, b: any) => (a[1].time_seconds || 0) - (b[1].time_seconds || 0));

                              // Expected order for Medicare
                              const expectedOrder = [
                                'client_name_confirmation', 'agent_introduction', 'company_name',
                                'recorded_line_disclosure', 'food_utility_card_mention', 'medicare_ab_verification',
                                'rwb_card_verification', 'state_zipcode_confirmation', 'food_benefits_mention',
                                'verbal_consent_to_transfer', 'cold_transfer'
                              ];

                              if (checklistItems.length >= 3) {
                                // Count how many items are in correct relative order
                                let correctOrderCount = 0;
                                for (let i = 0; i < checklistItems.length - 1; i++) {
                                  const currIdx = expectedOrder.indexOf(checklistItems[i][0]);
                                  const nextIdx = expectedOrder.indexOf(checklistItems[i + 1][0]);
                                  if (currIdx !== -1 && nextIdx !== -1 && currIdx < nextIdx) {
                                    correctOrderCount++;
                                  }
                                }
                                const totalPairs = checklistItems.length - 1;
                                calculatedSequenceScore = totalPairs > 0
                                  ? Math.round((correctOrderCount / totalPairs) * 100)
                                  : 50;
                              }
                            }

                            // Response Handling Score: based on items requiring customer response
                            let calculatedResponseHandlingScore = 50;
                            if (call.checklist && typeof call.checklist === 'object') {
                              // Items that require customer response
                              const responseRequiredItems = [
                                'medicare_ab_verification', 'rwb_card_verification', 'verbal_consent_to_transfer',
                                'mmw_check_first', 'mmw_check_second'
                              ];
                              const checklistObj = call.checklist as Record<string, any>;
                              const responseItems = responseRequiredItems
                                .map(key => checklistObj[key])
                                .filter(item => item !== undefined);

                              if (responseItems.length > 0) {
                                const passedResponseItems = responseItems.filter((item: any) => item?.passed === true).length;
                                calculatedResponseHandlingScore = Math.round((passedResponseItems / responseItems.length) * 100);
                              }
                            }

                            // Terminology Score: based on issues found (100 if no issues, deduct 20 per issue)
                            const calculatedTerminologyScore = Math.max(0, 100 - (terminologyIssues.length * 20));

                            // Use calculated scores, fallback to API-provided if they're non-zero
                            const metricScores = {
                              key_phrases: (scriptData.key_phrases_score && scriptData.key_phrases_score > 0)
                                ? scriptData.key_phrases_score : calculatedKeyPhrasesScore,
                              sequence_order: (scriptData.sequence_order_score && scriptData.sequence_order_score > 0)
                                ? scriptData.sequence_order_score : calculatedSequenceScore,
                              response_handling: (scriptData.response_handling_score && scriptData.response_handling_score > 0)
                                ? scriptData.response_handling_score : calculatedResponseHandlingScore,
                              terminology: (scriptData.terminology_score && scriptData.terminology_score > 0)
                                ? scriptData.terminology_score : calculatedTerminologyScore
                            };

                            // Recalculate overall score if API provided 0 or null
                            // Weight: Key Phrases 40%, Sequence Order 25%, Response Handling 25%, Terminology 10%
                            if (!apiProvidedScore || apiProvidedScore === 0) {
                              const calculatedOverallScore = Math.round(
                                (metricScores.key_phrases * 0.40) +
                                (metricScores.sequence_order * 0.25) +
                                (metricScores.response_handling * 0.25) +
                                (metricScores.terminology * 0.10)
                              );
                              score = calculatedOverallScore;
                              // Also recalculate level based on new score
                              level = score >= 80 ? 'high' : score >= 50 ? 'moderate' : 'low';
                            }

                            // Always show metric scores since we calculate them
                            const hasMetricScores = totalPhrases > 0 || isDetailedFormat;

                            const levelLower = (level || 'moderate').toLowerCase();
                            const colorClass = levelLower === 'high' ? 'text-emerald-600' :
                              levelLower === 'moderate' || levelLower === 'medium' ? 'text-amber-600' : 'text-rose-600';
                            const bgColorClass = levelLower === 'high' ? 'bg-emerald-500' :
                              levelLower === 'moderate' || levelLower === 'medium' ? 'bg-amber-500' : 'bg-rose-500';

                            const hasDetails = phrasesFound.length > 0 || phrasesMissing.length > 0 || terminologyIssues.length > 0 || hasSectionScores || hasMetricScores;

                            // Helper to format section names
                            const formatSectionName = (key: string) => {
                              return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                            };

                            // Helper to get score color
                            const getScoreColor = (score: number) => {
                              if (score >= 80) return { text: 'text-emerald-600', bg: 'bg-emerald-500' };
                              if (score >= 50) return { text: 'text-amber-600', bg: 'bg-amber-500' };
                              return { text: 'text-rose-600', bg: 'bg-rose-500' };
                            };

                            return (
                              <div className="bg-slate-50 rounded-xl p-3 col-span-2">
                                <div className="flex justify-between items-center mb-2">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Script Adherence</span>
                                  {score !== null && (
                                    <span className={`text-xs font-semibold ${colorClass}`}>{score}/100</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mb-2">
                                  <span className={`text-sm font-bold ${colorClass}`}>
                                    {levelLower.charAt(0).toUpperCase() + levelLower.slice(1)}
                                  </span>
                                  {score !== null && (
                                    <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${bgColorClass}`}
                                        style={{ width: `${score}%` }}
                                      />
                                    </div>
                                  )}
                                </div>

                                {/* Expandable details */}
                                {hasDetails && (
                                  <details className="mt-2">
                                    <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-700 font-medium flex items-center gap-1">
                                      <ChevronRight size={12} className="transition-transform details-open:rotate-90" />
                                      View Breakdown {hasSectionScores && `(${Object.keys(sectionScores).length} sections)`}
                                    </summary>
                                    <div className="mt-3 space-y-3 text-[10px]">

                                      {/* Metric Scores Grid */}
                                      {hasMetricScores && (
                                        <div className="grid grid-cols-2 gap-2 mb-3">
                                          {metricScores.key_phrases !== undefined && (
                                            <div className="bg-white rounded-lg p-2 border border-slate-200">
                                              <span className="text-[9px] text-slate-500 block">Key Phrases</span>
                                              <div className="flex items-center gap-2 mt-1">
                                                <span className={`text-sm font-bold ${getScoreColor(metricScores.key_phrases).text}`}>
                                                  {metricScores.key_phrases}%
                                                </span>
                                                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                  <div className={`h-full rounded-full ${getScoreColor(metricScores.key_phrases).bg}`} style={{ width: `${metricScores.key_phrases}%` }} />
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                          {metricScores.sequence_order !== undefined && (
                                            <div className="bg-white rounded-lg p-2 border border-slate-200">
                                              <span className="text-[9px] text-slate-500 block">Sequence Order</span>
                                              <div className="flex items-center gap-2 mt-1">
                                                <span className={`text-sm font-bold ${getScoreColor(metricScores.sequence_order).text}`}>
                                                  {metricScores.sequence_order}%
                                                </span>
                                                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                  <div className={`h-full rounded-full ${getScoreColor(metricScores.sequence_order).bg}`} style={{ width: `${metricScores.sequence_order}%` }} />
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                          {metricScores.response_handling !== undefined && (
                                            <div className="bg-white rounded-lg p-2 border border-slate-200">
                                              <span className="text-[9px] text-slate-500 block">Response Handling</span>
                                              <div className="flex items-center gap-2 mt-1">
                                                <span className={`text-sm font-bold ${getScoreColor(metricScores.response_handling).text}`}>
                                                  {metricScores.response_handling}%
                                                </span>
                                                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                  <div className={`h-full rounded-full ${getScoreColor(metricScores.response_handling).bg}`} style={{ width: `${metricScores.response_handling}%` }} />
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                          {metricScores.terminology !== undefined && (
                                            <div className="bg-white rounded-lg p-2 border border-slate-200">
                                              <span className="text-[9px] text-slate-500 block">Terminology</span>
                                              <div className="flex items-center gap-2 mt-1">
                                                <span className={`text-sm font-bold ${getScoreColor(metricScores.terminology).text}`}>
                                                  {metricScores.terminology}%
                                                </span>
                                                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                  <div className={`h-full rounded-full ${getScoreColor(metricScores.terminology).bg}`} style={{ width: `${metricScores.terminology}%` }} />
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Section-by-Section Breakdown */}
                                      {hasSectionScores && (
                                        <div className="space-y-2">
                                          <span className="font-semibold text-slate-700 block mb-2 text-[11px]">Section Breakdown:</span>
                                          {Object.entries(sectionScores).map(([sectionKey, sectionData]: [string, any]) => {
                                            const sectionScore = sectionData?.score ?? 0;
                                            const sectionWeight = sectionData?.weight ?? 0;
                                            const sectionNotes = sectionData?.notes || '';
                                            const sectionColors = getScoreColor(sectionScore);

                                            return (
                                              <div key={sectionKey} className="bg-white rounded-lg p-2.5 border border-slate-200">
                                                <div className="flex justify-between items-center mb-1.5">
                                                  <span className="font-semibold text-slate-700 text-[11px]">
                                                    {formatSectionName(sectionKey)}
                                                  </span>
                                                  <div className="flex items-center gap-2">
                                                    {sectionWeight > 0 && (
                                                      <span className="text-[9px] text-slate-400">Weight: {sectionWeight}%</span>
                                                    )}
                                                    <span className={`text-xs font-bold ${sectionColors.text}`}>
                                                      {sectionScore}%
                                                    </span>
                                                  </div>
                                                </div>
                                                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-2">
                                                  <div
                                                    className={`h-full rounded-full ${sectionColors.bg}`}
                                                    style={{ width: `${sectionScore}%` }}
                                                  />
                                                </div>
                                                {sectionNotes && (
                                                  <div className="bg-slate-50 rounded p-2 border-l-2 border-slate-300">
                                                    <span className="text-[9px] text-slate-500 block mb-0.5">Analysis:</span>
                                                    <p className="text-[10px] text-slate-600 leading-relaxed">{sectionNotes}</p>
                                                  </div>
                                                )}
                                                {/* Show specific flags if available */}
                                                {sectionData?.got_verbal_okay !== undefined && (
                                                  <div className="flex items-center gap-1 mt-1.5 text-[9px]">
                                                    {sectionData.got_verbal_okay ? (
                                                      <>
                                                        <CheckCircle2 size={10} className="text-emerald-500" />
                                                        <span className="text-emerald-600">Customer gave verbal consent</span>
                                                      </>
                                                    ) : (
                                                      <>
                                                        <XCircle size={10} className="text-rose-500" />
                                                        <span className="text-rose-600">No verbal consent obtained</span>
                                                      </>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}

                                      {/* Legacy details for older format */}
                                      {phrasesFound.length > 0 && (
                                        <div>
                                          <span className="font-semibold text-emerald-600 block mb-1">Key Phrases Found:</span>
                                          <div className="flex flex-wrap gap-1">
                                            {phrasesFound.map((phrase: string, idx: number) => (
                                              <span key={idx} className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px]">
                                                {phrase}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {phrasesMissing.length > 0 && (
                                        <div>
                                          <span className="font-semibold text-rose-600 block mb-1">Missing Phrases:</span>
                                          <div className="flex flex-wrap gap-1">
                                            {phrasesMissing.map((phrase: string, idx: number) => (
                                              <span key={idx} className="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-[9px]">
                                                {phrase}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {sequenceCorrect !== null && (
                                        <div className="flex items-center gap-1">
                                          <span className="font-semibold text-slate-600">Sequence Order:</span>
                                          <span className={sequenceCorrect ? 'text-emerald-600' : 'text-amber-600'}>
                                            {sequenceCorrect ? 'Correct' : 'Minor deviations'}
                                          </span>
                                        </div>
                                      )}
                                      {terminologyIssues.length > 0 && (
                                        <div>
                                          <span className="font-semibold text-amber-600 block mb-1">Terminology Issues:</span>
                                          <div className="flex flex-wrap gap-1">
                                            {terminologyIssues.map((issue: string, idx: number) => (
                                              <span key={idx} className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px]">
                                                {issue}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </details>
                                )}
                              </div>
                            );
                          })()
                        )}

                        {/* Pace */}
                        {call.languageAssessment.pace && (
                          <div className="bg-slate-50 rounded-xl p-3">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Pace</span>
                            <span className={`text-sm font-bold ${call.languageAssessment.pace === 'appropriate' ? 'text-emerald-600' :
                              call.languageAssessment.pace === 'fast' || call.languageAssessment.pace === 'slow' ? 'text-amber-600' : 'text-slate-700'
                              }`}>
                              {call.languageAssessment.pace.charAt(0).toUpperCase() + call.languageAssessment.pace.slice(1)}
                            </span>
                          </div>
                        )}

                        {/* Empathy Displayed */}
                        {call.languageAssessment.empathy_displayed !== undefined && (
                          <div className="bg-slate-50 rounded-xl p-3">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Empathy</span>
                            <div className="flex items-center gap-1.5">
                              {call.languageAssessment.empathy_displayed ? (
                                <>
                                  <CheckCircle2 size={14} className="text-emerald-500" />
                                  <span className="text-sm font-bold text-emerald-600">Displayed</span>
                                </>
                              ) : (
                                <>
                                  <XCircle size={14} className="text-rose-500" />
                                  <span className="text-sm font-bold text-rose-600">Not Detected</span>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Professionalism Score */}
                        {call.languageAssessment.professionalism_score !== undefined && (
                          <div className="bg-slate-50 rounded-xl p-3">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Professionalism</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold ${call.languageAssessment.professionalism_score >= 8 ? 'text-emerald-600' :
                                call.languageAssessment.professionalism_score >= 5 ? 'text-amber-600' : 'text-rose-600'
                                }`}>
                                {call.languageAssessment.professionalism_score}/10
                              </span>
                              <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${call.languageAssessment.professionalism_score >= 8 ? 'bg-emerald-500' :
                                    call.languageAssessment.professionalism_score >= 5 ? 'bg-amber-500' : 'bg-rose-500'
                                    }`}
                                  style={{ width: `${call.languageAssessment.professionalism_score * 10}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Tone Analysis */}
                      <div className="bg-slate-50 rounded-xl p-4">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Tone Analysis</span>
                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            const keywords = call.languageAssessment.tone_keywords ||
                              call.languageAssessment.toneKeywords ||
                              (call.speakerMetrics?.agent as any)?.tone_keywords ||
                              [];

                            // Also show the main tone value if it exists
                            const mainTone = call.languageAssessment.tone;

                            return (
                              <>
                                {mainTone && !keywords.includes(mainTone) && (
                                  <span className="px-2.5 py-1 rounded-md bg-indigo-100 border border-indigo-200 text-xs font-semibold text-indigo-700 shadow-sm">
                                    {mainTone}
                                  </span>
                                )}
                                {keywords.length > 0 ? (
                                  keywords.map((tone: string, idx: number) => (
                                    <span key={idx} className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-sm">
                                      {tone}
                                    </span>
                                  ))
                                ) : !mainTone && (
                                  <span className="text-sm text-slate-400 italic">No tone keywords detected</span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Summary */}
                      {(() => {
                        const summary = call.languageAssessment.summary || (call.speakerMetrics as any)?.summary;
                        if (summary) {
                          return (
                            <div className="text-sm text-slate-600 leading-relaxed italic">
                              "{summary}"
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* Speaker Metrics (Talk Distribution & Turns) */}
              {(call.agentSpeakingTime || call.customerSpeakingTime || call.speakerMetrics) && (() => {
                // Get speaking times: Prioritize speakerMetrics (JSONB column) as requested
                const agentTime = call.speakerMetrics?.agent?.speakingTimeSeconds ?? call.agentSpeakingTime ?? 0;
                const customerTime = call.speakerMetrics?.customer?.speakingTimeSeconds ?? call.customerSpeakingTime ?? 0;
                const totalTime = agentTime + customerTime;

                // Get turns
                const agentTurns = call.speakerMetrics?.agent?.turnCount ?? call.agentTurnCount ?? 0;
                const customerTurns = call.speakerMetrics?.customer?.turnCount ?? call.customerTurnCount ?? 0;
                const totalTurns = agentTurns + customerTurns;

                if (totalTime === 0 && totalTurns === 0) return null;

                const agentPercent = totalTime > 0 ? Math.round((agentTime / totalTime) * 100) : 0;
                const customerPercent = 100 - agentPercent;

                // Format time helper
                const formatDuration = (seconds: number) => {
                  const mins = Math.floor(seconds / 60);
                  const secs = Math.floor(seconds % 60);
                  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
                };

                // SVG donut chart parameters
                const size = 100;
                const strokeWidth = 12;
                const radius = (size - strokeWidth) / 2;
                const circumference = 2 * Math.PI * radius;
                const agentOffset = circumference * (1 - agentPercent / 100);

                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pl-2">
                      <Users size={14} className="text-indigo-500" />
                      <h4 className="text-[11px] font-black text-[#8E8E93] uppercase tracking-widest">Speaker Analysis</h4>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-5">
                      {/* Left Side: Talk Time Distribution */}
                      <div>
                        <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Talk Time</h5>
                        <div className="flex items-center gap-6">
                          {/* Donut Chart */}
                          <div className="relative flex-shrink-0">
                            <svg width={size} height={size} className="transform -rotate-90">
                              {/* Background circle (Customer/Prospect) */}
                              <circle
                                cx={size / 2}
                                cy={size / 2}
                                r={radius}
                                fill="none"
                                stroke="#f1f5f9"
                                strokeWidth={strokeWidth}
                              />
                              {/* Customer segment */}
                              <circle
                                cx={size / 2}
                                cy={size / 2}
                                r={radius}
                                fill="none"
                                stroke="#8b5cf6"
                                strokeWidth={strokeWidth}
                                strokeDasharray={circumference}
                                strokeDashoffset={0}
                                strokeLinecap="round"
                                className="transition-all duration-700 ease-out"
                              />
                              {/* Agent segment (overlays on top) */}
                              <circle
                                cx={size / 2}
                                cy={size / 2}
                                r={radius}
                                fill="none"
                                stroke="#10b981"
                                strokeWidth={strokeWidth}
                                strokeDasharray={circumference}
                                strokeDashoffset={agentOffset}
                                strokeLinecap="round"
                                className="transition-all duration-700 ease-out"
                              />
                            </svg>
                            {/* Center text */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-lg font-bold text-slate-800">{agentPercent}%</span>
                              <span className="text-[9px] text-slate-500 uppercase">Agent</span>
                            </div>
                          </div>

                          {/* Legend */}
                          <div className="flex-1 space-y-3">
                            {/* Agent */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/30" />
                                <span className="text-sm font-medium text-slate-700">Agent</span>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-bold text-emerald-600">{agentPercent}%</span>
                                <span className="text-xs text-slate-400 ml-1.5">({formatDuration(agentTime)})</span>
                              </div>
                            </div>
                            {/* Progress bar for agent */}
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-700"
                                style={{ width: `${agentPercent}%` }}
                              />
                            </div>

                            {/* Customer/Prospect */}
                            <div className="flex items-center justify-between mt-3">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-purple-500 shadow-sm shadow-purple-500/30" />
                                <span className="text-sm font-medium text-slate-700">Prospect</span>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-bold text-purple-600">{customerPercent}%</span>
                                <span className="text-xs text-slate-400 ml-1.5">({formatDuration(customerTime)})</span>
                              </div>
                            </div>
                            {/* Progress bar for prospect */}
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-purple-400 to-purple-500 rounded-full transition-all duration-700"
                                style={{ width: `${customerPercent}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Side: Turn Counts */}
                      <div className="border-l border-slate-100 pl-8">
                        <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Engagement (Turns)</h5>
                        <div className="space-y-6">

                          {/* Agent Turns */}
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-emerald-100 text-emerald-600 rounded-md">
                                  <Headphones size={12} />
                                </div>
                                <span className="text-sm font-medium text-slate-700">Agent Turns</span>
                              </div>
                              <span className="text-lg font-bold text-slate-900">{agentTurns}</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500"
                                style={{ width: `${totalTurns > 0 ? (agentTurns / totalTurns) * 100 : 0}%` }}
                              />
                            </div>
                          </div>

                          {/* Customer Turns */}
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-purple-100 text-purple-600 rounded-md">
                                  <User size={12} />
                                </div>
                                <span className="text-sm font-medium text-slate-700">Prospect Turns</span>
                              </div>
                              <span className="text-lg font-bold text-slate-900">{customerTurns}</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-purple-500"
                                style={{ width: `${totalTurns > 0 ? (customerTurns / totalTurns) * 100 : 0}%` }}
                              />
                            </div>
                          </div>


                          <div className="pt-4 mt-2 border-t border-slate-100">
                            <div className="flex gap-2 items-start">
                              <Lightbulb size={14} className="text-amber-500 mt-0.5 shrink-0" />
                              <p className="text-xs text-slate-500 leading-relaxed">
                                {(() => {
                                  const diff = Math.abs(agentTurns - customerTurns);
                                  const isLowEngagement = totalTurns < 10 && duration > 120; // < 10 turns in > 2 mins
                                  const isMonologue = agentPercent > 80 && diff < 5; // High talk time but balanced turns = long monologues

                                  if (isMonologue) return <span className="font-medium text-slate-700">Monologue Detected: <span className="font-normal text-slate-500">The agent is speaking for long periods at a time without interruption. This indicates a "lecture" style rather than a conversation.</span></span>;

                                  if (agentPercent > 75 && agentTurns > customerTurns * 1.5) return <span className="font-medium text-slate-700">Agent Dominant: <span className="font-normal text-slate-500">The agent is dominating the conversation and potentially interrupting or not allowing the prospect to speak.</span></span>;

                                  if (isLowEngagement) return <span className="font-medium text-slate-700">Low Engagement: <span className="font-normal text-slate-500">Few turns taken despite call duration. This might indicate disinterest or a one-sided pitch.</span></span>;

                                  return <span className="font-medium text-slate-700">Healthy Flow: <span className="font-normal text-slate-500">Good back-and-forth exchange indicates active listening and engagement.</span></span>;
                                })()}
                              </p>
                            </div>
                          </div>


                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Focus Areas Section - Training improvement areas */}
              {call.focusAreas && call.focusAreas.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pl-2">
                    <Target size={14} className="text-amber-500" />
                    <h4 className="text-[11px] font-black text-[#8E8E93] uppercase tracking-widest">Focus Areas</h4>
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{call.focusAreas.length}</span>
                  </div>
                  <div className="bg-amber-50/50 rounded-2xl border border-amber-100 p-4">
                    <div className="space-y-2">
                      {call.focusAreas.slice(0, 5).map((area: any, idx: number) => (
                        <div key={idx} className="flex items-start gap-3 p-2 bg-white rounded-lg border border-amber-100">
                          <div className="shrink-0 mt-0.5">
                            <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
                              <span className="text-[10px] font-bold text-amber-700">{idx + 1}</span>
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            {area.time && (
                              <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded mr-2">{area.time}</span>
                            )}
                            <p className="text-sm text-slate-700">{area.reason || area.area || (typeof area === 'string' ? area : JSON.stringify(area))}</p>
                          </div>
                        </div>
                      ))}
                      {call.focusAreas.length > 5 && (
                        <p className="text-xs text-amber-600 text-center font-medium pt-2">+{call.focusAreas.length - 5} more areas</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Critical Moments Section - Passes, Warnings, Auto-Fails */}
              {call.criticalMoments && (
                (call.criticalMoments.passes?.length > 0 ||
                  call.criticalMoments.warnings?.length > 0 ||
                  call.criticalMoments.auto_fails?.length > 0) && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pl-2">
                      <AlertCircle size={14} className="text-slate-500" />
                      <h4 className="text-[11px] font-black text-[#8E8E93] uppercase tracking-widest">Critical Moments</h4>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                      <div className="space-y-4">
                        {/* Auto-Fails - Most Critical */}
                        {call.criticalMoments.auto_fails?.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <XCircle size={12} className="text-rose-500" />
                              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Auto-Fails ({call.criticalMoments.auto_fails.length})</span>
                            </div>
                            <div className="space-y-2">
                              {call.criticalMoments.auto_fails.slice(0, 5).map((item: any, idx: number) => {
                                const isString = typeof item === 'string';
                                const code = isString ? `AF-${String(idx + 1).padStart(2, '0')}` : (item.code || `AF-${String(idx + 1).padStart(2, '0')}`);
                                const displayText = isString ? item : (item.description || item.violation || item.reason || item.title || 'Critical failure');
                                const evidence = isString ? null : item.evidence;
                                const timestamp = isString ? null : item.timestamp;
                                const timeSeconds = isString ? -1 : (item.time_seconds ?? -1);
                                const hasValidTimestamp = timestamp && timestamp !== 'N/A' && timestamp !== '-1' && timeSeconds >= 0;

                                return (
                                  <div key={idx} className="p-2.5 bg-rose-50 rounded-lg border border-rose-200">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-start gap-2 flex-1 min-w-0">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-bold text-rose-700">
                                            <span className="text-rose-500">[{code}]</span> {displayText}
                                          </p>
                                          {evidence && (
                                            <p className="text-[10px] text-rose-600 mt-1 italic">"{evidence}"</p>
                                          )}
                                        </div>
                                      </div>
                                      {hasValidTimestamp && (
                                        <button
                                          onClick={() => handleSeek(timeSeconds)}
                                          className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-100 hover:bg-rose-200 px-2 py-1 rounded-md transition-colors"
                                        >
                                          <Play size={8} fill="currentColor" />
                                          {timestamp}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Warnings */}
                        {call.criticalMoments.warnings?.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <AlertTriangle size={12} className="text-amber-500" />
                              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Warnings ({call.criticalMoments.warnings.length})</span>
                            </div>
                            <div className="space-y-1.5">
                              {call.criticalMoments.warnings.slice(0, 3).map((item: any, idx: number) => (
                                <div key={idx} className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg border border-amber-100">
                                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                                  <p className="text-xs text-amber-700">{item.reason || item.title || item.event || (typeof item === 'string' ? item : 'Warning')}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Key Passes - With item names and clickable timestamps */}
                        {call.criticalMoments.passes?.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <CheckCircle2 size={12} className="text-emerald-500" />
                              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Key Passes ({call.criticalMoments.passes.length})</span>
                            </div>
                            <div className="space-y-1.5">
                              {call.criticalMoments.passes.slice(0, 7).map((item: any, idx: number) => {
                                const isString = typeof item === 'string';
                                const itemName = isString ? item : (item.item || item.title || item.event || `Pass ${idx + 1}`);
                                const timestamp = isString ? null : item.timestamp;
                                const evidence = isString ? null : item.evidence;
                                const timeSeconds = timestamp ? parseTimeToSeconds(timestamp) : -1;
                                const hasValidTimestamp = timestamp && timestamp !== 'N/A' && timeSeconds >= 0;

                                return (
                                  <div
                                    key={idx}
                                    className={`flex items-center justify-between gap-2 p-2 bg-emerald-50 rounded-lg border border-emerald-100 ${hasValidTimestamp ? 'cursor-pointer hover:bg-emerald-100 transition-colors' : ''}`}
                                    onClick={() => hasValidTimestamp && handleSeek(timeSeconds)}
                                    title={evidence ? `"${evidence}"` : undefined}
                                  >
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                                      <span className="text-[11px] font-medium text-emerald-700 truncate">{itemName}</span>
                                    </div>
                                    {hasValidTimestamp && (
                                      <span className="shrink-0 text-[10px] font-mono text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                                        <Play size={8} fill="currentColor" />
                                        {timestamp}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                              {call.criticalMoments.passes.length > 7 && (
                                <div className="text-center">
                                  <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                                    +{call.criticalMoments.passes.length - 7} more passes
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              )}


              {/* Quick Stats Summary - Moved above Score Calculation */}
              <div className="grid grid-cols-2 gap-3">
                {/* Recording Duration - Original call length (before trimming) */}
                <div className="bg-slate-50 rounded-2xl p-4 text-center border border-slate-100">
                  <div className="flex items-center justify-center gap-2 text-slate-500 mb-1.5">
                    <Play size={12} className="text-indigo-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Recording</span>
                  </div>
                  <p className="text-xl font-black text-slate-800 tracking-tight">
                    {call.originalCallDuration || (duration > 0 ? formatTime(duration) : (call.duration || '—'))}
                  </p>
                </div>

                {/* Analyzed Duration - Trimmed portion that was transcribed */}
                <div className="bg-slate-50 rounded-2xl p-4 text-center border border-slate-100">
                  <div className="flex items-center justify-center gap-2 text-slate-500 mb-1.5">
                    <Clock size={12} className="text-indigo-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Analyzed</span>
                  </div>
                  <p className="text-xl font-black text-slate-800 tracking-tight">{call.duration || '—'}</p>
                </div>

                {/* Pass/Fail Count */}
                <div className="bg-emerald-50 rounded-2xl p-4 text-center border border-emerald-100">
                  <div className="flex items-center justify-center gap-2 text-emerald-600 mb-1.5">
                    <Check size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Passed</span>
                  </div>
                  <p className="text-xl font-black text-emerald-600 tracking-tight">
                    {fullAuditList.filter((item: any) => {
                      const s = (item.status || '').toLowerCase();
                      return ['met', 'pass', 'yes', 'true'].includes(s);
                    }).length}
                    <span className="text-sm font-bold text-emerald-400/60 ml-1">/{fullAuditList.filter((i: any) => (i.status || '').toLowerCase() !== 'n/a').length}</span>
                  </p>
                </div>

                {/* Auto-Fails */}
                <div className={`rounded-2xl p-4 text-center border ${effectiveAutoFailTriggered ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                  <div className={`flex items-center justify-center gap-2 mb-1.5 ${effectiveAutoFailTriggered ? 'text-rose-600' : 'text-slate-500'}`}>
                    <AlertTriangle size={12} />
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${effectiveAutoFailTriggered ? 'text-rose-600/80' : 'text-slate-400'}`}>Auto-Fails</span>
                  </div>
                  <p className={`text-xl font-black tracking-tight ${effectiveAutoFailTriggered ? 'text-rose-600' : 'text-slate-400'}`}>
                    {Array.isArray(effectiveAutoFailReasons) ? effectiveAutoFailReasons.filter((r: any) => typeof r === 'string' || r?.severity !== 'warning').length : 0}
                  </p>
                  {/* Display actual auto-fail reasons */}
                  {effectiveAutoFailReasons && Array.isArray(effectiveAutoFailReasons) && effectiveAutoFailReasons.length > 0 && (
                    <div className="mt-2 space-y-1 text-left">
                      {effectiveAutoFailReasons.map((reason, idx) => {
                        const isString = typeof reason === 'string';
                        const violation = isString
                          ? reason
                          : (typeof reason.violation === 'string' ? reason.violation : (reason.violation ? JSON.stringify(reason.violation) : 'Auto-fail'));

                        // Check if this is a warning (review flag, not a real auto-fail)
                        const isWarning = !isString && reason?.severity === 'warning';

                        // Check if this is an extraction error (not a real compliance auto-fail)
                        const isExtractionError = violation.toLowerCase().includes('extraction') ||
                          violation.toLowerCase().includes('json') ||
                          violation.toLowerCase().includes('parse');

                        const code = isString
                          ? (isExtractionError ? 'ERR' : `AF-${String(idx + 1).padStart(2, '0')}`)
                          : (typeof reason.code === 'string' ? reason.code : (isExtractionError ? 'ERR' : `AF-${String(idx + 1).padStart(2, '0')}`));
                        const displayText = isString ? reason : `[${code}] ${violation}`;
                        return (
                          <div key={idx} className={`text-[10px] ${isWarning ? 'text-amber-700 bg-amber-50/80 border-amber-200' : isExtractionError ? 'text-amber-700 bg-amber-100/80 border-amber-200' : 'text-rose-700 bg-rose-100/80 border-rose-200'} px-2 py-1 rounded border leading-tight`}>
                            {isWarning && <span className="font-semibold mr-1">REVIEW:</span>}{displayText}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Scoring Breakdown */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pl-2">
                  <Award size={14} className="text-emerald-500" />
                  <h4 className="text-[11px] font-black text-[#8E8E93] uppercase tracking-widest">Score Calculation</h4>
                  <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                    {totalEarned}/{totalPossible} pts
                  </span>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <div className="space-y-5 relative z-10">
                    {scoringBreakdown.map((item, idx) => {
                      const Icon = item.icon || Award;
                      const isPassed = item.type === 'positive';
                      return (
                        <div key={idx} className="flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${isPassed ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'
                              }`}>
                              <Icon size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                              <p className="text-[11px] text-slate-400">{item.description}</p>
                            </div>
                          </div>
                          {/* Points display: earned/possible */}
                          <div className={`text-base font-bold tabular-nums ${isPassed ? 'text-emerald-600' : 'text-rose-500'
                            }`}>
                            {item.earnedValue}/{item.possibleValue}
                          </div>
                        </div>
                      );
                    })}






                    {/* Auto-Applied Tags - Based on Score */}
                    <div className="pt-4 mt-4 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Auto-Tag</p>
                      <div className="flex gap-2">
                        {(() => {
                          // Auto-tag logic: 90%+ = Training, <50% = Escalated
                          const score = calculatedScore;
                          const isTraining = score >= 90;
                          const isEscalated = score < 50;
                          const hasTag = isTraining || isEscalated;

                          if (!hasTag) {
                            return (
                              <div className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-400 bg-slate-50 border border-slate-200">
                                No auto-tag (score 50-89%)
                              </div>
                            );
                          }

                          return (
                            <>
                              {isEscalated && (
                                <div className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-rose-500 text-white border border-rose-600">
                                  <Users size={12} />
                                  Escalated
                                  <span className="text-[10px] opacity-90 ml-1 font-bold">(Score 90%+)</span>
                                </div>
                              )}
                              {isTraining && (
                                <div className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white border border-emerald-700 shadow-sm">
                                  <GraduationCap size={14} strokeWidth={2.5} />
                                  Training Data
                                  <span className="text-[10px] opacity-90 ml-1 font-bold">(Score 90%+)</span>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>


                    {/* Final Score */}
                    <div className="pt-5 mt-5 border-t-2 border-slate-200 flex justify-between items-center">
                      <div>
                        <span className="text-lg font-black text-slate-900 uppercase">Final Score</span>
                        <p className="text-xs text-slate-400 mt-0.5">{totalEarned} of {totalPossible} points earned</p>
                      </div>
                      <span className={`text-4xl font-black tracking-tighter ${calculatedScore >= 85 ? 'text-emerald-600' :
                        calculatedScore >= 70 ? 'text-amber-500' : 'text-rose-600'
                        }`}>
                        {calculatedScore}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>


              {/* Detailed Compliance Audit & Overrides */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pl-2">
                  <ShieldCheck size={14} className="text-indigo-500" />
                  <h4 className="text-[11px] font-black text-[#8E8E93] uppercase tracking-widest">Detailed Compliance Audit</h4>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="divide-y divide-slate-100">
                    {fullAuditList.map((item: any, idx: number) => {
                      const itemName = item.name || item.requirement || `Checklist Item ${idx + 1}`;
                      const originalStatus = (item.status || '').toLowerCase();

                      // Skip N/A items in this view too? Or show them? 
                      // User wants to review everything usually. Let's show N/A as gray.
                      if (originalStatus === 'n/a') return null;

                      // Get effective status (including overrides)
                      const itemKey = itemName.toLowerCase();
                      const isOverridden = localOverrides[itemKey] !== undefined;
                      // Logic matches `getEffectiveStatus` but inline for rendering
                      // We need to know if it's currently passing to render the correct toggle state
                      // Let's re-use the status from the list item since we want to check the *item's* evaluation
                      // BUT `fullAuditList` items don't have the override applied inside them yet?
                      // Wait, `fullAuditList` calculation (lines 529-570) does NOT include localOverrides.
                      // Matches `scoringBreakdown` logic.

                      let effectiveStatus = originalStatus;
                      if (localOverrides[itemKey]) {
                        effectiveStatus = localOverrides[itemKey];
                      } else {
                        // Check DB overrides (we need to access them here or just rely on local)
                        // For simplicity/consistency with `scoringBreakdown`, we check local first.
                        // Ideally we should sync this logic, but for UI:
                        // If local override exists, use it.
                        // Else use original.
                      }

                      const isPass = ['met', 'pass', 'yes', 'true'].includes(effectiveStatus.toLowerCase());

                      // Check for potential false negative flag
                      const itemFlag = getItemFlag(itemName, effectiveStatus);
                      const hasFalseNegativeFlag = itemFlag.type === 'false_negative';

                      // Get AI confidence for this item
                      const aiConfidence = item.confidence || 0;
                      const isLowConfidence = aiConfidence < 80;

                      // Calculate timestamp for this item (used in header)
                      const validItemTime = item.time &&
                        item.time !== '-1' &&
                        item.time !== '' &&
                        item.time !== 'N/A' &&
                        /^\d{1,2}:\d{2}$/.test(item.time);
                      const validTimeSeconds = item.time_seconds !== undefined &&
                        item.time_seconds !== null &&
                        item.time_seconds >= 0 &&
                        item.time_seconds !== -1;
                      const timeSecondsDisplay = validTimeSeconds
                        ? `${Math.floor(item.time_seconds / 60)}:${String(item.time_seconds % 60).padStart(2, '0')}`
                        : null;
                      const hasValidTimestamp = validItemTime || validTimeSeconds;
                      const displayTimestamp = validItemTime ? item.time : timeSecondsDisplay;

                      return (
                        <div key={idx} className={`p-5 flex items-start gap-4 hover:bg-slate-50 transition-colors group ${hasFalseNegativeFlag ? 'bg-amber-50/50 border-l-4 border-l-amber-400' : ''}`}>
                          {/* Status Icon with Confidence Ring */}
                          <div className="relative mt-1 shrink-0">
                            <div className={`h-7 w-7 rounded-full flex items-center justify-center ${isPass ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                              {isPass ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                            </div>
                            {/* Confidence indicator ring */}
                            <div className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold border-2 border-white
                              ${aiConfidence >= 90 ? 'bg-emerald-500 text-white' : aiConfidence >= 70 ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'}`}>
                              {Math.round(aiConfidence / 10)}
                            </div>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-4 mb-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h5 className={`text-sm font-bold ${isPass ? 'text-slate-800' : 'text-slate-800'}`}>
                                  {itemName}
                                </h5>
                                {/* AI Confidence Badge */}
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border
                                  ${aiConfidence >= 90 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' :
                                    aiConfidence >= 70 ? 'text-amber-700 bg-amber-50 border-amber-200' :
                                    'text-rose-700 bg-rose-50 border-rose-200'}`}>
                                  AI: {aiConfidence}%
                                </span>
                                {isOverridden && <span className="text-[10px] uppercase font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Manual Override</span>}
                                {/* Timestamp Badge - Always visible next to title */}
                                {hasValidTimestamp && displayTimestamp ? (
                                  <button
                                    onClick={() => {
                                      if (validItemTime) handleSeek(parseTimeToSeconds(item.time));
                                      else if (validTimeSeconds) handleSeek(item.time_seconds);
                                    }}
                                    className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded hover:bg-indigo-100 transition-colors border border-indigo-100"
                                  >
                                    <Play size={8} fill="currentColor" />
                                    {displayTimestamp}
                                  </button>
                                ) : (
                                  <span className="flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                    <Clock size={8} />
                                    N/A
                                  </span>
                                )}
                              </div>

                              {/* Override Toggle */}
                              <button
                                onClick={() => handleToggleOverride(itemName, effectiveStatus)}
                                className={`
                                   px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 shrink-0
                                   ${isPass
                                    ? 'bg-white border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200'
                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200'
                                  }
                                 `}
                              >
                                <Sliders size={12} />
                                {isPass ? 'Mark Fail' : 'Mark Pass'}
                              </button>
                            </div>

                            <div className="space-y-2">
                              {/* False Negative Warning */}
                              {hasFalseNegativeFlag && (
                                <div className="flex items-start gap-2 p-2.5 bg-amber-100 border border-amber-300 rounded-lg">
                                  <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="text-xs font-bold text-amber-800">Possible False Negative</p>
                                    <p className="text-[11px] text-amber-700">
                                      AI marked as FAIL, but phrase "<span className="font-semibold">{itemFlag.phrase}</span>" found in transcript. Please verify manually.
                                    </p>
                                  </div>
                                </div>
                              )}

                              {/* Evidence / Quote - Click to Seek */}
                              {item.evidence && (() => {
                                // Extract timestamp if present [12:30]
                                const timestampRegex = /\[(\d{1,2}:\d{2})\]/;
                                const match = item.evidence.match(timestampRegex);
                                // Validate item.time is a real timestamp (not -1, empty, or invalid)
                                const validItemTime = item.time &&
                                  item.time !== '-1' &&
                                  item.time !== '' &&
                                  item.time !== 'N/A' &&
                                  /^\d{1,2}:\d{2}$/.test(item.time);

                                // Check time_seconds as fallback (this is often populated when time is "N/A")
                                const validTimeSeconds = item.time_seconds !== undefined &&
                                  item.time_seconds !== null &&
                                  item.time_seconds >= 0 &&
                                  item.time_seconds !== -1;

                                // Convert time_seconds to MM:SS format for display
                                const timeSecondsDisplay = validTimeSeconds
                                  ? `${Math.floor(item.time_seconds / 60)}:${String(item.time_seconds % 60).padStart(2, '0')}`
                                  : null;

                                const hasTimestamp = !!match || validItemTime || validTimeSeconds;
                                const displayTime = match ? match[1] : (validItemTime ? item.time : timeSecondsDisplay);

                                // Check if this is "no clear evidence" - highlight for QA attention
                                const isNoEvidence = item.evidence.toLowerCase().includes('no clear evidence');

                                return (
                                  <>
                                    <div
                                      onClick={() => {
                                        if (match) {
                                          handleSeek(parseTimeToSeconds(match[1]));
                                        } else if (validItemTime) {
                                          handleSeek(parseTimeToSeconds(item.time));
                                        } else if (validTimeSeconds) {
                                          handleSeek(item.time_seconds);
                                        }
                                      }}
                                      className={`
                                      text-sm text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 italic transition-all leading-relaxed
                                      ${hasTimestamp ? 'cursor-pointer hover:bg-indigo-50 hover:border-indigo-100 hover:text-indigo-700' : ''}
                                      ${isNoEvidence ? 'bg-amber-50 border-amber-200 text-amber-700' : ''}
                                    `}
                                    >
                                      "{item.evidence}"
                                    </div>

                                    {/* Explicit Timestamp Button if present and valid */}
                                    <div className="mt-2 flex justify-end">
                                      {hasTimestamp && displayTime ? (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (match) handleSeek(parseTimeToSeconds(match[1]));
                                            else if (validItemTime) handleSeek(parseTimeToSeconds(item.time));
                                            else if (validTimeSeconds) handleSeek(item.time_seconds);
                                          }}
                                          className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md hover:bg-indigo-100 transition-colors border border-indigo-100"
                                        >
                                          <Play size={8} fill="currentColor" />
                                          Jump to {displayTime}
                                        </button>
                                      ) : (
                                        <span className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                                          <Clock size={8} />
                                          Timestamp: N/A
                                        </span>
                                      )}
                                    </div>
                                  </>
                                );
                              })()}

                              {/* Reasoning / Notes */}
                              {item.notes && (
                                <p className="text-xs text-slate-500">
                                  <span className="font-semibold text-slate-400 uppercase text-[10px] mr-1">AI Reasoning:</span>
                                  {item.notes}
                                </p>
                              )}

                              {/* Confidence Indicator */}
                              <div className="flex items-center gap-2 mt-2">
                                <div className="flex items-center gap-1">
                                  <div className={`h-1.5 w-1.5 rounded-full ${item.confidence >= 90 ? 'bg-emerald-400' : item.confidence >= 70 ? 'bg-amber-400' : 'bg-rose-400'}`} />
                                  <span className="text-[10px] font-medium text-slate-400">
                                    AI Confidence: {item.confidence}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {fullAuditList.length === 0 && (
                      <div className="p-8 text-center text-slate-400 text-sm italic">
                        No detailed audit items available for this call.
                      </div>
                    )}
                  </div>
                </div>
              </div>


              {/* AUTO-FAIL OVERRIDE SECTION */}
              {effectiveAutoFailTriggered && call.qaStatus !== 'approved' && (
                <div className="space-y-4 mt-6">
                  <div className="flex items-center gap-2 pl-2">
                    <AlertTriangle size={14} className="text-amber-500" />
                    <h4 className="text-[11px] font-black text-[#8E8E93] uppercase tracking-widest">Auto-Fail Override</h4>
                  </div>
                  <div className={`rounded-2xl border-2 p-5 shadow-sm transition-all ${autoFailOverride ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-start gap-4">
                      <div className={`mt-1 h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${autoFailOverride ? 'bg-amber-100' : 'bg-rose-100'}`}>
                        <AlertTriangle size={20} className={autoFailOverride ? 'text-amber-600' : 'text-rose-600'} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className={`text-sm font-bold ${autoFailOverride ? 'text-amber-700' : 'text-rose-700'}`}>
                              {autoFailOverride ? 'Auto-Fail Overridden (False Positive)' : 'Auto-Fail Status Active'}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {autoFailOverride
                                ? 'Score will be calculated normally based on earned points'
                                : 'Score is currently locked at 0 due to auto-fail violation(s)'}
                            </p>
                          </div>
                          <button
                            onClick={() => setAutoFailOverride(!autoFailOverride)}
                            className={`
                              px-4 py-2 rounded-lg text-xs font-bold transition-all border flex items-center gap-2
                              ${autoFailOverride
                                ? 'bg-rose-100 border-rose-300 text-rose-700 hover:bg-rose-200'
                                : 'bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200'}
                            `}
                          >
                            {autoFailOverride ? (
                              <>
                                <XCircle size={14} />
                                Restore Auto-Fail
                              </>
                            ) : (
                              <>
                                <ShieldCheck size={14} />
                                Override (False Positive)
                              </>
                            )}
                          </button>
                        </div>

                        {/* Show auto-fail reasons with full details */}
                        {effectiveAutoFailReasons && effectiveAutoFailReasons.length > 0 && (
                          <div className="mt-4 space-y-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Triggered Violations:</p>
                            {effectiveAutoFailReasons.map((reason: any, idx: number) => {
                              const isString = typeof reason === 'string';
                              const violation = isString ? reason : (reason.violation || reason.description || 'Violation');
                              const code = isString ? `AF-${String(idx + 1).padStart(2, '0')}` : (reason.code || `AF-${String(idx + 1).padStart(2, '0')}`);
                              const evidence = isString ? null : reason.evidence;
                              const rawTimestamp = isString ? null : (typeof reason.timestamp === 'string' ? reason.timestamp : null);
                              const rawTimeSeconds = isString ? -1 : ((reason as any).time_seconds ?? -1);
                              const isSeverityWarning = !isString && reason?.severity === 'warning';

                              // Determine valid timestamp and seconds
                              let displayTimestamp = rawTimestamp;
                              let seekSeconds = rawTimeSeconds;

                              if (seekSeconds >= 0 && (!displayTimestamp || displayTimestamp === 'N/A')) {
                                displayTimestamp = `${Math.floor(seekSeconds / 60)}:${String(seekSeconds % 60).padStart(2, '0')}`;
                              } else if (displayTimestamp && displayTimestamp !== 'N/A' && displayTimestamp !== '-1' && seekSeconds < 0) {
                                seekSeconds = parseTimeToSeconds(displayTimestamp);
                              }

                              const hasValidTimestamp = seekSeconds >= 0 || (displayTimestamp && displayTimestamp !== 'N/A' && displayTimestamp !== '-1');

                              return (
                                <div key={idx} className={`p-3 rounded-lg border ${isSeverityWarning ? 'bg-amber-50 border-amber-200' : autoFailOverride ? 'bg-amber-50/50 border-amber-200' : 'bg-rose-50 border-rose-200'}`}>
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-start gap-2 flex-1 min-w-0">
                                      <XCircle size={14} className={`${isSeverityWarning ? 'text-amber-500' : autoFailOverride ? 'text-amber-500' : 'text-rose-500'} mt-0.5 shrink-0`} />
                                      <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-bold ${isSeverityWarning ? 'text-amber-700' : autoFailOverride ? 'text-amber-700 line-through' : 'text-rose-700'}`}>
                                          <span className={`${isSeverityWarning ? 'text-amber-500' : autoFailOverride ? 'text-amber-500' : 'text-rose-500'} mr-1`}>[{isSeverityWarning ? 'REVIEW' : code}]</span>
                                          {violation}
                                        </p>
                                        {evidence && (
                                          <p className={`text-xs mt-1.5 italic p-2 rounded ${isSeverityWarning ? 'bg-amber-100 text-amber-600' : autoFailOverride ? 'bg-amber-100/50 text-amber-600' : 'bg-rose-100/50 text-rose-600'}`}>
                                            "{evidence}"
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    {hasValidTimestamp && (
                                      <button
                                        onClick={() => handleSeek(seekSeconds >= 0 ? seekSeconds : parseTimeToSeconds(displayTimestamp || '0:00'))}
                                        className={`shrink-0 flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-md transition-colors ${isSeverityWarning ? 'text-amber-600 bg-amber-100 hover:bg-amber-200' : autoFailOverride ? 'text-amber-600 bg-amber-100 hover:bg-amber-200' : 'text-rose-600 bg-rose-100 hover:bg-rose-200'}`}
                                      >
                                        <Play size={10} fill="currentColor" />
                                        Jump to {displayTimestamp}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Override reason input */}
                        {autoFailOverride && (
                          <div className="mt-4 pt-3 border-t border-amber-200">
                            <label className="block text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1.5">
                              Override Reason (Required)
                            </label>
                            <textarea
                              value={autoFailOverrideReason}
                              onChange={(e) => setAutoFailOverrideReason(e.target.value)}
                              placeholder="Explain why this auto-fail is a false positive..."
                              className="w-full px-3 py-2 rounded-lg border border-amber-300 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 resize-none bg-white"
                              rows={2}
                            />
                            {/* Show recalculated score */}
                            {(() => {
                              // Calculate what the score would be without auto-fail
                              const totalPossible = fullAuditList.reduce((sum: number, item: any) => {
                                const status = (item.status || '').toLowerCase();
                                if (status === 'n/a') return sum;
                                return sum + (item.points_possible || item.pointsPossible || 0);
                              }, 0);
                              const totalEarned = fullAuditList.reduce((sum: number, item: any) => {
                                const status = (item.status || '').toLowerCase();
                                if (status === 'n/a') return sum;
                                const itemKey = (item.name || item.requirement || '').toLowerCase();
                                const isOverridden = localOverrides[itemKey];
                                const isPassing = isOverridden
                                  ? isOverridden.toLowerCase() === 'pass'
                                  : ['met', 'pass', 'yes', 'true'].includes(status);
                                return sum + (isPassing ? (item.points_possible || item.pointsPossible || item.points_earned || 0) : 0);
                              }, 0);
                              const recalculatedScore = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;

                              return (
                                <div className="mt-3 flex items-center gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500">Current Score:</span>
                                    <span className="text-sm font-bold text-rose-600 line-through">0</span>
                                  </div>
                                  <ArrowRight size={14} className="text-slate-400" />
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500">Recalculated:</span>
                                    <span className={`text-sm font-bold ${recalculatedScore >= 80 ? 'text-emerald-600' : recalculatedScore >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                                      {recalculatedScore}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* MANUAL AUTO-FAIL SECTION */}
              {onManualAutoFail && call.qaStatus !== 'approved' && !effectiveAutoFailTriggered && (
                <div className="space-y-4 mt-6">
                  <div className="flex items-center gap-2 pl-2">
                    <Flag size={14} className="text-rose-500" />
                    <h4 className="text-[11px] font-black text-[#8E8E93] uppercase tracking-widest">Manual Auto-Fail</h4>
                  </div>

                  {!showManualAutoFail ? (
                    <button
                      onClick={() => setShowManualAutoFail(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-rose-300 text-rose-600 font-bold text-sm hover:bg-rose-50 hover:border-rose-400 transition-all"
                    >
                      <Flag size={14} />
                      Flag as Auto-Fail (Missed by AI)
                    </button>
                  ) : (
                    <div className="bg-white rounded-2xl border-2 border-rose-200 p-5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-rose-700">Flag Auto-Fail Violation</p>
                        <button
                          onClick={() => { setShowManualAutoFail(false); setManualAfCode('AF-01'); setManualAfEvidence(''); setManualAfReason(''); }}
                          className="text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Violation Code</label>
                        <select
                          value={manualAfCode}
                          onChange={(e) => setManualAfCode(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 bg-white"
                        >
                          <option value="AF-01">AF-01 - Making Promises</option>
                          <option value="AF-02">AF-02 - Discussing Money</option>
                          <option value="AF-03">AF-03 - Politics/Religion</option>
                          <option value="AF-04">AF-04 - Incorrect Transfers</option>
                          <option value="AF-05">AF-05 - Wrong Disposition/Miscoding</option>
                          <option value="AF-06">AF-06 - No-Response Transfer</option>
                          <option value="AF-07">AF-07 - Ignoring DNC</option>
                          <option value="AF-08">AF-08 - Transferring DQ Prospects</option>
                          <option value="AF-09">AF-09 - Misrepresenting Affiliation</option>
                          <option value="AF-10">AF-10 - Incorrect Insurance Messaging</option>
                          <option value="AF-11">AF-11 - Poor Call Quality (Warning)</option>
                          <option value="AF-12">AF-12 - Poor Prospect State</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Evidence (Quote from transcript)</label>
                        <textarea
                          value={manualAfEvidence}
                          onChange={(e) => setManualAfEvidence(e.target.value)}
                          placeholder="Paste the exact quote from the transcript that demonstrates the violation..."
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 resize-none"
                          rows={2}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Reason (Required)</label>
                        <textarea
                          value={manualAfReason}
                          onChange={(e) => setManualAfReason(e.target.value)}
                          placeholder="Explain why this should be auto-failed..."
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 resize-none"
                          rows={2}
                        />
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <p className="text-xs text-slate-400">Score will be set to 0</p>
                        <button
                          type="button"
                          disabled={isSubmittingManualAF || !manualAfReason.trim()}
                          onClick={async () => {
                            if (!call) return;
                            setIsSubmittingManualAF(true);
                            try {
                              const reviewerName = profile?.first_name && profile?.last_name
                                ? `${profile.first_name} ${profile.last_name}`
                                : user?.displayName || user?.email?.split('@')[0] || 'QA Agent';

                              const afViolationNames: Record<string, string> = {
                                'AF-01': 'Making Promises', 'AF-02': 'Discussing Money', 'AF-03': 'Politics/Religion',
                                'AF-04': 'Incorrect Transfers', 'AF-05': 'Wrong Disposition/Miscoding', 'AF-06': 'No-Response Transfer',
                                'AF-07': 'Ignoring DNC', 'AF-08': 'Transferring DQ Prospects', 'AF-09': 'Misrepresenting Affiliation',
                                'AF-10': 'Incorrect Insurance Messaging', 'AF-11': 'Poor Call Quality', 'AF-12': 'Poor Prospect State'
                              };

                              await onManualAutoFail!(call.id, {
                                afCode: manualAfCode,
                                violation: afViolationNames[manualAfCode] || manualAfCode,
                                evidence: manualAfEvidence.trim() || 'Manually flagged by QA reviewer',
                                reason: manualAfReason.trim()
                              }, reviewerName);

                              setToast({ message: `Auto-fail ${manualAfCode} applied successfully`, type: 'success' });
                              setShowManualAutoFail(false);
                              setManualAfCode('AF-01');
                              setManualAfEvidence('');
                              setManualAfReason('');
                              setTimeout(() => setToast(null), 3000);
                            } catch (err) {
                              setToast({ message: 'Failed to apply auto-fail', type: 'error' });
                              setTimeout(() => setToast(null), 3000);
                            } finally {
                              setIsSubmittingManualAF(false);
                            }
                          }}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 text-white font-bold text-sm shadow-lg shadow-rose-500/30 hover:shadow-rose-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSubmittingManualAF ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              Applying...
                            </>
                          ) : (
                            <>
                              <Flag size={14} />
                              Apply Auto-Fail
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* QA SUBMIT REVIEW SECTION */}
              {onQASubmit && call.qaStatus !== 'approved' && (
                <div className="space-y-4 mt-8">
                  <div className="flex items-center gap-2 pl-2">
                    <ClipboardCheck size={14} className="text-emerald-500" />
                    <h4 className="text-[11px] font-black text-[#8E8E93] uppercase tracking-widest">Submit QA Review</h4>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        QA Notes (Optional)
                      </label>
                      <textarea
                        value={qaReviewNotes}
                        onChange={(e) => setQaReviewNotes(e.target.value)}
                        placeholder="Add any notes about this review..."
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 resize-none"
                        rows={3}
                      />
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <div className="text-xs text-slate-400">
                        Reviewed by: <span className="font-bold text-slate-900">
                          {profile?.first_name && profile?.last_name
                            ? `${profile.first_name} ${profile.last_name}`
                            : user?.displayName || user?.email?.split('@')[0] || 'QA Agent'}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={isSubmittingReview}
                        onClick={async () => {
                          if (!call) return;
                          setIsSubmittingReview(true);
                          try {
                            const reviewerName = profile?.first_name && profile?.last_name
                              ? `${profile.first_name} ${profile.last_name}`
                              : user?.displayName || user?.email?.split('@')[0] || 'QA Agent';

                            // Check if there's an auto-fail override to include
                            const warningOnlyCodes = ['AF-13'];
                            const violations = Array.isArray(effectiveAutoFailReasons) ? effectiveAutoFailReasons : [];
                            const criticalViolations = violations.filter((v: any) => {
                              const code = typeof v === 'string' ? v : (v.code || '');
                              return !warningOnlyCodes.includes(code);
                            });
                            const hasAutoFail = effectiveAutoFailTriggered || criticalViolations.length > 0;

                            // Prepare override data if applicable
                            let overrideData: AutoFailOverrideData | undefined;
                            if (hasAutoFail && autoFailOverride) {
                              const recalculatedScore = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;
                              overrideData = {
                                overridden: true,
                                reason: autoFailOverrideReason || 'QA determined auto-fail was a false positive',
                                originalScore: 0,
                                recalculatedScore
                              };
                            }

                            await onQASubmit(call.id, reviewerName, qaReviewNotes || undefined, overrideData);
                            setToast({ message: 'Review submitted successfully!', type: 'success' });
                            setQaReviewNotes('');
                            setAutoFailOverride(false);
                            setAutoFailOverrideReason('');
                            setTimeout(() => setToast(null), 3000);
                          } catch (err) {
                            setToast({ message: 'Failed to submit review', type: 'error' });
                            setTimeout(() => setToast(null), 3000);
                          } finally {
                            setIsSubmittingReview(false);
                          }
                        }}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmittingReview ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <ClipboardCheck size={16} />
                            Submit Review
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Already reviewed indicator */}
              {call.qaStatus === 'approved' && call.qaReviewedBy && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-4 mt-8">
                  <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <ClipboardCheck size={24} className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-emerald-700">Review Completed</p>
                    <p className="text-xs text-emerald-600 mt-0.5">
                      Reviewed by <span className="font-bold">{call.qaReviewedBy}</span>
                      {call.qaReviewedAt && (
                        <> on {new Date(call.qaReviewedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
                      )}
                    </p>
                    {call.qaNotes && (
                      <p className="text-xs text-slate-600 mt-2 italic">"{call.qaNotes}"</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
          }
        </div >

      </div>

      {/* Sleek Toast Notification */}
      {
        toast && (
          <div
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl animate-in slide-in-from-bottom-4 fade-in duration-300 ${toast.type === 'success'
              ? 'bg-emerald-500/90 border-emerald-400/50 text-white'
              : 'bg-rose-500/90 border-rose-400/50 text-white'
              }`}
          >
            <div className="flex items-center gap-3">
              {toast.type === 'success' ? (
                <CheckCircle2 size={20} className="text-white" />
              ) : (
                <XCircle size={20} className="text-white" />
              )}
              <span className="font-semibold text-sm">{toast.message}</span>
            </div>
          </div>
        )
      }
    </div >
  );
};