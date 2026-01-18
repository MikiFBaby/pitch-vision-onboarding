"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Upload, X, CheckCircle2, Zap, AlertTriangle, FileAudio, User, RotateCcw, Files, Loader2, StopCircle } from 'lucide-react';
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
  id: string; // generated ID to track
  progress: number; // 0-100
  status: 'pending' | 'analyzing' | 'completed' | 'error';
  estimatedDuration: number; // seconds
}

const WEBHOOK_URL = 'https://n8n.pitchvision.io/webhook/UIDrop';
const MAX_FILE_SIZE_MB = 250;

const LOADING_STATEMENTS = [
  "Securely uploading audio stream...",
  "Handshaking with Pitch Vision Neural Core...",
  "Running deep-speech transcription...",
  "Analyzing sentiment and tonal vectors...",
  "Cross-referencing compliance checklists...",
  "Generating coaching insights...",
  "Waiting for analysis engine response...",
  "Processing large dataset (please wait)...",
  "Still working... extensive analysis in progress...",
  "Syncing with database...",
  "Almost there... finalizing results..."
];

export const CallAnalyzer: React.FC<CallAnalyzerProps> = ({ isOpen, onClose, onUploadSuccess }) => {
  // Multi-file state
  const [fileStates, setFileStates] = useState<FileState[]>([]);
  const [manualAgentName, setManualAgentName] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'queued' | 'error' | 'batch-complete'>('idle');
  const [error, setError] = useState<string | null>(null);

  // For UI troubleshooting msg
  const [isCorsError, setIsCorsError] = useState(false);

  // Global Progress tracking (Aggregate)
  const [globalProgress, setGlobalProgress] = useState(0);
  const [statementIndex, setStatementIndex] = useState(0);

  const statementInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressIntervals = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const abortController = useRef<AbortController | null>(null);

  // Statement Rotation
  useEffect(() => {
    if (status === 'processing') {
      statementInterval.current = setInterval(() => {
        setStatementIndex((prev) => (prev + 1) % LOADING_STATEMENTS.length);
      }, 4000);
    } else {
      if (statementInterval.current) clearInterval(statementInterval.current);
    }
    return () => {
      if (statementInterval.current) clearInterval(statementInterval.current);
    };
  }, [status]);

  // Clean up intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(progressIntervals.current).forEach(clearInterval);
      if (statementInterval.current) clearInterval(statementInterval.current);
    };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedMap: FileState[] = Array.from(e.target.files).map(f => ({
        file: f,
        id: Math.random().toString(36).substring(7),
        progress: 0,
        status: 'pending',
        // Estimate: 10s base + 30s per MB
        estimatedDuration: 10 + (f.size / (1024 * 1024)) * 30
      }));
      setFileStates(selectedMap);
      setError(null);
    }
  };

  const removeFile = (index: number) => {
    setFileStates(prev => prev.filter((_, i) => i !== index));
  };

  const startSimulatedProgress = (fileId: string, durationSec: number) => {
    if (progressIntervals.current[fileId]) return;

    const updateFreq = 100;
    const totalSteps = (durationSec * 1000) / updateFreq;
    const increment = 90 / totalSteps;

    progressIntervals.current[fileId] = setInterval(() => {
      setFileStates(prev => prev.map(fs => {
        if (fs.id !== fileId) return fs;
        const next = fs.progress + increment;
        return {
          ...fs,
          progress: next >= 90 ? 90 : next, // Cap at 90% until complete
          status: 'analyzing'
        };
      }));
    }, updateFreq);
  };

  const completeFile = (index: number) => {
    setFileStates(prev => {
      const newState = [...prev];
      if (newState[index]) {
        // Clear interval
        const id = newState[index].id;
        if (progressIntervals.current[id]) {
          clearInterval(progressIntervals.current[id]);
          delete progressIntervals.current[id];
        }
        newState[index] = { ...newState[index], progress: 100, status: 'completed' };
      }
      return newState;
    });
  };

  const cancelAnalysis = () => {
    if (abortController.current) {
      abortController.current.abort();
    }
    // Cleanup
    Object.values(progressIntervals.current).forEach(clearInterval);
    progressIntervals.current = {};

    setStatus('idle');
    setFileStates([]);
    setGlobalProgress(0);
  };

  const analyzeWithWebhook = async (states: FileState[]): Promise<{ success: boolean; queued: boolean }> => {
    console.log("=== UPLOADING BATCH TO N8N ===");

    // Start simulations for ALL files immediately (Concurrent UI)
    states.forEach(state => startSimulatedProgress(state.id, state.estimatedDuration));

    abortController.current = new AbortController();
    const filesToUpload = states.map(s => s.file);
    const totalFiles = filesToUpload.length;
    const MAX_WAIT = 10 * 60 * 1000;

    return new Promise(async (resolve, reject) => {
      let done = false;
      let completedCount = 0;
      let pollingTimer: ReturnType<typeof setInterval>;
      const startTime = new Date().toISOString();
      let subscription: ReturnType<typeof supabase.channel>;
      let timeoutTimer: ReturnType<typeof setTimeout>;

      const cleanup = () => {
        if (subscription) supabase.removeChannel(subscription);
        clearTimeout(timeoutTimer);
        if (pollingTimer) clearInterval(pollingTimer);
        Object.values(progressIntervals.current).forEach(clearInterval);
      };

      abortController.current?.signal.addEventListener('abort', () => {
        if (!done) {
          done = true;
          cleanup();
          reject(new Error("Analysis cancelled by user"));
        }
      });

      const checkCompletion = (newRecord?: any) => {
        if (done) return;

        if (!newRecord) {
          // Polling check logic (handled below)
        } else {
          // Realtime
          console.log("🎉 Realtime Insert Detected:", newRecord.id);
          // Mark the next available pending/analyzing file as complete
          completeFile(completedCount);
          completedCount++;
        }

        // Update global progress
        setGlobalProgress((completedCount / totalFiles) * 100);

        if (completedCount >= totalFiles) {
          done = true;
          cleanup();
          resolve({ success: true, queued: false });
        }
      };

      const fail = (errorStr: string) => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error(errorStr));
      };

      // 1. Start Subscription
      subscription = supabase
        .channel('qa-batch-' + Date.now())
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public' },
          (payload) => {
            // Check table name loosely
            if (payload.table === 'Pitch Perfect' || payload.table === 'pitch perfect') {
              checkCompletion(payload.new);
            }
          }
        )
        .subscribe();

      // 2. Start Polling Fallback 
      pollingTimer = setInterval(async () => {
        if (done) return;
        try {
          const { count, error } = await supabase
            .from('Pitch Perfect')
            .select('*', { count: 'exact', head: true })
            .gt('created_at', startTime);

          if (!error && count !== null) {
            // If polling finds more rows than we have locally tracked, catch up
            if (count > completedCount) {
              for (let i = completedCount; i < count; i++) {
                // Ensure we don't overflow
                if (i < totalFiles) completeFile(i);
              }
              completedCount = count;
              setGlobalProgress((completedCount / totalFiles) * 100);
            }
            if (count >= totalFiles) {
              checkCompletion();
            }
          }
        } catch (e) { console.error(e); }
      }, 5000);

      // 3. Timeout
      timeoutTimer = setTimeout(() => {
        if (completedCount > 0) {
          done = true;
          cleanup();
          resolve({ success: true, queued: true });
        } else {
          fail("Analysis timed out.");
        }
      }, MAX_WAIT);

      // 4. Upload
      const formData = new FormData();
      filesToUpload.forEach(f => formData.append('file', f));
      formData.append('upload_type', 'manual');
      if (manualAgentName) formData.append('agent_name', manualAgentName);

      try {
        const response = await fetch(WEBHOOK_URL, {
          method: 'POST',
          body: formData,
          signal: abortController.current?.signal
        });

        if (response.ok) {
          // Wait for DB events
        } else {
          fail(`Analysis failed: ${response.status}`);
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          if (e.message.includes('fetch')) setIsCorsError(true);
          fail("Network failed.");
        }
      }
    });
  };

  const processAudio = async () => {
    if (fileStates.length === 0) return;

    if (fileStates.length > 5) {
      setError("Please upload a maximum of 5 files.");
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
    setIsCorsError(false);

    try {
      await analyzeWithWebhook(fileStates);

      // All done
      setStatus('batch-complete');
      setTimeout(() => {
        if (onUploadSuccess) onUploadSuccess();
        setTimeout(() => {
          onClose();
          // Clean reset
          setStatus('idle');
          setFileStates([]);
          setGlobalProgress(0);
        }, 2000);
      }, 1000);

    } catch (err: any) {
      if (err.message === "Analysis cancelled by user") {
        // reset handled in cancel func
      } else {
        setError(err.message || 'Analysis failed');
        setStatus('error');
      }
    }
  };

  const handleRetry = () => {
    setStatus('idle');
    setError(null);
    setFileStates([]);
    setGlobalProgress(0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#0F0720]/80 backdrop-blur-md transition-opacity"
        onClick={status !== 'processing' ? onClose : undefined}
      />

      <div className="relative w-full max-w-lg bg-[#1a0b2e] rounded-3xl shadow-2xl overflow-hidden border border-purple-500/30 text-white animate-in fade-in zoom-in-95 duration-300">

        <div className="flex justify-between items-center p-6 border-b border-white/5 bg-[#2E1065]/50">
          <div className="flex items-center gap-3">
            <div className="scale-75 origin-left">
              <PitchVisionLogo />
            </div>
          </div>
          {status !== 'processing' && (
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
          )}
        </div>

        <div className="p-8 max-h-[70vh] overflow-y-auto">
          {status === 'processing' ? (
            <div className="py-4 text-center relative overflow-hidden min-h-[300px] flex flex-col justify-center">

              <div className="flex flex-col items-center relative z-10 w-full px-4">
                {/* Cancel Button - Top Right of Processing Area */}
                <div className="absolute -top-4 right-0">
                  <button
                    onClick={cancelAnalysis}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-full text-[11px] font-medium transition-all group backdrop-blur-sm border border-transparent hover:border-white/10"
                  >
                    <StopCircle size={14} className="group-hover:text-red-400 transition-colors" />
                    <span>Cancel</span>
                  </button>
                </div>

                <div className="w-full space-y-3 mb-8 mt-6">
                  <div className="flex justify-between items-end px-1">
                    <span className="text-sm font-bold text-white">Audio Processing Queue</span>
                    <span className="text-sm font-mono text-purple-300">{Math.round(globalProgress)}%</span>
                  </div>

                  {/* Glassy Progress Bar Track */}
                  <div className="h-4 w-full bg-black/40 rounded-full overflow-hidden border border-white/5 relative shadow-inner">
                    {/* Gradient Progress Fill */}
                    <div
                      className="h-full bg-gradient-to-r from-purple-600 via-indigo-500 to-purple-400 relative transition-all duration-700 ease-out shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                      style={{ width: `${globalProgress}%` }}
                    >
                      {/* Shimmer Effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full -translate-x-full animate-[shimmer_2s_infinite]" />
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-slate-500 font-medium px-1 uppercase tracking-wider">
                    <span>{fileStates.length} ITEMS</span>
                    <span>PROCESSING BATCH...</span>
                  </div>
                </div>

                <div className="w-full bg-[#0A0510]/50 backdrop-blur-sm rounded-xl border border-white/5 p-3 flex flex-col gap-3 shadow-2xl max-h-[300px] overflow-y-auto custom-scrollbar">
                  {fileStates.map((fs, index) => {
                    const isDone = fs.status === 'completed';
                    const isProcessing = fs.status === 'analyzing';

                    return (
                      <div
                        key={fs.id}
                        style={{ animationDelay: `${index * 100}ms` }}
                        className={`relative overflow-hidden rounded-xl transition-all duration-500 border group
                                      ${isDone
                            ? 'border-emerald-500/40 bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                            : 'border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-transparent'
                          } animate-in fade-in slide-in-from-bottom-2 fill-mode-forwards`}
                      >
                        {/* Main Content Row */}
                        <div className="flex items-center justify-between gap-4 px-4 pt-4 pb-3">
                          {/* Left: Icon & Name */}
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-300 
                                            ${isDone ? 'bg-emerald-500/30 border border-emerald-500/50' : 'bg-purple-500/20 border border-purple-500/30'}`}>
                              {isDone ? (
                                <CheckCircle2 size={18} className="text-emerald-400" />
                              ) : isProcessing ? (
                                <FileAudio size={18} className="text-purple-300 animate-pulse" />
                              ) : (
                                <FileAudio size={18} className="text-slate-400" />
                              )}
                            </div>

                            <div className="flex flex-col min-w-0 gap-0.5">
                              <span className={`truncate text-sm font-semibold transition-colors duration-300 ${isDone ? 'text-white' : 'text-white/90'}`}>
                                {fs.file.name}
                              </span>
                              <span className={`text-xs font-medium ${isDone ? 'text-emerald-400' : isProcessing ? 'text-purple-300' : 'text-slate-400'}`}>
                                {isDone ? '✓ Ready for review' : isProcessing ? `Analyzing audio... ${Math.round(fs.progress)}%` : 'In queue'}
                              </span>
                            </div>
                          </div>

                          {/* Right: Status Indicator */}
                          <div className="shrink-0 flex items-center justify-center w-8">
                            {isDone ? (
                              <div className="w-6 h-6 rounded-full bg-emerald-500/30 flex items-center justify-center">
                                <CheckCircle2 size={14} className="text-emerald-400" />
                              </div>
                            ) : isProcessing ? (
                              <div className="flex gap-[3px] items-end h-4">
                                <div className="w-1 bg-purple-400 rounded-full h-full animate-[music-bar_1s_ease-in-out_infinite]" />
                                <div className="w-1 bg-purple-400 rounded-full h-2/3 animate-[music-bar_1.2s_ease-in-out_infinite_0.1s]" />
                                <div className="w-1 bg-purple-400 rounded-full h-full animate-[music-bar_0.8s_ease-in-out_infinite_0.2s]" />
                              </div>
                            ) : (
                              <div className="w-2 h-2 rounded-full bg-slate-600" />
                            )}
                          </div>
                        </div>

                        {/* Progress Bar Row - Only for processing items */}
                        {isProcessing && (
                          <div className="px-4 pb-3">
                            <div className="w-full h-1.5 bg-purple-950/50 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-purple-500 via-fuchsia-400 to-purple-500 rounded-full shadow-[0_0_8px_rgba(168,85,247,0.6)] transition-all duration-300 ease-out"
                                style={{ width: `${fs.progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="mt-8 text-center space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.25em] animate-pulse">
                    {LOADING_STATEMENTS[statementIndex]}
                  </p>
                  <p className="text-[9px] text-slate-600">Listening for database updates...</p>
                </div>

              </div>

              {/* Background ambient glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-purple-600/5 rounded-full blur-[80px] pointer-events-none" />

            </div>
          ) : status === 'success' || status === 'batch-complete' ? (
            <div className="py-12 text-center animate-in zoom-in-95 min-h-[300px] flex flex-col justify-center">
              <div className="relative h-24 w-24 mx-auto mb-8">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse" />
                <div className="relative h-full w-full bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                  <CheckCircle2 size={48} className="text-emerald-500" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Analysis Complete</h3>
              <p className="text-emerald-300/80 text-sm font-medium">Successfully processed {fileStates.length} recordings</p>
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
              <p className="text-slate-400 text-sm max-w-xs mx-auto mb-6">{error}</p>
              {isCorsError && (
                <div className="mb-6 bg-black/30 p-4 rounded-xl border border-white/5 text-left text-xs text-slate-400 font-mono">
                  <p className="text-emerald-400 font-bold mb-2">Troubleshooting:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>File too large? Try a smaller file (under {MAX_FILE_SIZE_MB}MB).</li>
                    <li>The server took too long to respond.</li>
                    <li>Your network blocked the connection.</li>
                  </ul>
                </div>
              )}
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
                className="border-2 border-dashed border-purple-500/30 rounded-2xl p-10 text-center hover:border-purple-500 hover:bg-purple-500/5 cursor-pointer transition-all group bg-[#0F0720]"
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

                <div className="h-16 w-16 bg-purple-900/50 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform shadow-inner border border-purple-500/20">
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
                  <p className="text-xs text-purple-400 mt-2 font-semibold">
                    Select multiple files for bulk upload
                  </p>
                )}
              </div>

              {fileStates.length > 0 && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                  {/* File list with scroll for many files */}
                  <div className={`space-y-2 ${fileStates.length > 3 ? 'max-h-40 overflow-y-auto pr-2' : ''}`}>
                    {fileStates.map((fs, index) => (
                      <div key={fs.id} className="flex items-center gap-3 bg-purple-900/20 p-3 rounded-lg border border-purple-500/20">
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

                  {/* File count summary for many files */}
                  {fileStates.length > 3 && (
                    <div className="text-center">
                      <span className="text-xs text-purple-300 font-bold bg-purple-500/20 px-3 py-1 rounded-full">
                        {fileStates.length} files • {(fileStates.reduce((acc, fs) => acc + fs.file.size, 0) / (1024 * 1024)).toFixed(1)} MB total
                      </span>
                    </div>
                  )}

                  {/* Optional agent name */}
                  <div className="bg-[#0F0720] border border-white/10 rounded-xl p-1 flex items-center gap-2 focus-within:border-purple-500/50 transition-colors">
                    <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <User size={14} className="text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={manualAgentName}
                      onChange={(e) => setManualAgentName(e.target.value)}
                      placeholder="Enter Agent Name (Optional)"
                      className="bg-transparent text-sm text-white placeholder:text-slate-600 outline-none w-full font-medium"
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
        </div>

        <div className="px-8 py-4 bg-[#0F0720] border-t border-white/5 flex justify-center">
          <p className="text-[10px] text-slate-500 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Powered by Pitch Vision AI
          </p>
        </div>

      </div>
    </div>
  );
};