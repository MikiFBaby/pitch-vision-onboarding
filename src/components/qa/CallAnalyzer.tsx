"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, X, CheckCircle2, Zap, AlertTriangle, FileAudio, User, RotateCcw, Files, Loader2, Clock } from 'lucide-react';
import { CallData } from '@/types/qa-types';
import { supabase } from '@/lib/supabase-client';
import { PitchVisionLogo } from '@/components/ui/pitch-vision-logo';

interface CallAnalyzerProps {
  isOpen: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onAnalysisComplete: (data: CallData) => void;
  onUploadSuccess?: () => void;
}

interface FileState {
  file: File;
  id: string;
  batchId?: string;
  progress: number; // Real milestone progress (0-100)
  animatedProgress: number; // Smoothly animated progress
  status: 'pending' | 'analyzing' | 'completed' | 'error' | 'duplicate';
  estimatedDuration: number;
  errorMessage?: string;
  milestoneDisplay?: string;
  milestoneRaw?: string;
  startTime?: number; // When processing started
  lastUpdateTime?: number; // Last realtime update timestamp - for backup polling
  qaResultId?: number; // Links to QA Results table after completion
  recordingUrl?: string; // Audio playback URL from QA Results
}

// Direct upload to n8n webhook - bypasses Next.js API for concurrent batch uploads
const WEBHOOK_URL = 'https://n8n.pitchvision.io/webhook/qa-upload';
const MAX_FILE_SIZE_MB = 250;
const AVERAGE_PROCESSING_TIME_MS = 180000; // 3 minutes

// Milestone -> Progress % and Display Text
// Milestones from QA v2 n8n workflows with smooth progress distribution
const MILESTONE_CONFIG: { [key: string]: { progress: number; display: string } } = {
  // === Upload Phase (0-10%) ===
  'upload_received': { progress: 5, display: 'File received by backend' },
  'waiting_for_channel': { progress: 8, display: 'Allocating resources...' },
  'processing_started': { progress: 10, display: 'Processing started' },
  'processing': { progress: 10, display: 'Processing started' }, // Alias

  // === Audio Processing Phase (10-45%) - from QA v2: Audio Processing workflow ===
  'audio_uploaded': { progress: 18, display: 'Audio uploaded to server' },
  'audio_analyzed': { progress: 25, display: 'Analyzing audio duration...' },
  'audio_split_complete': { progress: 38, display: 'Audio channels separated' },
  'audio_split': { progress: 38, display: 'Audio channels separated' }, // Alias
  'audio_processed': { progress: 45, display: 'Audio files ready for transcription' },

  // === Transcription Phase (45-70%) ===
  'transcription_submitted': { progress: 50, display: 'Transcription started...' },
  'transcription_started': { progress: 55, display: 'Transcribing audio...' },
  'transcription': { progress: 55, display: 'Transcribing audio...' }, // Alias
  'transcription_complete': { progress: 70, display: 'Transcription complete' },

  // === AI Analysis Phase (70-95%) ===
  'ai_analysis_started': { progress: 78, display: 'AI analyzing call...' },
  'ai_analysis': { progress: 85, display: 'AI generating insights...' }, // Alias
  'analysis_complete': { progress: 95, display: 'Saving results...' },
  'saving': { progress: 95, display: 'Saving results...' }, // Alias

  // === Completion (100%) ===
  'completed': { progress: 100, display: 'Complete!' },
  'complete': { progress: 100, display: 'Complete!' }, // Alias

  // === Error States ===
  'error': { progress: 0, display: 'Processing failed' },
  'failed': { progress: 0, display: 'Processing failed' } // Alias
};

// [Removed unused helper processing steps for stepper UI]

export const CallAnalyzer: React.FC<CallAnalyzerProps> = ({ isOpen, onClose, onUploadSuccess }) => {
  const [fileStates, setFileStates] = useState<FileState[]>([]);
  const [manualAgentName, setManualAgentName] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'queued' | 'error' | 'batch-complete'>('idle');
  const [error, setError] = useState<string | null>(null);
  /* Derived state for global progress */
  const globalProgress = fileStates.length > 0
    ? fileStates.reduce((sum, f) => sum + f.progress, 0) / fileStates.length
    : 0;

  /* Derived state for global progress to prevent sync loops */
  const globalAnimatedProgress = fileStates.length > 0
    ? fileStates.reduce((acc, fs) => acc + fs.animatedProgress, 0) / fileStates.length
    : 0;

  const [elapsedTime, setElapsedTime] = useState(0);

  const subscriptionsRef = useRef<{ [key: string]: any }>({});
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const lastTimerUpdateRef = useRef<number>(0);



  // Cleanup on unmount - use removeChannel for proper cleanup
  useEffect(() => {
    return () => {
      Object.values(subscriptionsRef.current).forEach((channel: any) => {
        supabase.removeChannel(channel);
      });
      subscriptionsRef.current = {};
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // Reset state when modal opens - ensures fresh start for each upload session
  useEffect(() => {
    if (isOpen) {
      setFileStates([]);
      setManualAgentName('');
      setStatus('idle');
      setError(null);
      // Global progress and animated progress are derived from fileStates, so resetting fileStates resets them.
      setElapsedTime(0);
      startTimeRef.current = null;
    }

  }, [isOpen]);

  // Animated progress effect - smoothly interpolates between milestones
  useEffect(() => {
    if (status !== 'processing') {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    startTimeRef.current = startTimeRef.current || Date.now();

    const animate = () => {
      const now = Date.now();
      const elapsed = now - (startTimeRef.current || now);

      // Throttle timer updates to prevent excessive renders (every 200ms)
      if (now - lastTimerUpdateRef.current > 200) {
        setElapsedTime(elapsed);
        lastTimerUpdateRef.current = now;
      }


      setFileStates(prev => {
        let totalAnimated = 0;

        const updated = prev.map(fs => {
          if (fs.status === 'completed') {
            totalAnimated += 100;
            return { ...fs, animatedProgress: 100 };
          }
          if (fs.status === 'error') {
            totalAnimated += fs.animatedProgress;
            return fs;
          }

          // Calculate expected progress based on time elapsed (for smooth animation between milestones)
          const fileElapsed = now - (fs.startTime || now);

          // Time-based progress: smooth increment even without milestones
          // Uses a logarithmic curve so it starts fast and slows near 94%
          const timeRatio = fileElapsed / AVERAGE_PROCESSING_TIME_MS;
          const expectedProgress = Math.min(
            // Logarithmic curve: fast start, slow finish
            Math.log10(1 + timeRatio * 9) * 94,
            94 // Never exceed 94% on time-based estimation
          );

          // Target is the higher of: milestone-based progress or time-based progress
          const targetProgress = Math.max(fs.progress, expectedProgress);
          const currentAnimated = fs.animatedProgress;

          // Dynamic easing: faster when difference is large, smooth deceleration when close
          const diff = targetProgress - currentAnimated;
          // Base speed + proportional speed (faster animation, smoother feel)
          const step = diff > 0 ? Math.max(0.08, diff * 0.06) : 0;
          const newAnimated = Math.min(currentAnimated + step, targetProgress);

          totalAnimated += newAnimated;
          return { ...fs, animatedProgress: newAnimated };
        });

        // const avgAnimated = updated.length > 0 ? totalAnimated / updated.length : 0;
        // setGlobalAnimatedProgress(avgAnimated); // Removed: Derived automatically


        return updated;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [status]);

  // Global Realtime Subscription - Single channel for all files
  useEffect(() => {
    if (!isOpen) return;

    // Create a unique channel name to avoid conflicts
    const channelName = `qa-processing-${Date.now()}`;

    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: true },
        presence: { key: '' },
      },
    });

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'processing_jobs',
        },
        (payload) => handleRealtimePayload(payload)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'processing_jobs',
        },
        (payload) => handleRealtimePayload(payload)
      )
      .subscribe((status, err) => {
        console.log(`[Realtime] Subscription status: ${status}`);
        if (err) {
          console.error('[Realtime] Subscription error:', err);
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Channel error, polling fallback will handle updates');
        }
      });

    function handleRealtimePayload(payload: any) {
      const job = payload.new as any;
      if (!job || !job.batch_id) return;

      setFileStates(prev => {
        // Find if any file matches this batch_id
        const relevantFile = prev.find(f => f.batchId === job.batch_id);
        if (!relevantFile) return prev; // Ignore events for files not in our list

        console.log(`[Realtime] Event for batch ${job.batch_id}: ${job.milestone}`);

        return prev.map(f => {
          if (f.batchId !== job.batch_id) return f;

          // Get milestone config
          let config = MILESTONE_CONFIG[job.milestone];
          if (!config) {
            // Try to match partial milestone names
            const milestoneKey = Object.keys(MILESTONE_CONFIG).find(k =>
              k.includes(job.milestone) || job.milestone.includes(k.replace('_started', '').replace('_complete', ''))
            );
            config = milestoneKey ? MILESTONE_CONFIG[milestoneKey] : { progress: f.progress, display: job.milestone };
          }

          // Handle error
          if (job.status === 'error' || job.status === 'failed') {
            return {
              ...f,
              progress: 0,
              status: 'error' as const,
              milestoneDisplay: 'Processing failed',
              milestoneRaw: 'error',
              errorMessage: job.error_message || 'Unknown error occurred'
            };
          }

          // Update progress
          const newProgress = Math.max(config.progress, f.progress);
          const qaResultId = job.qa_result_id ? Number(job.qa_result_id) : undefined;

          return {
            ...f,
            progress: newProgress,
            status: job.status === 'completed' ? 'completed' as const : 'analyzing' as const,
            milestoneDisplay: config.display,
            milestoneRaw: job.milestone,
            qaResultId: qaResultId || f.qaResultId,
            lastUpdateTime: Date.now()
          };
        });
      });
    }

    return () => {
      console.log('[Realtime] Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [isOpen]); // Only re-subscribe if modal opens/closes

  // Progress Aggregation Effect (moved from handleRealtimeEvent)
  useEffect(() => {
    if (fileStates.length === 0) return;

    // Global progress is derived now.
    // const totalProgress = fileStates.reduce((sum, f) => sum + f.progress, 0);
    // const avgProgress = fileStates.length > 0 ? totalProgress / fileStates.length : 0;
    // setGlobalProgress(avgProgress);


    // Check completion/errors
    const updated = fileStates;
    const allDone = updated.every(f => f.status === 'completed' || f.status === 'error' || f.status === 'duplicate');
    const anyError = updated.some(f => f.status === 'error');
    const allDuplicates = updated.every(f => f.status === 'duplicate');

    if (allDone && status === 'processing') {
      if (allDuplicates) {
        setError('All files were already processed within the last 24 hours.');
        setStatus('error');
      } else if (anyError) {
        // Only set error status if we aren't already completed
        // (Logic check: if some error and some complete, what do we show? Usually error invites retry)
        // Keeping simplified logic:
        const errorFile = updated.find(f => f.status === 'error');
        setError(errorFile?.errorMessage || 'One or more files failed to process');
        setStatus('error');
      } else {
        // Success!
        // Trigger fetches for completed files
        const filesToFetch = updated.filter(f => f.status === 'completed' && f.qaResultId && !f.recordingUrl);
        if (filesToFetch.length > 0) {
          Promise.all(
            filesToFetch.map(async (f) => {
              if (!f.qaResultId) return;
              try {
                const { data: qaResult } = await supabase
                  .from('QA Results')
                  .select('recording_url')
                  .eq('id', f.qaResultId)
                  .single();
                if (qaResult?.recording_url) {
                  setFileStates(prev => prev.map(fs =>
                    fs.id === f.id ? { ...fs, recordingUrl: qaResult.recording_url } : fs
                  ));
                }
              } catch (e) { console.error(e); }
            })
          );
        }

        setStatus('batch-complete');
        if (onUploadSuccess) onUploadSuccess();
      }
    }
  }, [fileStates, status, onUploadSuccess]);

  // Backup Polling - Polls database if no realtime update received in 30 seconds
  useEffect(() => {
    if (status !== 'processing') return;

    const pollInterval = setInterval(async () => {
      const now = Date.now();

      for (const file of fileStates) {
        if (file.status !== 'analyzing' || !file.batchId) continue;

        // If no update in 30+ seconds, poll directly
        const timeSinceUpdate = now - (file.lastUpdateTime || file.startTime || now);
        if (timeSinceUpdate > 30000) {
          console.log(`[Polling] No update for ${file.file.name} in ${Math.round(timeSinceUpdate / 1000)}s, checking database...`);

          const { data, error } = await supabase
            .from('processing_jobs')
            .select('*')
            .eq('batch_id', file.batchId)
            .single();

          if (data && !error) {
            console.log('[Polling] Got status:', data.milestone, data.status);

            // Manually update state with polled data
            const config = MILESTONE_CONFIG[data.milestone] || { progress: file.progress, display: data.milestone };

            setFileStates(prev => prev.map(f => {
              if (f.id !== file.id) return f;

              if (data.status === 'error') {
                return {
                  ...f,
                  progress: 0,
                  status: 'error' as const,
                  milestoneDisplay: 'Processing failed',
                  errorMessage: data.error_message || 'Unknown error occurred',
                  lastUpdateTime: now
                };
              }

              return {
                ...f,
                progress: Math.max(config.progress, f.progress),
                status: data.status === 'completed' ? 'completed' as const : 'analyzing' as const,
                milestoneDisplay: config.display,
                milestoneRaw: data.milestone,
                qaResultId: data.qa_result_id ? Number(data.qa_result_id) : f.qaResultId,
                lastUpdateTime: now
              };
            }));
          }
        }
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(pollInterval);
  }, [status, fileStates]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedMap: FileState[] = Array.from(e.target.files).map(f => ({
        file: f,
        id: Math.random().toString(36).substring(7),
        progress: 0,
        animatedProgress: 0,
        status: 'pending',
        estimatedDuration: 0
      }));
      setFileStates(selectedMap);
      setError(null);
    }
  };

  const removeFile = (index: number) => {
    // No need to unsubscribe individually anymore
    setFileStates(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFile = async (fileState: FileState) => {
    try {
      const now = Date.now();
      setFileStates(prev => prev.map(f => f.id === fileState.id ? {
        ...f,
        status: 'analyzing',
        progress: 2,
        animatedProgress: 2,
        startTime: now
      } : f));

      const formData = new FormData();
      formData.append('data', fileState.file);
      formData.append('upload_source', 'manual'); // Explicitly mark as manual upload from UI
      if (manualAgentName) formData.append('agent_name', manualAgentName);

      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        body: formData,
      });

      let data;
      const responseText = await res.text();

      try {
        data = JSON.parse(responseText);
      } catch {
        // If response isn't JSON, it's likely an error page or invalid response
        console.error('Webhook response (not JSON):', responseText.substring(0, 500));
        throw new Error(`Webhook returned invalid response (not JSON). Status: ${res.status}. Check if the webhook URL is correct.`);
      }

      // Handle proxy wrapper response - proxy returns { success, status, data }
      // Unwrap to get the actual n8n response
      if (data.data && typeof data.data === 'object') {
        data = data.data;
      }

      if (!res.ok || data.status === 'error') {
        throw new Error(data.message || data.error || `Upload failed with status ${res.status}`);
      }

      // Handle duplicate file detection
      if (data.status === 'duplicate') {
        setFileStates(prev => prev.map(f =>
          f.id === fileState.id ? {
            ...f,
            status: 'duplicate' as const,
            progress: 100,
            animatedProgress: 100,
            errorMessage: `Already processed (${data.existing_batch_id || 'unknown batch'})`
          } : f
        ));
        return; // Don't throw error, just mark as duplicate
      }

      const { batch_id } = data;
      if (!batch_id) throw new Error('No batch_id returned from webhook. Response: ' + JSON.stringify(data).substring(0, 200));

      setFileStates(prev => prev.map(f =>
        f.id === fileState.id ? { ...f, batchId: batch_id, progress: 5, animatedProgress: 5 } : f
      ));

      // subscribeToProgress(batch_id, fileState.id); // HANDLED GLOBALLY NOW

    } catch (err: any) {
      console.error('Upload Error:', err);
      setFileStates(prev => {
        const updated = prev.map(f => f.id === fileState.id ? {
          ...f,
          status: 'error' as const,
          progress: 0,
          errorMessage: err.message || 'Upload failed'
        } : f);

        const allErrored = updated.every(f => f.status === 'error');
        if (allErrored) {
          setError(err.message || 'All uploads failed');
          setStatus('error');
        }
        return updated;
      });
    }
  };

  const handleStartAnalysis = async () => {
    if (fileStates.length === 0) return;
    setStatus('processing');
    startTimeRef.current = Date.now();

    const pending = fileStates.filter(f => f.status === 'pending');
    await Promise.all(pending.map(f => uploadFile(f)));
  };

  const cancelAnalysis = () => {
    Object.values(subscriptionsRef.current).forEach((sub: any) => sub.unsubscribe());
    subscriptionsRef.current = {};
    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    setStatus('idle');
    setFileStates([]);
    setElapsedTime(0);
    setError(null);
    startTimeRef.current = null;
  };


  const processAudio = async () => {
    if (fileStates.length === 0) return;

    if (fileStates.length > 20) {
      setError("Please upload a maximum of 20 recordings per batch.");
      setStatus('error');
      return;
    }

    const oversizedFile = fileStates.find(fs => fs.file.size > MAX_FILE_SIZE_MB * 1024 * 1024);
    if (oversizedFile) {
      setError(`"${oversizedFile.file.name}" exceeds ${MAX_FILE_SIZE_MB}MB limit.`);
      setStatus('error');
      return;
    }

    setStatus('processing');
    setError(null);
    await handleStartAnalysis();
  };

  const handleRetry = () => {
    setStatus('idle');
    setError(null);
    setFileStates([]);
    setElapsedTime(0);
    startTimeRef.current = null;
  };


  // Format time helper
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Estimated time remaining - based on average processing time with smoothing
  const lastEstimateRef = useRef<number>(AVERAGE_PROCESSING_TIME_MS); // Start with average (3 minutes)

  const getEstimatedRemaining = () => {
    // Early phase: just show the average
    if (globalAnimatedProgress <= 5 || elapsedTime < 5000) {
      lastEstimateRef.current = AVERAGE_PROCESSING_TIME_MS;
      return '~3:00';
    }

    // Primary estimate: average processing time minus elapsed
    // This is more reliable than extrapolating from animated progress
    const avgBasedRemaining = Math.max(0, AVERAGE_PROCESSING_TIME_MS - elapsedTime);

    // Secondary: progress-based estimate (less reliable due to animation)
    const progressRatio = Math.max(globalAnimatedProgress / 100, 0.01);
    const progressBasedTotal = elapsedTime / progressRatio;
    const progressBasedRemaining = Math.max(0, progressBasedTotal - elapsedTime);

    // Blend: favor avg-based early, shift to progress-based as we get more data
    const progressWeight = Math.min(globalAnimatedProgress / 80, 0.6); // Max 60% weight to progress
    const blendedRemaining = avgBasedRemaining * (1 - progressWeight) + progressBasedRemaining * progressWeight;

    // Apply minimum floor: never show less than 30 seconds until 90%+ progress
    const minFloor = globalAnimatedProgress >= 90 ? 10000 : 30000;
    const flooredRemaining = Math.max(blendedRemaining, minFloor);

    // Smooth: only decrease (or slow increase on stall)
    const currentEstimate = lastEstimateRef.current;
    let smoothedRemaining: number;

    if (flooredRemaining < currentEstimate) {
      smoothedRemaining = flooredRemaining;
    } else if (flooredRemaining > currentEstimate + 15000) {
      smoothedRemaining = currentEstimate + 3000; // Slow increase on stall
    } else {
      smoothedRemaining = currentEstimate;
    }

    lastEstimateRef.current = smoothedRemaining;
    return `~${formatTime(smoothedRemaining)}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={status !== 'processing' ? onClose : undefined}
      />

      <div className="relative w-full max-w-lg bg-[#120b1e] rounded-3xl shadow-2xl overflow-hidden border border-white/5 text-white animate-in fade-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-white/5 bg-black">
          <div className="flex items-center gap-3">
            <div className="scale-75 origin-left">
              <PitchVisionLogo />
            </div>
          </div>
          <button
            onClick={status === 'processing' ? cancelAnalysis : onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
            title={status === 'processing' ? "Cancel Analysis" : "Close"}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-8 max-h-[70vh] overflow-y-auto">

          {status === 'processing' ? (
            <div className="py-8 relative min-h-[400px] flex flex-col justify-center">

              {/* Glowing Background Orb */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-600/20 rounded-full blur-[80px] animate-pulse" />

              {/* Main Content Container */}
              <div className="relative z-10 space-y-8">

                {/* Header Section */}
                <div>
                  <div className="flex justify-between items-end mb-4 px-1">
                    <h3 className="text-xl font-bold text-white tracking-wide">Audio Processing Queue</h3>
                    <span className="text-2xl font-mono text-emerald-300 font-bold">{Math.round(globalAnimatedProgress)}%</span>
                  </div>

                  {/* Main Large Progress Bar */}
                  <div className="relative h-4 bg-gray-900 rounded-full overflow-hidden shadow-inner border border-white/5">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
                    <div
                      className="h-full bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all duration-300 ease-out"
                      style={{ width: `${globalAnimatedProgress}%` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="flex justify-between mt-3 px-1 text-xs font-bold tracking-wider text-slate-400 uppercase">
                    <span>{fileStates.length} ITEMS • ELAPSED: {formatTime(elapsedTime)}</span>
                    <span>EST: {getEstimatedRemaining()} REMAINING</span>
                  </div>
                </div>

                {/* File List / Active Item */}
                <div className="space-y-3">
                  {fileStates.map((fs) => (
                    <div key={fs.id} className="relative group">
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200" />
                      <div className="relative bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex items-center justify-between">

                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                          <span className="font-medium text-slate-200 truncate max-w-[200px]">{fs.file.name}</span>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <Loader2 size={16} className="text-emerald-400 animate-spin" />
                          {fs.status === 'error' ? (
                            <span className="text-sm font-bold text-rose-400 group-hover:text-rose-300 transition-colors" title={fs.errorMessage}>
                              {fs.errorMessage || 'Processing failed'}
                            </span>
                          ) : (
                            <span className="text-sm font-bold text-emerald-300 animate-pulse">
                              {fs.milestoneDisplay || 'Analyzing...'}
                            </span>
                          )}
                        </div>

                        {/* Bottom edge progress for item */}
                        <div className="absolute bottom-0 left-0 h-[2px] bg-emerald-500/50 transition-all duration-300" style={{ width: `${fs.animatedProgress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer Text */}
                <div className="text-center space-y-2 pt-8">
                  <p className="text-[10px] font-black tracking-[0.2em] text-slate-400 uppercase animate-pulse">
                    Handshaking with Pitch Vision Neural Core...
                  </p>
                  <p className="text-xs text-slate-500">Listening for database updates...</p>
                </div>

              </div>

              {/* Cancel Button */}
              <div className="absolute top-0 right-0">
                <button
                  onClick={cancelAnalysis}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 text-xs text-slate-400 transition-colors"
                >
                  <div className="w-4 h-4 rounded-full border border-slate-500 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-sm bg-slate-500" />
                  </div>
                  Cancel
                </button>
              </div>

            </div>
          ) : status === 'success' || status === 'batch-complete' ? (
            <div className="py-10 text-center animate-in zoom-in-95 min-h-[300px] flex flex-col justify-center">
              <div className="relative h-20 w-20 mx-auto mb-6">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse" />
                <div className="relative h-full w-full bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                  <CheckCircle2 size={40} className="text-emerald-400" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Analysis Complete</h3>
              <p className="text-emerald-300/80 text-sm font-medium">Successfully processed {fileStates.length} recording{fileStates.length !== 1 ? 's' : ''}</p>
              <p className="text-slate-400 text-xs mt-1 mb-6">Total time: {formatTime(elapsedTime)}</p>

              {/* Action Buttons */}
              <div className="flex gap-3 justify-center">
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl hover:from-emerald-400 hover:to-teal-400 transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-2"
                >
                  <CheckCircle2 size={16} />
                  Review Analysis
                </button>
                <button
                  onClick={handleRetry}
                  className="px-5 py-2.5 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 transition-colors flex items-center gap-2"
                >
                  <RotateCcw size={14} />
                  Upload More
                </button>
              </div>

              {/* Auto-close hint */}
              <p className="text-slate-500 text-[10px] mt-4 font-medium">
                Window will close automatically in a few seconds
              </p>
            </div>
          ) : status === 'error' ? (
            <div className="py-12 text-center animate-in zoom-in-95 min-h-[300px] flex flex-col justify-center">
              <div className="relative h-24 w-24 mx-auto mb-8">
                <div className="absolute inset-0 bg-rose-500/20 rounded-full blur-xl animate-pulse" />
                <div className="relative h-full w-full bg-rose-500/10 rounded-full flex items-center justify-center border border-rose-500/30 shadow-[0_0_30px_rgba(244,63,94,0.2)]">
                  <AlertTriangle size={48} className="text-rose-500" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Analysis Failed</h3>
              <p className="text-slate-300 text-sm max-w-xs mx-auto mb-6">{error}</p>

              <button
                onClick={handleRetry}
                className="px-6 py-2.5 bg-white text-black font-bold rounded-xl hover:bg-slate-200 transition-colors flex items-center gap-2 mx-auto"
              >
                <RotateCcw size={16} /> Try Again
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div
                className="border-2 border-dashed border-white/10 rounded-2xl p-10 text-center hover:border-purple-500 hover:bg-purple-500/5 cursor-pointer transition-all group bg-black/20"
                onClick={() => document.getElementById('file-up')?.click()}
              >
                <input
                  id="file-up"
                  type="file"
                  accept="audio/*"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />

                <div className="h-16 w-16 bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform shadow-inner border border-purple-500/20">
                  {fileStates.length > 1 ? <Files size={28} className="text-purple-300" /> : <Upload size={28} className="text-purple-300" />}
                </div>

                <h3 className="font-bold text-white text-lg">
                  {fileStates.length === 0
                    ? 'Upload Call Recordings'
                    : fileStates.length === 1
                      ? fileStates[0].file.name
                      : `${fileStates.length} files selected`}
                </h3>
                <p className="text-xs text-slate-400 mt-2 font-medium">
                  Supports MP3, WAV, WEBM (Max {MAX_FILE_SIZE_MB}MB per file)
                </p>
                {fileStates.length === 0 && (
                  <p className="text-xs text-purple-300 mt-2 font-semibold">
                    Select multiple files for bulk upload
                  </p>
                )}
              </div>

              {fileStates.length > 0 && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                  <div className={`space-y-2 ${fileStates.length > 3 ? 'max-h-40 overflow-y-auto pr-2' : ''}`}>
                    {fileStates.map((fs, index) => (
                      <div key={fs.id} className="flex items-center gap-3 bg-white/5 p-3 rounded-lg border border-white/10">
                        <FileAudio size={18} className="text-purple-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{fs.file.name}</p>
                          <p className="text-xs text-slate-400">{(fs.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                          className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-white shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {fileStates.length > 3 && (
                    <div className="text-center">
                      <span className="text-xs text-purple-300 font-bold bg-purple-500/20 px-3 py-1 rounded-full">
                        {fileStates.length} files • {(fileStates.reduce((acc, fs) => acc + fs.file.size, 0) / (1024 * 1024)).toFixed(1)} MB total
                      </span>
                    </div>
                  )}

                  <div className="bg-black/40 border border-white/10 rounded-xl p-1 flex items-center gap-2 focus-within:border-purple-500/50 transition-colors">
                    <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <User size={14} className="text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={manualAgentName}
                      onChange={(e) => setManualAgentName(e.target.value)}
                      placeholder="Enter Agent Name (Optional)"
                      className="bg-transparent text-sm text-white placeholder:text-slate-500 outline-none w-full font-medium"
                    />
                  </div>
                </div>
              )}

              {fileStates.length > 0 && (
                <button
                  onClick={processAudio}
                  className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-purple-900/50 hover:shadow-purple-700/50 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Zap size={18} fill="currentColor" />
                  {fileStates.length === 1 ? 'Run Compliance Scan' : `Scan ${fileStates.length} Recordings`}
                </button>
              )}
            </div>
          )}

          <div className="px-8 py-4 bg-black/60 border-t border-white/5 flex justify-center backdrop-blur-md">
            <p className="text-[10px] text-slate-400 font-bold tracking-wide flex items-center gap-1.5 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Powered by Pitch Vision AI
            </p>
          </div>

        </div>
      </div>

      {/* CSS for shimmer animation */}
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
};