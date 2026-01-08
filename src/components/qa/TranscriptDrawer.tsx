"use client";

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { CallData } from '@/types/qa-types';
import {
  X, Play, Pause, Loader2, Clock, CheckCircle2, XCircle,
  BarChart3, MessageSquare, Sparkles, FastForward, Rewind,
  Volume2, VolumeX, ShieldCheck, Zap, Check, Search, ExternalLink,
  Settings2, ChevronRight, Activity, MousePointer2, Calendar, Copy, Quote, AlertTriangle, MoreHorizontal,
  FileText, Lightbulb, Flag, User, Headphones, Award, CheckCircle, Sliders, Hash, Bookmark, ArrowRight, Minus, Plus, ChevronDown, ChevronUp,
  Brain, BrainCircuit, Eye, FileSearch, AlertCircle
} from 'lucide-react';
import { NeonButton } from './ui/NeonButton';
import { useAuth } from '@/context/AuthContext';

interface TranscriptDrawerProps {
  call: CallData | null;
  onClose: () => void;
  onScoreUpdate?: (callId: number | string, newScore: number) => void;
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

export const TranscriptDrawer: React.FC<TranscriptDrawerProps> = ({ call, onClose, onScoreUpdate }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<'analysis' | 'transcript'>('analysis');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [expandedAuditIdx, setExpandedAuditIdx] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);

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

  // Confidence threshold for requiring manual review
  const CONFIDENCE_THRESHOLD = 90;

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

    // Handle time ranges like "0:20-0:49" - take the start time
    let cleanTime = timeStr;
    if (timeStr.includes('-')) {
      // Could be "0:20-0:49" (range) or just contains a dash somewhere
      const rangeParts = timeStr.split('-');
      // If first part looks like a time (contains colon), use that
      if (rangeParts[0].includes(':')) {
        cleanTime = rangeParts[0].trim();
      }
    }

    const parts = cleanTime.split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
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

  // Enhanced checklist parser to handle various formats from n8n
  const getChecklistArray = (cl: any) => {
    if (!cl) return [];

    // Already an array
    if (Array.isArray(cl)) {
      return cl.map((item, idx) => {
        // If item is just a string, convert to object
        if (typeof item === 'string') {
          return { name: item, status: 'PASS' };
        }
        // Ensure name is present
        return {
          ...item,
          name: item.name || item.requirement || item.requirement_name || `Item ${idx + 1}`
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
          status: value?.status || 'PASS'
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
    const parsed = getChecklistArray(call?.checklist);

    // Helper to parse time strings like "0:18", "1:21", "00:40" to seconds
    const timeToSeconds = (timeStr: string | undefined): number => {
      if (!timeStr) return 999999; // Put items without time at the end
      const match = timeStr.match(/(\d+):(\d+)/);
      if (!match) return 999999;
      return parseInt(match[1]) * 60 + parseInt(match[2]);
    };

    // Sort by timestamp (earliest first)
    return parsed.sort((a: any, b: any) => {
      const timeA = timeToSeconds(a.time || a.timestamp || a.start_time);
      const timeB = timeToSeconds(b.time || b.timestamp || b.start_time);
      return timeA - timeB;
    });
  }, [call?.checklist]);

  const timelineMarkers = useMemo(() => {
    const list: { title: string, time: string, seconds: number, position: number, color: string, type: 'pass' | 'fail' | 'chapter' }[] = [];

    // Calculate effective duration (audio object or metadata string)
    const effectiveDuration = duration > 0 ? duration : parseTimeToSeconds(call?.duration || "0:00");
    if (!effectiveDuration) return [];

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

    // Process all checklist items with override support
    fullAuditList.forEach((item, idx) => {
      const originalStatus = (item.status || '').toLowerCase();
      if (originalStatus === 'n/a') return;

      const itemName = item.name || item.requirement || 'Check';
      const isMet = getEffectiveStatus(itemName, originalStatus);

      // Use explicit time, or estimate based on position in checklist if absolutely missing
      let timeStr = item.time || item.timestamp;

      // If still missing, we spread them but keep it precise
      if (!timeStr) {
        const estimatedSeconds = Math.round((idx / Math.max(fullAuditList.length, 1)) * (effectiveDuration * 0.9));
        const mins = Math.floor(estimatedSeconds / 60);
        const secs = estimatedSeconds % 60;
        timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      }

      const secs = parseTimeToSeconds(timeStr);
      const pos = (secs / effectiveDuration) * 100;

      if (pos <= 100) {
        list.push({
          title: itemName,
          time: timeStr,
          seconds: secs,
          position: pos,
          color: isMet ? 'bg-emerald-500' : 'bg-rose-500',
          type: isMet ? 'pass' : 'fail'
        });
      }
    });

    // Remove duplicates or very close markers to prevent overlap, prioritizing failures
    const sorted = list.sort((a, b) => a.seconds - b.seconds);
    const filtered: typeof list = [];

    sorted.forEach((m, i) => {
      if (i === 0) {
        filtered.push(m);
        return;
      }

      const prev = filtered[filtered.length - 1];
      const distance = Math.abs(m.position - prev.position);

      if (distance < 1.5) {
        // If very close, only add if it's a higher priority type
        // fail > chapter > pass
        const priority = { fail: 3, chapter: 2, pass: 1 };
        if (priority[m.type] > priority[prev.type]) {
          filtered[filtered.length - 1] = m; // Replace with higher priority
        }
        // otherwise skip m
        return;
      }
      filtered.push(m);
    });

    return filtered;
  }, [call?.chapters, fullAuditList, duration, call?.duration, localOverrides]);

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
  }, [call?.id, calculatedScore, totalPossible]);

  useEffect(() => {
    if (call) {
      setCurrentTime(0);
      setIsPlaying(false);
      setCoachMessages([]);
      setCoachQuery('');
      setExpandedAuditIdx(null);

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
      let isAgent = false;

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
      // 1. Strong Semantic Override (Ignore label)
      if (semanticScore >= 3) {
        isAgent = true;
      } else if (semanticScore <= -3) {
        isAgent = false;
      } else {
        // 2. Fallback to Label Matching
        const lowerLabel = line.speaker.toLowerCase();
        const labelMatchesAgentName = agentNameParts.some(p => lowerLabel.includes(p));

        if (labelMatchesAgentName) {
          isAgent = true;
        } else if (lowerLabel.includes('agent') || lowerLabel.includes('rep')) {
          isAgent = true;
        } else if (lowerLabel.includes('customer') || lowerLabel.includes('prospect')) {
          isAgent = false;
        } else {
          // 3. Fallback to Previous if completely ambiguous (Continuation)
          // This handles split lines where label might be missing or same
          if (i > 0) {
            isAgent = arr[i - 1].isAgent;
          } else {
            isAgent = false; // Default start
          }
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

      <div className="relative w-full max-w-4xl bg-[#F2F2F7] h-full shadow-2xl flex flex-col animate-slide-in-right ring-1 ring-black/5">

        {/* Navigation Bar */}
        <div className="px-6 py-3 flex flex-col items-center bg-white/80 backdrop-blur-2xl border-b border-slate-200 z-50 sticky top-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full mb-4 opacity-50" />
          <div className="flex items-center justify-between w-full mb-4">
            <button onClick={onClose} className="text-[#007AFF] font-medium text-[17px] flex items-center gap-1 transition-opacity active:opacity-50">
              <X size={20} strokeWidth={2.5} /> Close
            </button>
            <div className="text-center">
              <h2 className="text-[17px] font-bold text-black leading-tight tracking-tight">{call.agentName}</h2>
              <div className="flex items-center justify-center gap-1.5 mt-0.5">
                <CheckCircle size={10} className="text-emerald-500" strokeWidth={3} />
                <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest">ID: {call.callId}</p>
              </div>
            </div>
            <div className="w-10" />
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

        {/* Audio Player */}
        <div className="px-6 pt-6 pb-2 z-40 bg-[#F2F2F7]">
          <div className="bg-white rounded-[2rem] shadow-[0_15px_40px_-15px_rgba(0,0,0,0.1)] border border-white p-5 flex items-center gap-5 relative overflow-visible">
            <audio
              ref={audioRef}
              src={call.recordingUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={() => setIsPlaying(false)}
            />

            <button
              onClick={togglePlay}
              className="h-12 w-12 bg-black text-white rounded-full flex items-center justify-center shrink-0 active:scale-90 transition-transform shadow-lg"
            >
              {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
            </button>

            <div className="flex-1 min-w-0">
              {/* Time display - use actual audio duration when available */}
              <div className="flex justify-between text-[11px] font-bold text-[#8E8E93] tabular-nums mb-2">
                <span>{formatTime(currentTime)}</span>
                <span className="text-purple-600 font-extrabold uppercase tracking-tighter">Pitch Sync Active</span>
                <span>{formatTime(duration || 0)}</span>
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

                {/* MARKERS LAYER - High Z-Index, absolute positioning */}
                <div className="absolute inset-0 z-30 pointer-events-none">
                  {timelineMarkers.map((m, idx) => (
                    <div
                      key={idx}
                      className="absolute top-1/2 -translate-y-1/2 group/marker pointer-events-auto cursor-pointer hover:z-50"
                      style={{ left: `${m.position}%` }}
                      onClick={(e) => { e.stopPropagation(); handleSeek(m.time); }}
                    >
                      {/* Touch Target */}
                      <div className="absolute -inset-2 bg-transparent" />

                      {/* Pin */}
                      <div className={`relative flex flex-col items-center transition-all duration-300 group-hover/marker:scale-125 group-hover/marker:-translate-y-2`}>
                        <div className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-md flex items-center justify-center ${m.type === 'pass' ? 'bg-emerald-500' : m.type === 'fail' ? 'bg-rose-500' : 'bg-indigo-500'
                          }`}>
                          <div className="w-1 h-1 bg-white rounded-full" />
                        </div>
                        <div className={`w-0.5 h-6 -mt-1 ${m.type === 'pass' ? 'bg-emerald-500' : m.type === 'fail' ? 'bg-rose-500' : 'bg-indigo-500'
                          }`} />
                      </div>

                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover/marker:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl border border-white/10 z-50 flex items-center gap-2">
                        {m.type === 'pass' ? <CheckCircle2 size={10} className="text-emerald-400" /> : m.type === 'fail' ? <XCircle size={10} className="text-rose-400" /> : <Bookmark size={10} className="text-indigo-400" />}
                        {m.title}
                        <span className="opacity-50 font-normal">({m.time})</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Playhead - uses actual audio duration */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-1.5 bg-purple-900 h-10 rounded-full shadow-xl transition-all pointer-events-none z-20 border border-white/50"
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
                const isActive = currentTime >= msg.startSeconds && currentTime < msg.endSeconds;
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
                          {/* Indicator Dot in Header */}
                          {msg.markers && msg.markers.length > 0 && (
                            <div className="flex items-center gap-1 ml-2">
                              {msg.markers.map((m: { seconds: number; type: string; title: string }, i: number) => (
                                <button
                                  key={i}
                                  onClick={(e) => { e.stopPropagation(); handleSeek(m.seconds); }}
                                  className={`w-2 h-2 rounded-full ring-1 ring-white shadow-sm transition-transform hover:scale-125 cursor-pointer ${m.type === 'pass' ? 'bg-emerald-500' :
                                    m.type === 'fail' ? 'bg-rose-500' : 'bg-indigo-500'
                                    }`}
                                  title={`Jump to ${m.title}`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <div className={`px-5 py-3.5 text-[15px] leading-relaxed shadow-sm relative transition-all duration-300 border-2 
                                ${msg.isAgent
                            ? `rounded-2xl rounded-tr-none ${isActive ? 'bg-indigo-600 text-white border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'bg-indigo-600 text-white border-transparent'}`
                            : `rounded-2xl rounded-tl-none ${isActive ? 'bg-white text-slate-900 border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'bg-slate-50 text-slate-700 border-slate-200'}`
                          }`}>
                          {msg.content}

                          {/* Compliance Markers linked to text */}
                          {msg.markers && msg.markers.length > 0 && (
                            <div className={`mt-3 pt-3 border-t flex flex-wrap gap-2 ${msg.isAgent ? 'border-white/20' : 'border-slate-200'}`}>
                              {msg.markers.map((marker: { seconds: number; type: string; title: string; time: string }, mIdx: number) => (
                                <button
                                  key={mIdx}
                                  onClick={(e) => { e.stopPropagation(); handleSeek(marker.seconds); }}
                                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border transition-all hover:scale-105 active:scale-95 cursor-pointer ${marker.type === 'pass'
                                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30 hover:bg-emerald-500/30'
                                    : marker.type === 'fail'
                                      ? 'bg-rose-500/20 text-rose-200 border-rose-500/30 hover:bg-rose-500/30'
                                      : 'bg-indigo-500/20 text-indigo-200 border-indigo-500/30 hover:bg-indigo-500/30'
                                    } ${!msg.isAgent && marker.type === 'pass' ? '!text-emerald-700 !bg-emerald-100 !border-emerald-200 hover:!bg-emerald-200' : ''} ${!msg.isAgent && marker.type === 'fail' ? '!text-rose-700 !bg-rose-100 !border-rose-200 hover:!bg-rose-200' : ''}`}
                                >
                                  {marker.type === 'pass' ? <CheckCircle2 size={10} /> : marker.type === 'fail' ? <XCircle size={10} /> : <Bookmark size={10} />}
                                  {marker.title}
                                  <span className="opacity-70 font-mono ml-1">({marker.time})</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-400">
              {/* Meta Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { icon: User, label: "Agent", value: call.agentName },
                  { icon: Calendar, label: "Date", value: new Date(call.analyzedAt).toLocaleDateString() },
                  { icon: Activity, label: "Type", value: call.campaignType },
                  { icon: Award, label: "Score", value: `${call.complianceScore}%`, color: call.complianceScore >= 85 ? 'text-emerald-500' : call.complianceScore >= 70 ? 'text-amber-500' : 'text-rose-500' }
                ].map((item, i) => (
                  <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-1">
                      <item.icon size={14} className="text-slate-400" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.label}</span>
                    </div>
                    <p className={`text-sm font-bold truncate ${item.color || 'text-slate-800'}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              {/* AI Coach Section */}
              <div ref={coachSectionRef} className="space-y-4">
                <div className="relative overflow-hidden rounded-[2rem] border border-white/20 bg-slate-900 shadow-2xl p-6 space-y-6">
                  <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-purple-600/20 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />

                  <div className="relative z-10 flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-purple-600 flex items-center justify-center">
                        <Brain size={16} className="text-white" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white tracking-wide">AI Quick Actions</h4>
                        <p className="text-[10px] text-slate-400">One-click analysis for this call</p>
                      </div>
                    </div>
                  </div>

                  {/* Coaching Notes if present */}
                  {call.coachingNotes && call.coachingNotes.length > 0 && (
                    <div className="relative z-10 grid grid-cols-1 gap-4">
                      <h4 className="text-[11px] font-black text-purple-300 uppercase tracking-widest">Coaching Opportunities</h4>
                      {call.coachingNotes.slice(0, 2).map((note, idx) => (
                        <div key={idx} className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-start gap-4">
                          <div className="h-6 w-6 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
                            <Lightbulb size={14} className="text-purple-300" />
                          </div>
                          <p className="text-sm text-slate-300 leading-relaxed">{note}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action Buttons Grid */}
                  <div className="relative z-10 grid grid-cols-2 gap-3">
                    {DEEP_INSIGHT_PROMPTS.slice(0, 4).map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleAskCoach(prompt.query)}
                        disabled={isCoachThinking}
                        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-purple-600/20 hover:border-purple-500/50 hover:text-white text-slate-400 text-xs font-semibold transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <prompt.icon size={14} className="group-hover:text-purple-300 transition-colors shrink-0" />
                        <span className="truncate">{prompt.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Response Area */}
                  {(coachMessages.length > 0 || isCoachThinking) && (
                    <div className="relative z-10 bg-white/5 rounded-2xl border border-white/10 p-4 backdrop-blur-md">
                      <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-4" ref={chatContainerRef}>
                        {isCoachThinking && (
                          <div className="flex items-center gap-2 text-purple-300 text-xs font-bold">
                            <Loader2 size={12} className="animate-spin" /> Analyzing...
                          </div>
                        )}
                        {coachMessages.length > 0 && !isCoachThinking && (
                          <div className="space-y-3">
                            {/* Show only the last response */}
                            <div className="text-sm text-slate-200 leading-relaxed">
                              <FormattedCoachResponse text={coachMessages[coachMessages.length - 1]?.text || ''} />
                            </div>
                            {/* Copy button */}
                            <button
                              onClick={() => {
                                const lastMessage = coachMessages[coachMessages.length - 1]?.text || '';
                                navigator.clipboard.writeText(lastMessage);
                                setToast({ message: 'Copied to clipboard!', type: 'success' });
                              }}
                              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-white bg-white/5 hover:bg-purple-600/20 rounded-lg transition-all"
                            >
                              <Copy size={12} />
                              Copy to Clipboard
                            </button>
                          </div>
                        )}
                      </div>
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
                <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm">
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

                    {/* AI Confidence - Expandable with supporting evidence */}
                    <div className="pt-4 mt-4 border-t border-slate-100">
                      <div
                        className="bg-indigo-50/50 rounded-xl overflow-hidden cursor-pointer hover:bg-indigo-50 transition-colors"
                        onClick={() => setShowConfidenceDetails(!showConfidenceDetails)}
                      >
                        <div className="flex items-center justify-between p-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-indigo-100 text-indigo-600">
                              <BrainCircuit size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-700">AI Analysis Confidence</p>
                              <p className="text-[11px] text-slate-500">
                                {showConfidenceDetails ? 'Click to collapse' : 'Click to see supporting evidence'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xl font-bold ${avgConfidence >= 90 ? 'text-emerald-600' :
                              avgConfidence >= 75 ? 'text-amber-500' : 'text-rose-500'
                              }`}>
                              {avgConfidence}%
                            </span>
                            <ChevronDown
                              size={16}
                              className={`text-slate-400 transition-transform ${showConfidenceDetails ? 'rotate-180' : ''}`}
                            />
                          </div>
                        </div>

                        {/* Expandable evidence section */}
                        {showConfidenceDetails && confidenceEvidence && (
                          <div className="px-4 pb-4 pt-2 border-t border-indigo-100 animate-in slide-in-from-top-2 duration-200">
                            {/* Summary guidance */}
                            <div className="mb-3 p-2 bg-indigo-50 rounded-lg">
                              <p className="text-[11px] text-indigo-700 leading-relaxed">
                                <strong>What this means:</strong> {avgConfidence >= 90
                                  ? "AI had strong evidence for most decisions. Minimal manual review needed."
                                  : avgConfidence >= 75
                                    ? "AI had moderate evidence. Review items without transcript quotes."
                                    : "AI made some uncertain decisions. Manual review recommended."}
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs">
                              {/* Transcript Evidence */}
                              <div className="bg-white rounded-lg p-3 border border-slate-100">
                                <div className="flex items-center gap-1.5 text-indigo-600 mb-1">
                                  <FileSearch size={12} />
                                  <span className="font-semibold">Transcript Evidence</span>
                                </div>
                                <p className="text-slate-600">
                                  <span className="font-bold text-slate-800">{confidenceEvidence.strongEvidenceCount}/{confidenceEvidence.total}</span> items cite transcript quotes
                                </p>
                                <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-indigo-500 rounded-full"
                                    style={{ width: `${confidenceEvidence.evidencePercent}%` }}
                                  />
                                </div>
                                {confidenceEvidence.strongEvidenceCount === confidenceEvidence.total ? (
                                  <p className="text-[10px] text-emerald-600 mt-2 flex items-center gap-1">
                                    <Check size={12} strokeWidth={2.5} />
                                    All decisions backed by transcript
                                  </p>
                                ) : (
                                  <div className="mt-2 bg-amber-50 text-amber-700 px-2.5 py-1.5 rounded-md flex items-center gap-2 border border-amber-100 hover:bg-amber-100 transition-colors cursor-help"
                                    title={`Items missing quotes:\n• ${confidenceEvidence.itemsMissingQuotes.join('\n• ')}`}>
                                    <AlertTriangle size={12} strokeWidth={2.5} className="shrink-0" />
                                    <span className="text-[10px] font-bold">
                                      {confidenceEvidence.itemsMissingQuotes.length} items lack quotes — verify
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* AI Reasoning */}
                              <div className="bg-white rounded-lg p-3 border border-slate-100">
                                <div className="flex items-center gap-1.5 text-purple-600 mb-1">
                                  <FileText size={12} />
                                  <span className="font-semibold">AI Reasoning</span>
                                </div>
                                <p className="text-slate-600">
                                  <span className="font-bold text-slate-800">{confidenceEvidence.detailedNotesCount}/{confidenceEvidence.total}</span> items have reasoning notes
                                </p>
                                <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-purple-500 rounded-full"
                                    style={{ width: `${confidenceEvidence.notesPercent}%` }}
                                  />
                                </div>
                                {confidenceEvidence.detailedNotesCount === confidenceEvidence.total ? (
                                  <p className="text-[10px] text-purple-600 mt-2 flex items-center gap-1">
                                    <Check size={12} strokeWidth={2.5} />
                                    AI explained all decisions
                                  </p>
                                ) : (
                                  <div className="mt-2 bg-amber-50 text-amber-700 px-2.5 py-1.5 rounded-md flex items-center gap-2 border border-amber-100 hover:bg-amber-100 transition-colors cursor-help"
                                    title={`Items with brief notes:\n• ${confidenceEvidence.itemsWithBriefNotes.join('\n• ')}`}>
                                    <AlertTriangle size={12} strokeWidth={2.5} className="shrink-0" />
                                    <span className="text-[10px] font-bold">
                                      {confidenceEvidence.itemsWithBriefNotes.length} items share brief notes
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Sub-check Consistency */}
                              {(confidenceEvidence.consistentSubChecksCount > 0 || confidenceEvidence.mixedSubChecksCount > 0) && (
                                <div className="bg-white rounded-lg p-3 border border-slate-100">
                                  <div className="flex items-center gap-1.5 text-emerald-600 mb-1">
                                    <CheckCircle2 size={12} />
                                    <span className="font-semibold">Sub-check Consistency</span>
                                  </div>
                                  <p className="text-slate-600">
                                    <span className="font-bold text-emerald-600">{confidenceEvidence.consistentSubChecksCount}</span> consistent,
                                    <span className={`font-bold ml-1 ${confidenceEvidence.mixedSubChecksCount > 0 ? 'text-amber-600' : 'text-slate-600'}`}>
                                      {confidenceEvidence.mixedSubChecksCount}
                                    </span> mixed
                                  </p>
                                  {confidenceEvidence.mixedSubChecksCount > 0 ? (
                                    <div className="mt-2 bg-amber-50 text-amber-700 px-2.5 py-1.5 rounded-md flex items-center gap-2 border border-amber-100 hover:bg-amber-100 transition-colors cursor-help" title="Mixed results in sub-checks">
                                      <AlertTriangle size={12} strokeWidth={2.5} className="shrink-0" />
                                      <span className="text-[10px] font-bold">
                                        {confidenceEvidence.mixedSubChecksCount} mixed — expand to review
                                      </span>
                                    </div>
                                  ) : (
                                    <p className="text-[10px] text-emerald-600 mt-2 flex items-center gap-1">
                                      <CheckCircle2 size={12} strokeWidth={2.5} />
                                      Sub-checks are consistent
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* Special Markers */}
                              <div className="bg-white rounded-lg p-3 border border-slate-100">
                                <div className="flex items-center gap-1.5 text-slate-600 mb-1">
                                  <AlertCircle size={12} />
                                  <span className="font-semibold">Special Markers</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {confidenceEvidence.hasAutoFail && (
                                    <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[10px] font-semibold">
                                      AUTO-FAIL detected
                                    </span>
                                  )}
                                  {confidenceEvidence.hasPartialMatches && (
                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-semibold">
                                      PARTIAL matches
                                    </span>
                                  )}
                                  {!confidenceEvidence.hasAutoFail && !confidenceEvidence.hasPartialMatches && (
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-semibold">
                                      None
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1.5 italic">
                                  {confidenceEvidence.hasAutoFail
                                    ? "Critical violation found — review required"
                                    : confidenceEvidence.hasPartialMatches
                                      ? "Some items had unclear evidence"
                                      : "No special flags"}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
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

              {/* COMPLETE VERIFICATION AUDIT (Expandable) */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pl-2">
                  <ShieldCheck size={14} className="text-indigo-500" />
                  <h4 className="text-[11px] font-black text-[#8E8E93] uppercase tracking-widest">Complete Verification Audit</h4>
                  {/* Show count of items needing review - subtle */}
                  {(() => {
                    const needsReview = fullAuditList.filter((item: any) => {
                      const conf = item.confidence;
                      const key = (item.name || item.requirement || '').toLowerCase();
                      return conf !== undefined && conf < CONFIDENCE_THRESHOLD && !reviewedItems.has(key);
                    }).length;
                    return needsReview > 0 ? (
                      <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Eye size={10} />
                        {needsReview} to review
                      </span>
                    ) : null;
                  })()}
                </div>
                <div className="bg-white rounded-[2rem] border border-slate-100 divide-y divide-slate-100 shadow-sm overflow-hidden">
                  {fullAuditList.length > 0 ? fullAuditList.map((item: any, idx: number) => {
                    const itemKey = (item.name || item.requirement || '').toLowerCase();

                    // Check if this item has been overridden locally (this session) or in QA Notes (database)
                    let overrideStatus: string | null = localOverrides[itemKey] || null;

                    // If not in local state, check QA Notes from database
                    if (!overrideStatus) {
                      try {
                        const qaNotes = (call as any).qaNotes || (call as any)['QA Notes'];
                        console.log('QA Notes for override check:', {
                          itemKey,
                          qaNotes,
                          callId: call.id
                        });
                        if (qaNotes) {
                          const parsed = typeof qaNotes === 'string' ? JSON.parse(qaNotes) : qaNotes;
                          const overrides = parsed.overrides || [];
                          console.log('Parsed overrides:', overrides);
                          const override = overrides.find((o: any) =>
                            o.itemKey?.toLowerCase() === itemKey ||
                            o.itemKey?.toLowerCase().includes(itemKey) ||
                            itemKey.includes(o.itemKey?.toLowerCase() || '')
                          );
                          if (override) {
                            overrideStatus = override.overrideStatus;
                            console.log('Found override for', itemKey, ':', override);
                          }
                        }
                      } catch (e) {
                        console.error('Error parsing QA Notes:', e);
                      }
                    }

                    // Use override status if available, otherwise use original status
                    const effectiveStatus = overrideStatus || item.status || '';
                    const met = ['met', 'pass', 'yes', 'true'].includes(effectiveStatus.toLowerCase());
                    const notMet = ['not_met', 'fail', 'no', 'false'].includes(effectiveStatus.toLowerCase());
                    const isOverridden = overrideStatus !== null;
                    const isExpanded = expandedAuditIdx === idx;


                    return (
                      <div key={idx} className="group transition-all duration-300">
                        {/* Header Row */}
                        <div
                          onClick={() => setExpandedAuditIdx(isExpanded ? null : idx)}
                          className="px-6 py-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 relative z-10"
                        >
                          <div className="flex items-center gap-4">
                            {/* Simple status icon */}
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${met ? 'bg-emerald-500 text-white' :
                              notMet ? 'bg-rose-500 text-white' :
                                'bg-slate-300 text-white'
                              }`}>
                              {met ? <Check size={16} strokeWidth={3} /> : notMet ? <X size={16} strokeWidth={3} /> : <Clock size={14} />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[15px] font-bold tracking-tight ${met ? 'text-slate-900' : 'text-slate-600'}`}>
                                  {item.name || item.requirement || 'Requirement'}
                                </span>

                                {/* Confidence Badge */}
                                {item.confidence !== undefined && (
                                  <div
                                    title={`Confidence Score: ${item.confidence}%\nBased on transcript accuracy and reasoning quality.`}
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border cursor-help shadow-sm ${item.confidence >= 90 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                      item.confidence >= 75 ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                        'bg-slate-50 text-slate-500 border-slate-100'
                                      }`}>
                                    {item.confidence}% Conf.
                                  </div>
                                )}

                                {/* Evidence Icons */}
                                <div className="flex items-center gap-1 ml-1">
                                  {item.quote && (
                                    <div className="text-slate-400" title="Includes Transcript Quote">
                                      <Quote size={10} strokeWidth={3} />
                                    </div>
                                  )}
                                  {(item.reasoning || item.notes) && (
                                    <div className="text-slate-400" title="Includes AI Reasoning">
                                      <FileText size={10} strokeWidth={3} />
                                    </div>
                                  )}
                                </div>
                              </div>
                              {/* Play Button - Show with time or estimated time */}
                              <div className="flex items-center gap-2 mt-1">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded hover:bg-purple-100 hover:text-purple-600 transition-colors cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Use explicit time or estimate
                                    const effectiveDur = duration || parseTimeToSeconds(call?.duration || "0:00") || 120;
                                    const timeToSeek = item.time || (() => {
                                      const est = Math.round((idx / Math.max(fullAuditList.length, 1)) * effectiveDur * 0.8);
                                      return `${Math.floor(est / 60)}:${(est % 60).toString().padStart(2, '0')}`;
                                    })();
                                    handleSeek(timeToSeek);
                                  }}
                                >
                                  <Play size={8} fill="currentColor" />
                                  {item.time || (() => {
                                    const effectiveDur = duration || parseTimeToSeconds(call?.duration || "0:00") || 120;
                                    const est = Math.round((idx / Math.max(fullAuditList.length, 1)) * effectiveDur * 0.8);
                                    return `${Math.floor(est / 60)}:${(est % 60).toString().padStart(2, '0')}`;
                                  })()}
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Clean status badge - always shows true status */}
                            {met && (
                              <span className={`text-[11px] font-semibold px-3 py-1 rounded-lg ${isOverridden
                                ? 'text-purple-600 bg-purple-50/80'
                                : 'text-emerald-600 bg-emerald-50/80'
                                }`}>
                                {isOverridden ? 'Verified' : 'Pass'} ✓
                              </span>
                            )}
                            {notMet && (
                              <span className="text-[11px] font-semibold text-rose-600 bg-rose-50/80 px-3 py-1 rounded-lg">
                                Fail ✗
                              </span>
                            )}
                            {!met && !notMet && (
                              <span className="text-[11px] font-semibold text-slate-400 bg-slate-50 px-3 py-1 rounded-lg">
                                Pending
                              </span>
                            )}

                            {/* Needs review indicator - subtle eye icon */}
                            {item.confidence !== undefined && item.confidence < CONFIDENCE_THRESHOLD && !reviewedItems.has(itemKey) && (
                              <button
                                type="button"
                                className="flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 px-2 py-1 rounded-md transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReviewedItems(prev => new Set([...prev, itemKey]));
                                  setToast({ message: 'Marked as reviewed', type: 'success' });
                                  setTimeout(() => setToast(null), 1500);
                                }}
                                title={`AI confidence: ${item.confidence}% - Click after listening to confirm`}
                              >
                                <Eye size={12} />
                                Review
                              </button>
                            )}

                            {/* Verify button for failed items */}
                            {!isOverridden && notMet && (
                              <button
                                type="button"
                                className="text-[10px] font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-md transition-all"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const itemKeyDisplay = item.name || item.requirement || `item_${idx}`;
                                  const reviewerName = profile?.name || user?.displayName || 'QA Agent';
                                  try {
                                    const response = await fetch('/api/qa/override-item', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        callId: String(call.id),
                                        itemKey: itemKeyDisplay,
                                        overrideStatus: 'PASS',
                                        reviewedBy: reviewerName,
                                        notes: `Verified by ${reviewerName}`
                                      })
                                    });
                                    const data = await response.json();
                                    if (data.success) {
                                      setLocalOverrides(prev => ({ ...prev, [itemKeyDisplay.toLowerCase()]: 'PASS' }));
                                      setToast({ message: 'Verified ✓', type: 'success' });
                                      setTimeout(() => setToast(null), 2000);
                                    }
                                  } catch (err) {
                                    setToast({ message: 'Failed', type: 'error' });
                                    setTimeout(() => setToast(null), 2000);
                                  }
                                }}
                                title="Mark as verified after listening"
                              >
                                Verify ✓
                              </button>
                            )}

                            {/* Expand/collapse indicator */}
                            <ChevronDown size={16} className={`text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                        </div>

                        {/* Expanded Evidence Details */}
                        {
                          isExpanded && (
                            <div className="px-6 pb-6 pt-2 bg-slate-50/50 border-t border-slate-100 animate-in slide-in-from-top-2">
                              <div className="ml-14 space-y-4">
                                {/* Evidence / Reasoning */}
                                {(item.evidence || item.reasoning) && (
                                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                      <FileText size={12} /> Verification Evidence
                                    </h5>
                                    <p className="text-sm text-slate-600 leading-relaxed font-medium">
                                      {item.evidence || item.reasoning}
                                    </p>
                                  </div>
                                )}

                                {/* Specific Quote if available */}
                                {item.quote && (
                                  <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                                    <h5 className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                      <Quote size={12} /> Transcript Match
                                    </h5>
                                    <p className="text-sm text-purple-800 italic font-serif">
                                      "{item.quote}"
                                    </p>
                                  </div>
                                )}

                                {/* Notes */}
                                {item.notes && (
                                  <div className="flex gap-2 items-start text-xs text-slate-500">
                                    <span className="font-bold shrink-0">Auditor Notes:</span>
                                    <span>{item.notes}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        }
                      </div>
                    );
                  }) : (
                    <div className="px-8 py-10 text-center">
                      <p className="text-slate-400 italic text-sm">No specific checklist data found.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
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