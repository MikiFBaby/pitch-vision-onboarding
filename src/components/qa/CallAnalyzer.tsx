"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Upload, X, CheckCircle2, Zap, AlertTriangle, FileAudio, Aperture, User, RotateCcw, Files, ChevronDown, ChevronUp } from 'lucide-react';
import { CallData } from '@/types/qa-types';
import { supabase } from '@/lib/supabase-client';

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
  const [progress, setProgress] = useState(0);
  const [statementIndex, setStatementIndex] = useState(0);

  // Batch processing state
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [showFailedDetails, setShowFailedDetails] = useState(false);

  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const statementInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status === 'processing') {
      statementInterval.current = setInterval(() => {
        setStatementIndex((prev) => (prev + 1) % LOADING_STATEMENTS.length);
      }, 8000);
    } else {
      if (statementInterval.current) clearInterval(statementInterval.current);
    }
    return () => {
      if (statementInterval.current) clearInterval(statementInterval.current);
    };
  }, [status]);

  if (!isOpen) return null;

  const startSimulation = () => {
    setProgress(0);
    if (progressInterval.current) clearInterval(progressInterval.current);

    progressInterval.current = setInterval(() => {
      setProgress((prev) => {
        if (prev < 30) return prev + 0.5;
        if (prev < 60) return prev + 0.1;
        if (prev < 80) return prev + 0.05;
        if (prev < 99) return prev + 0.005;
        return prev;
      });
    }, 100);
  };

  const completeSimulation = () => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    progressInterval.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          if (progressInterval.current) clearInterval(progressInterval.current);
          return 100;
        }
        return prev + 5;
      });
    }, 20);
  };

  const analyzeWithWebhook = async (file: File): Promise<{ success: boolean; queued: boolean }> => {
    console.log("=== UPLOADING BINARY TO N8N ===");
    console.log("File:", file.name, file.size, "bytes", file.type);

    // Get the current latest record ID BEFORE we upload
    const { data: beforeData } = await supabase
      .from('Pitch Perfect')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1);
    const initialLatestId = beforeData?.[0]?.id || 0;
    console.log("Initial latest record ID:", initialLatestId);

    // Send file as FormData
    const formData = new FormData();
    formData.append('file', file, file.name);

    try {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        body: formData,
        mode: 'no-cors',
      });
      console.log("File uploaded to n8n successfully");
    } catch (e) {
      console.error("Upload failed:", e);
      throw new Error("Failed to upload to analysis engine");
    }

    // Wait for Supabase to get the new record
    const MAX_WAIT = 8 * 60 * 1000; // 8 minutes
    const POLL_INTERVAL = 1000;

    return new Promise((resolve, reject) => {
      let done = false;
      let pollTimer: ReturnType<typeof setInterval>;
      let timeoutTimer: ReturnType<typeof setTimeout>;
      let subscription: ReturnType<typeof supabase.channel>;

      const complete = (method: string, record: any) => {
        if (done) return;
        done = true;
        console.log(`🎉 Detected via ${method}!`, record);
        clearInterval(pollTimer);
        clearTimeout(timeoutTimer);
        if (subscription) supabase.removeChannel(subscription);
        resolve({ success: true, queued: false });
      };

      const fail = (error: string) => {
        if (done) return;
        done = true;
        clearInterval(pollTimer);
        clearTimeout(timeoutTimer);
        if (subscription) supabase.removeChannel(subscription);
        reject(new Error(error));
      };

      timeoutTimer = setTimeout(() => fail("Analysis timed out"), MAX_WAIT);

      subscription = supabase
        .channel('qa-analysis-' + Date.now())
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'Pitch Perfect' },
          (payload) => complete('Realtime', payload.new)
        )
        .subscribe((status) => {
          console.log("Realtime subscription:", status);
        });

      pollTimer = setInterval(async () => {
        if (done) return;
        try {
          const { data } = await supabase
            .from('Pitch Perfect')
            .select('id')
            .order('created_at', { ascending: false })
            .limit(1);

          if (data?.[0]?.id && data[0].id !== initialLatestId) {
            complete('Polling', data[0]);
          }
        } catch (e) {
          console.warn("Poll error:", e);
        }
      }, POLL_INTERVAL);
    });
  };

  // Single file processing (for backwards compatibility)
  const processAudio = async () => {
    if (files.length === 0) return;

    // Check all file sizes
    const oversizedFile = files.find(f => f.size > MAX_FILE_SIZE_MB * 1024 * 1024);
    if (oversizedFile) {
      setError(`"${oversizedFile.name}" exceeds ${MAX_FILE_SIZE_MB}MB limit.`);
      setStatus('error');
      return;
    }

    // Single file mode
    if (files.length === 1) {
      setStatus('processing');
      setError(null);
      setIsCorsError(false);
      startSimulation();

      try {
        const result = await analyzeWithWebhook(files[0]);

        completeSimulation();

        setTimeout(() => {
          if (onUploadSuccess) onUploadSuccess();
          setStatus(result.queued ? 'queued' : 'success');

          setTimeout(() => {
            onClose();
            resetState();
          }, 2500);
        }, 500);

      } catch (err: any) {
        handleError(err);
      }
    } else {
      // Batch mode
      await processBatch();
    }
  };

  // Batch processing for multiple files
  const processBatch = async () => {
    setStatus('processing');
    setError(null);
    setIsCorsError(false);
    setBatchResults([]);
    setCurrentFileIndex(0);

    const results: BatchResult[] = [];

    for (let i = 0; i < files.length; i++) {
      setCurrentFileIndex(i);
      setProgress(0);
      startSimulation();

      const file = files[i];
      console.log(`Processing file ${i + 1}/${files.length}: ${file.name}`);

      try {
        await analyzeWithWebhook(file);
        results.push({ fileName: file.name, success: true });
        console.log(`✅ File ${i + 1} completed successfully`);
      } catch (err: any) {
        console.error(`❌ File ${i + 1} failed:`, err.message);
        results.push({ fileName: file.name, success: false, error: err.message });
      }

      setBatchResults([...results]);
    }

    if (progressInterval.current) clearInterval(progressInterval.current);

    // Refresh the data
    if (onUploadSuccess) onUploadSuccess();

    setStatus('batch-complete');
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
    if (progressInterval.current) clearInterval(progressInterval.current);
  };

  const resetState = () => {
    setStatus('idle');
    setError(null);
    setFiles([]);
    setManualAgentName('');
    setProgress(0);
    setBatchResults([]);
    setCurrentFileIndex(0);
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

  const successCount = batchResults.filter(r => r.success).length;
  const failCount = batchResults.filter(r => !r.success).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#0F0720]/80 backdrop-blur-md transition-opacity"
        onClick={status !== 'processing' ? onClose : undefined}
      />

      <div className="relative w-full max-w-lg bg-[#1a0b2e] rounded-3xl shadow-2xl overflow-hidden border border-purple-500/30 text-white animate-in fade-in zoom-in-95 duration-300">

        <div className="flex justify-between items-center p-6 border-b border-white/5 bg-[#2E1065]/50">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl shadow-[0_0_20px_rgba(147,51,234,0.4)] flex items-center justify-center overflow-hidden">
              <svg viewBox="0 0 40 40" className="w-6 h-6">
                <circle cx="20" cy="20" r="14" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
                <circle cx="20" cy="20" r="9" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeDasharray="2,2" />
                <circle cx="20" cy="20" r="4" fill="white" opacity="0.9" />
                <line x1="20" y1="4" x2="20" y2="10" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                <line x1="20" y1="30" x2="20" y2="36" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                <line x1="4" y1="20" x2="10" y2="20" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                <line x1="30" y1="20" x2="36" y2="20" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Pitch Vision AI</h2>
              <p className="text-[10px] text-purple-300 font-semibold uppercase tracking-widest">
                {files.length > 1 ? 'Bulk Compliance Audit' : 'Compliance Audit'}
              </p>
            </div>
          </div>
          {status !== 'processing' && (
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
          )}
        </div>

        <div className="p-8 max-h-[70vh] overflow-y-auto">
          {status === 'processing' ? (
            <div className="py-8 text-center relative overflow-hidden min-h-[300px] flex flex-col justify-center">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-600/20 rounded-full blur-[60px] animate-pulse pointer-events-none" />

              {/* Batch progress indicator */}
              {files.length > 1 && (
                <div className="mb-6 bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-purple-300 uppercase tracking-widest">Batch Progress</span>
                    <span className="text-sm font-bold text-white">{currentFileIndex + 1} / {files.length}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                      style={{ width: `${((currentFileIndex) / files.length) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-2 truncate">
                    Current: {files[currentFileIndex]?.name}
                  </p>
                </div>
              )}

              <div className="relative h-24 w-24 mx-auto mb-8 flex items-center justify-center">
                <div className="absolute inset-0 border-2 border-purple-500/30 rounded-full animate-[spin_3s_linear_infinite]" />
                <div className="absolute inset-2 border border-indigo-400/30 rounded-full animate-[spin_4s_linear_infinite_reverse]" />
                <div className="relative z-10 bg-[#1a0b2e] p-3 rounded-full border border-purple-400/50 shadow-[0_0_30px_rgba(168,85,247,0.4)]">
                  <Aperture size={32} className="text-white animate-[spin_10s_linear_infinite]" />
                </div>
              </div>

              <div className="w-64 mx-auto mb-4">
                <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  <span>File Progress</span>
                  <span className="text-emerald-400 animate-pulse">Running...</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden relative">
                  <div
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-col items-center justify-center gap-2">
                <p className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 tracking-tight">
                  {Math.floor(progress)}%
                </p>
                <p className="text-[10px] font-bold text-purple-300 uppercase tracking-[0.2em] animate-pulse max-w-[250px] leading-relaxed">
                  {LOADING_STATEMENTS[statementIndex]}
                </p>
                <p className="text-[9px] text-slate-500 mt-4">Do not close this window</p>
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
              <p className="text-slate-400 text-sm">Synchronizing dashboard...</p>
            </div>
          ) : status === 'batch-complete' ? (
            <div className="py-8 text-center animate-in zoom-in-95 min-h-[300px] flex flex-col justify-center">
              <div className="relative h-20 w-20 mx-auto mb-6">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse" />
                <div className="relative h-full w-full bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                  <Files size={36} className="text-emerald-500" />
                </div>
              </div>

              <h3 className="text-2xl font-bold text-white mb-4">Batch Complete</h3>

              <div className="flex justify-center gap-6 mb-6">
                <div className="text-center">
                  <div className="text-3xl font-black text-emerald-400">{successCount}</div>
                  <div className="text-xs text-slate-400 uppercase tracking-widest">Successful</div>
                </div>
                {failCount > 0 && (
                  <div className="text-center">
                    <div className="text-3xl font-black text-rose-400">{failCount}</div>
                    <div className="text-xs text-slate-400 uppercase tracking-widest">Failed</div>
                  </div>
                )}
              </div>

              {failCount > 0 && (
                <div className="mb-6">
                  <button
                    onClick={() => setShowFailedDetails(!showFailedDetails)}
                    className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 mx-auto"
                  >
                    {showFailedDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {showFailedDetails ? 'Hide' : 'Show'} failed files
                  </button>

                  {showFailedDetails && (
                    <div className="mt-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 max-h-32 overflow-y-auto text-left">
                      {batchResults.filter(r => !r.success).map((r, i) => (
                        <div key={i} className="text-xs text-slate-300 mb-1">
                          <span className="font-bold text-rose-400">✕</span> {r.fileName}
                          <span className="text-slate-500 ml-2">- {r.error}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => { onClose(); resetState(); }}
                  className="px-6 py-2.5 bg-white text-black font-bold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Done
                </button>
                <button
                  onClick={resetState}
                  className="px-6 py-2.5 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-500 transition-colors flex items-center gap-2"
                >
                  <Upload size={16} /> Upload More
                </button>
              </div>
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