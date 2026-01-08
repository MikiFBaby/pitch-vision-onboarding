"use client";


import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Mic, X, Activity, Volume2, Loader2, StopCircle, BrainCircuit, Sparkles, ChevronRight } from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";
import { CallData } from '@/types/qa-types';
import { NeonButton } from './ui/NeonButton';

// --- Audio Utils ---

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  if (data.byteLength % 2 !== 0) {
    data = data.subarray(0, data.byteLength - 1);
  }

  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data: Float32Array): { data: string, mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// --- Component ---

interface VoiceCopilotProps {
  calls: CallData[];
  averageScore: number;
  totalCalls: number;
  riskCount: number;
  variant?: 'floating' | 'sidebar';
}

export const VoiceCopilot: React.FC<VoiceCopilotProps> = ({
  calls,
  averageScore,
  totalCalls,
  riskCount,
  variant = 'floating'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for audio handling
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const systemInstruction = useMemo(() => {
    const recentCallsSummary = calls.slice(0, 15).map(c => ({
      agent: c.agentName,
      status: c.status,
      score: c.complianceScore,
      risk: c.riskLevel,
      summary: c.summary,
      timestamp: c.timestamp
    }));

    return `You are Aura, the advanced AI voice assistant for Pitch Vision. 
    You have access to the real-time dashboard data.
    
    Current Dashboard Metrics:
    - Average Compliance Score: ${averageScore}%
    - Total Calls Analyzed: ${totalCalls}
    - Critical Risk Calls: ${riskCount}
    
    Recent Calls Data (Last ${recentCallsSummary.length}):
    ${JSON.stringify(recentCallsSummary)}
    
    Your goal is to help the user understand this data, identify trends, and answer specific questions about agents or compliance issues.
    Be professional, concise, and helpful. Speak naturally.`;
  }, [calls, averageScore, totalCalls, riskCount]);

  const startSession = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key is missing.");

      const ai = new GoogleGenAI({ apiKey });

      const InputContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      const inputCtx = new InputContextClass({ sampleRate: 16000 });
      const outputCtx = new InputContextClass({ sampleRate: 24000 });

      inputContextRef.current = inputCtx;
      outputContextRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: systemInstruction,
        },
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Session Opened");
            setIsConnecting(false);
            setIsActive(true);

            const source = inputCtx.createMediaStreamSource(stream);
            sourceRef.current = source;

            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = processor;

            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: async (msg: any) => {
            const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              setIsSpeaking(true);
              const audioCtx = outputContextRef.current;
              if (!audioCtx) return;

              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioCtx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
              const source = audioCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(audioCtx.destination);

              source.addEventListener('ended', () => {
                audioSourcesRef.current.delete(source);
                if (audioSourcesRef.current.size === 0) setIsSpeaking(false);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              audioSourcesRef.current.add(source);
            }

            if (msg.serverContent?.interrupted) {
              audioSourcesRef.current.forEach(s => s.stop());
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }
          },
          onclose: () => {
            console.log("Gemini Live Session Closed");
            stopSession();
          },
          onerror: (err: any) => {
            console.error("Gemini Live Error:", err);
            setError("Connection failed.");
            stopSession();
          }
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (e: any) {
      console.error("Failed to start session:", e);
      setError(e.message || "Failed to start audio session.");
      setIsConnecting(false);
      stopSession();
    }
  };

  const stopSession = () => {
    setIsActive(false);
    setIsConnecting(false);
    setIsSpeaking(false);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (inputContextRef.current?.state !== 'closed') inputContextRef.current?.close();
    if (outputContextRef.current?.state !== 'closed') outputContextRef.current?.close();
    inputContextRef.current = null;
    outputContextRef.current = null;

    audioSourcesRef.current.forEach(s => s.stop());
    audioSourcesRef.current.clear();

    if (sessionPromiseRef.current) sessionPromiseRef.current.then(session => session.close());
    sessionPromiseRef.current = null;
  };

  useEffect(() => {
    return () => stopSession();
  }, []);

  // CLOSED STATE - Trigger Button
  if (!isOpen) {
    if (variant === 'sidebar') {
      return (
        <div className="w-full flex justify-center py-2">
          <NeonButton onClick={() => setIsOpen(true)} className="w-full scale-95" neon={true}>
            <Sparkles className="w-4 h-4 text-purple-200 animate-pulse" />
            Ask Pitch Vision
          </NeonButton>
        </div>
      );
    }

    return (
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 group">
        <NeonButton onClick={() => setIsOpen(true)} neon={true}>
          <BrainCircuit className="w-4 h-4 text-purple-200" />
          Ask Pitch Vision
        </NeonButton>
      </div>
    );
  }

  // OPEN STATE - Centered Card Modal
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={() => { if (!isActive) setIsOpen(false); }}
      />

      {/* Main Card */}
      <div className="relative w-full max-w-sm bg-black border border-white/10 rounded-[2.5rem] shadow-[0_0_80px_-20px_rgba(124,58,237,0.4)] overflow-hidden animate-in zoom-in-95 duration-300 ring-1 ring-white/5">

        {/* Subtle Inner Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-purple-600/20 blur-[60px] rounded-full pointer-events-none" />

        {/* Header */}
        <div className="relative z-10 flex justify-between items-center px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <BrainCircuit size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide leading-none mb-1">Pitch Vision</h3>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {isActive ? 'Live Link Active' : 'Standby'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => { stopSession(); setIsOpen(false); }}
            className="h-8 w-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="px-6 pb-8 pt-4 flex flex-col items-center relative z-10 min-h-[300px] justify-between">

          {error ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="h-12 w-12 bg-rose-500/10 rounded-full flex items-center justify-center mb-4 border border-rose-500/20">
                <Activity size={24} className="text-rose-500" />
              </div>
              <p className="text-rose-400 text-sm font-medium mb-6">{error}</p>
              <NeonButton
                onClick={() => { setError(null); startSession(); }}
                variant="ghost"
                className="text-sm"
              >
                Retry Connection
              </NeonButton>
            </div>
          ) : isActive ? (
            /* ACTIVE VISUALIZER STATE */
            <div className="flex-1 w-full flex flex-col items-center justify-center py-6">
              <div className="relative h-40 w-40 mb-8 flex items-center justify-center">
                {/* Ripple Effects */}
                <div className={`absolute inset-0 rounded-full border border-purple-500/30 transition-all duration-1000 ${isSpeaking ? 'scale-150 opacity-0' : 'scale-100 opacity-100'}`} />
                <div className={`absolute inset-0 rounded-full border border-indigo-500/30 transition-all duration-1000 delay-150 ${isSpeaking ? 'scale-125 opacity-0' : 'scale-90 opacity-100'}`} />

                {/* Main Orb */}
                <div className={`relative h-24 w-24 rounded-full flex items-center justify-center transition-all duration-300 ${isSpeaking ? 'bg-gradient-to-tr from-purple-600 to-indigo-600 shadow-[0_0_60px_rgba(139,92,246,0.6)] scale-110' : 'bg-slate-900 shadow-inner border border-white/10'}`}>
                  {isSpeaking ? (
                    <Volume2 size={36} className="text-white animate-pulse" />
                  ) : (
                    <div className="flex gap-1.5 h-6 items-center">
                      <div className="w-1.5 h-full bg-purple-500 rounded-full animate-[music-bar_1s_ease-in-out_infinite]" />
                      <div className="w-1.5 h-1/2 bg-purple-500 rounded-full animate-[music-bar_1.2s_ease-in-out_infinite]" />
                      <div className="w-1.5 h-3/4 bg-purple-500 rounded-full animate-[music-bar_0.8s_ease-in-out_infinite]" />
                    </div>
                  )}
                </div>
              </div>

              <div className="text-center space-y-2">
                <p className="text-white font-bold text-xl tracking-tight">
                  {isSpeaking ? "Aura is Speaking..." : "Listening..."}
                </p>
                <p className="text-slate-500 text-xs font-medium">
                  Processing secure audio stream
                </p>
              </div>

              <div className="mt-auto pt-8 w-full">
                <button
                  onClick={stopSession}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-bold uppercase tracking-wide transition-colors border border-rose-500/20"
                >
                  <StopCircle size={16} /> End Session
                </button>
              </div>
            </div>
          ) : isConnecting ? (
            /* CONNECTING STATE */
            <div className="flex-1 flex flex-col items-center justify-center">
              <Loader2 className="w-10 h-10 text-purple-500 animate-spin mb-4" />
              <p className="text-slate-400 font-medium">Establishing secure uplink...</p>
            </div>
          ) : (
            /* STANDBY / PROMPT STATE */
            <div className="w-full flex flex-col h-full">
              <div className="flex-1 flex flex-col justify-center gap-6 py-4">
                <div className="text-center space-y-4 px-2">
                  <p className="text-xl text-slate-200 font-medium leading-relaxed tracking-tight">
                    "Analyze recent compliance risks"
                  </p>
                  <p className="text-xl text-slate-200 font-medium leading-relaxed tracking-tight opacity-50">
                    "How is Agent Sarah performing?"
                  </p>
                </div>
              </div>

              <div className="mt-auto w-full pt-6">
                <NeonButton
                  onClick={startSession}
                  variant="solid"
                  size="lg"
                  className="w-full group"
                >
                  <Mic className="w-5 h-5 mr-1 group-hover:scale-110 transition-transform" fill="currentColor" />
                  Activate Voice Interface
                </NeonButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
