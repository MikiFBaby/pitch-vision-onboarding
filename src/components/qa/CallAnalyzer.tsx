"use client";

// Version: 1.1.3 - Concurrent UI (All Processors Active)
import React, { useState, useEffect, useRef } from 'react';
import { Upload, X, CheckCircle2, Zap, AlertTriangle, FileAudio, Aperture, User, RotateCcw, Files, Loader2, StopCircle } from 'lucide-react';
import { CallData } from '@/types/qa-types';
import { supabase } from '@/lib/supabase-client';
import { PitchVisionLogo } from '@/components/ui/pitch-vision-logo';

interface CallAnalyzerProps {
  isOpen: boolean;
  onClose: () => void;
  onAnalysisComplete: (data: CallData) => void;
  onUploadSuccess?: () => void;
}

interface BatchResult {
  fileName: string;
  success: boolean;
  error?: string;
}

const WEBHOOK_URL = 'https://sailient.app.n8n.cloud/webhook/UIDrop';
// Support large call recordings
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

export const CallAnalyzer: React.FC<CallAnalyzerProps> = ({ isOpen, onClose, onAnalysisComplete, onUploadSuccess }) => {
  // Multi-file state
  const [files, setFiles] = useState<File[]>([]);
  const [manualAgentName, setManualAgentName] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'queued' | 'error' | 'batch-complete'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isCorsError, setIsCorsError] = useState(false);

  // Progress tracking
  const [processedCount, setProcessedCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [estimatedSeconds, setEstimatedSeconds] = useState(0);
  const [statementIndex, setStatementIndex] = useState(0);

  const statementInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
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

  // Dynamic Progress Bar Logic
  useEffect(() => {
    if (status === 'processing' && files.length > 0) {
      // Calculate total size in MB
      const totalSizeMB = files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024);

      // Estimation Formula: 
      // Base overhead (connection/handshake): 10s (was 2s)
      // Upload speed assumption: ~30s per MB (was 5s)
      // This slows down the bar significantly as requested.
      const durationMs = 10000 + (totalSizeMB * 30000);
      setEstimatedSeconds(Math.ceil(durationMs / 1000));

      const updateFrequency = 100; // update every 100ms
      const incrementPerStep = 90 / (durationMs / updateFrequency); // Target 90% over duration

      if (progressInterval.current) clearInterval(progressInterval.current);

      progressInterval.current = setInterval(() => {
        setProgress(prev => {
          const next = prev + incrementPerStep;
          // Cap at 95% until actual completion
          return next >= 95 ? 95 : next;
        });
      }, updateFrequency);
    } else {
      if (progressInterval.current) clearInterval(progressInterval.current);
    }

    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [status, files]);

  if (!isOpen) return null;

  const analyzeWithWebhook = async (filesToUpload: File[]): Promise<{ success: boolean; queued: boolean }> => {
    console.log("=== UPLOADING BATCH TO N8N ===");
    console.log(`Files (${filesToUpload.length}):`, filesToUpload.map(f => `${f.name} (${f.size}b)`).join(', '));

    // Reset counters
    setProcessedCount(0);
    setProgress(0);
    abortController.current = new AbortController();

    const totalFiles = filesToUpload.length;
    const MAX_WAIT = 10 * 60 * 1000; // 10 minutes total for batch

    return new Promise(async (resolve, reject) => {
      let done = false;
      let completed = 0;
      let pollingTimer: ReturnType<typeof setInterval>;
      const startTime = new Date().toISOString();
      let subscription: ReturnType<typeof supabase.channel>;
      let timeoutTimer: ReturnType<typeof setTimeout>;

      // Cleanup helper
      const cleanup = () => {
        if (subscription) supabase.removeChannel(subscription);
        clearTimeout(timeoutTimer);
        if (pollingTimer) clearInterval(pollingTimer);
      };

      // Support Cancel
      abortController.current?.signal.addEventListener('abort', () => {
        if (!done) {
          done = true;
          cleanup();
          reject(new Error("Analysis cancelled by user"));
        }
      });

      // Success Handler for Realtime & Polling
      const checkCompletion = (newRecord?: any) => {
        if (done) return;

        // Count completion - For simplicity in batch, if we find enough new records, we are done
        // Polling will return the Total count of new records
        if (!newRecord) {
          // Called from Polling (count check)
          completed = totalFiles; // Assume if we found enough rows, we are done
        } else {
          // Called from Realtime
          console.log("🎉 Realtime Insert Detected:", newRecord.id);
          completed++;
        }

        setProcessedCount(completed);

        if (completed >= totalFiles) {
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

      // 1. Start Subscription - Broadened for Debugging
      subscription = supabase
        .channel('qa-batch-' + Date.now())
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public' }, // Listen to everything in public
          (payload) => {
            console.log("🔔 Realtime Event Received:", payload);
            console.log("Payload Table:", payload.table);

            // Check if it's our table (handling potential casing/quoting issues)
            if (payload.table === 'Pitch Perfect' || payload.table === 'pitch perfect') {
              checkCompletion(payload.new);
            }
          }
        )
        .subscribe((status) => {
          console.log("Realtime subscription status:", status);
          if (status === 'SUBSCRIBED') {
            console.log("✅ Successfully subscribed to public schema changes");
          }
        });

      // 2. Start Polling Fallback (Every 3s)
      pollingTimer = setInterval(async () => {
        if (done) return;
        try {
          // Count rows created AFTER we started this upload
          const { count, error } = await supabase
            .from('Pitch Perfect')
            .select('*', { count: 'exact', head: true })
            .gt('created_at', startTime);

          if (error) {
            console.error("Polling error:", error);
            return;
          }

          console.log(`Polling Check: Found ${count} new rows since ${startTime}`);

          if (count !== null && count >= totalFiles) {
            console.log("✅ Polling confirmed completion!");
            // Pass nothing to indicate "Bulk Success" from polling
            checkCompletion();
          }
        } catch (e) {
          console.error("Polling Exception:", e);
        }
      }, 5000); // Check every 5 seconds

      // 3. Set Timeout
      timeoutTimer = setTimeout(() => {
        if (completed > 0) {
          // If we finished some but not all, consider it partial success?
          // For now, let's just finish what we have.
          done = true;
          cleanup();
          resolve({ success: true, queued: true }); // Queued/Partial
        } else {
          fail("Analysis timed out. No results received within 10 minutes.");
        }
      }, MAX_WAIT);

      // 4. Upload Files
      const formData = new FormData();
      filesToUpload.forEach(f => formData.append('file', f));

      try {
        console.log("Sending files to N8N webhook...");
        const response = await fetch(WEBHOOK_URL, {
          method: 'POST',
          body: formData,
          signal: abortController.current?.signal // Bind abort signal
          // Removed 'no-cors' to allow reading response status
          // Note: This requires the N8N webhook to have CORS enabled/configured to accept requests from this origin
        });

        if (response.ok) {
          console.log("Batch uploaded and processed successfully by N8N. Waiting for Realtime update...");
          const result = await response.json().catch(() => ({})); // Try to parse JSON if returned
          console.log("Webhook Response:", result);

          // DO NOT force completion here. 
          // If N8n responds early, we must wait for the actual DB insert (handled by checkCompletion or Polling).
        } else {
          console.error("Webhook returned error status:", response.status, response.statusText);
          fail(`Analysis failed with status: ${response.status} ${response.statusText}`);
        }
      } catch (e: any) {
        if (e.name === 'AbortError') {
          console.log("Upload cancelled");
          // already handled by abort listener
        } else {
          console.error("Upload/Network failed:", e);
          fail("Failed to connect to analysis engine. Please checks your network.");
        }
      }
    });
  };

  const processAudio = async () => {
    if (files.length === 0) return;

    if (files.length > 5) {
      setError("Please upload a maximum of 5 files at a time.");
      setStatus('error');
      return;
    }

    const oversizedFile = files.find(f => f.size > MAX_FILE_SIZE_MB * 1024 * 1024);
    if (oversizedFile) {
      setError(`"${oversizedFile.name}" exceeds ${MAX_FILE_SIZE_MB}MB limit.`);
      setStatus('error');
      return;
    }

    setStatus('processing');
    setError(null);
    setIsCorsError(false);

    try {
      await analyzeWithWebhook(files);

      // Slight delay for UI to show 100%
      setTimeout(() => {
        if (onUploadSuccess) onUploadSuccess();
        setStatus('success');

        setTimeout(() => {
          onClose();
          resetState();
        }, 3000);
      }, 1000);

    } catch (err: any) {
      if (err.message === "Analysis cancelled by user") {
        setStatus('idle');
      } else {
        handleError(err);
      }
    }
  };

  const cancelAnalysis = () => {
    if (abortController.current) {
      abortController.current.abort();
    }
    setStatus('idle');
    setProcessedCount(0);
    setProgress(0);
  };

  const handleError = (err: any) => {
    console.error("Analysis Process Error:", err);
    let message = err.message || "An unexpected error occurred.";

    if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
      message = "Connection Failed. The server may be unreachable or blocking the request.";
      setIsCorsError(true);
    }

    setError(message);
    setStatus('error');
  };

  const resetState = () => {
    setStatus('idle');
    setError(null);
    setFiles([]);
    setManualAgentName('');
    setProgress(0);
    setProcessedCount(0);
  };

  const handleRetry = () => {
    resetState();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#0F0720]/80 backdrop-blur-md transition-opacity"
        onClick={status !== 'processing' ? onClose : undefined}
      />

      <div className="relative w-full max-w-lg bg-[#1a0b2e] rounded-3xl shadow-2xl overflow-hidden border border-purple-500/30 text-white animate-in fade-in zoom-in-95 duration-300">

        <div className="flex justify-between items-center p-6 border-b border-white/5 bg-[#2E1065]/50">
          <div className="flex items-center gap-3">
            {/* Replaced Generic Zap Icon with Brand Logo */}
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

              {/* Cancel Button */}
              <div className="absolute top-0 right-0 z-20">
                <button
                  onClick={cancelAnalysis}
                  className="flex items-center gap-1 px-3 py-1 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-300 rounded-full text-xs font-bold transition-all border border-transparent hover:border-red-500/30"
                >
                  <StopCircle size={12} /> Cancel
                </button>
              </div>

              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-600/20 rounded-full blur-[60px] animate-pulse pointer-events-none" />

              {/* Progress Bar & Status */}
              <div className="mb-8 px-8 w-full mx-auto">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Total Progress
                  </span>
                  <span className="text-xs font-mono text-purple-300">
                    {Math.round(progress)}%
                  </span>
                </div>

                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="flex justify-between items-center text-[10px] text-slate-500 font-medium uppercase tracking-widest">
                  <span>{files.length} Item{files.length !== 1 ? 's' : ''}</span>
                  <span>EST: ~{estimatedSeconds}s remaining</span>
                </div>
              </div>

              {/* Individual File Progress */}
              <div className="max-w-xs mx-auto space-y-2 mb-8 bg-black/20 p-4 rounded-xl border border-white/5 max-h-40 overflow-y-auto">
                {files.map((file, idx) => {
                  const isDone = idx < processedCount;
                  // In concurrent mode, everything not done is processing
                  const isProcessing = !isDone;

                  return (
                    <div key={idx} className="flex flex-col gap-1">
                      <div className="flex items-center gap-3 text-sm">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 
                                    ${isDone ? 'bg-emerald-500 text-white' : 'bg-purple-500 text-white'}`}>
                          {isDone ? <CheckCircle2 size={12} /> : <Loader2 size={12} className="animate-spin" />}
                        </div>
                        <span className={`truncate flex-1 text-left ${isDone ? 'text-emerald-300 opacity-70' : 'text-white font-bold'}`}>
                          {file.name}
                        </span>
                        {isProcessing && <span className="text-[10px] text-purple-300 font-mono">Analyzing...</span>}
                      </div>

                      {/* Mini progress bar for current item */}
                      {isProcessing && (
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden ml-8">
                          <div className="h-full bg-purple-500/50 animate-[pulse_2s_infinite] w-2/3 rounded-full" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="flex flex-col items-center justify-center gap-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] animate-pulse leading-relaxed">
                  {LOADING_STATEMENTS[statementIndex]}
                </p>
                <p className="text-[9px] text-slate-600 mt-2">Listening for database updates...</p>
              </div>
            </div>
          ) : status === 'success' ? (
            <div className="py-12 text-center animate-in zoom-in-95 min-h-[300px] flex flex-col justify-center">
              <div className="relative h-24 w-24 mx-auto mb-8">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse" />
                <div className="relative h-full w-full bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                  <CheckCircle2 size={48} className="text-emerald-500" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Analysis Complete</h3>
              <p className="text-emerald-300/80 text-sm font-medium">Successfully processed {files.length} recordings</p>
            </div>
          ) : status === 'batch-complete' ? (
            <div />
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
                  {files.length > 1 ? <Files size={28} className="text-purple-300" /> : <Upload size={28} className="text-purple-300" />}
                </div>

                <h3 className="font-bold text-white text-lg">
                  {files.length === 0
                    ? 'Upload Call Recordings'
                    : files.length === 1
                      ? files[0].name
                      : `${files.length} files selected`}
                </h3>
                <p className="text-xs text-slate-400 mt-2 font-medium">
                  Supports MP3, WAV, WEBM (Max {MAX_FILE_SIZE_MB}MB per file)
                </p>
                {files.length === 0 && (
                  <p className="text-xs text-purple-400 mt-2 font-semibold">
                    Select multiple files for bulk upload
                  </p>
                )}
              </div>

              {files.length > 0 && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                  {/* File list with scroll for many files */}
                  <div className={`space-y-2 ${files.length > 3 ? 'max-h-40 overflow-y-auto pr-2' : ''}`}>
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center gap-3 bg-purple-900/20 p-3 rounded-lg border border-purple-500/20">
                        <FileAudio size={18} className="text-purple-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{file.name}</p>
                          <p className="text-xs text-slate-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
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
                  {files.length > 3 && (
                    <div className="text-center">
                      <span className="text-xs text-purple-300 font-bold bg-purple-500/20 px-3 py-1 rounded-full">
                        {files.length} files • {(files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(1)} MB total
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

              {files.length > 0 && (
                <button
                  onClick={processAudio}
                  className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-purple-900/50 hover:shadow-purple-700/50 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Zap size={18} fill="currentColor" />
                  {files.length === 1 ? 'Run Compliance Scan' : `Scan ${files.length} Recordings`}
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