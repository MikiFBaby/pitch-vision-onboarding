"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize2,
    Radio,
    Clock,
    Video,
    FileQuestion,
    CheckCircle,
    Loader2,
    Lock,
    ArrowLeft,
    ChevronRight,
    Trophy,
    Download,
} from "lucide-react";
import Image from "next/image";
import QuizRenderer from "@/components/agent/QuizRenderer";
import { downloadCertificate } from "@/utils/certificate-pdf";

// Types
interface EducationalResource {
    id: string;
    chapter_number: number;
    title: string;
    type: 'video' | 'audio' | 'quiz';
    media_url: string | null;
    media_duration: string | null;
    thumbnail_url: string | null;
    quiz_data: unknown | null;
    passing_score: number | null;
    description: string | null;
    instructor: string | null;
    sort_order: number | null;
    is_required: boolean | null;
    is_published: boolean | null;
}

interface ProgressRecord {
    id: string;
    user_id: string;
    resource_id: string;
    is_completed: boolean;
    quiz_score: number | null;
    quiz_passed: boolean;
    quiz_attempts: number;
}

interface ChapterData {
    chapter_number: number;
    video: EducationalResource | null;
    quiz: EducationalResource | null;
    videoCompleted: boolean;
    quizPassed: boolean;
    quizScore: number | null;
    quizAttempts: number;
    isUnlocked: boolean;
}

export default function EducationalPortalPage() {
    const { profile } = useAuth();

    // Video player states
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [videoProgress, setVideoProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState("0:00");
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [videoDuration, setVideoDuration] = useState("0:00");

    // Data states
    const [resources, setResources] = useState<EducationalResource[]>([]);
    const [chapters, setChapters] = useState<ChapterData[]>([]);
    const [progressMap, setProgressMap] = useState<Record<string, ProgressRecord>>({});
    const [featuredResource, setFeaturedResource] = useState<EducationalResource | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [certificateInfo, setCertificateInfo] = useState<{ completed: boolean; completionDate?: string; agentName: string } | null>(null);
    const [isRecordingCert, setIsRecordingCert] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const videoContainerRef = useRef<HTMLDivElement>(null);
    const [showControls, setShowControls] = useState(true);
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Build chapter data from resources + progress
    const buildChapters = useCallback((allResources: EducationalResource[], progress: Record<string, ProgressRecord>): ChapterData[] => {
        const chapterMap = new Map<number, ChapterData>();

        for (const r of allResources) {
            if (!chapterMap.has(r.chapter_number)) {
                chapterMap.set(r.chapter_number, {
                    chapter_number: r.chapter_number,
                    video: null,
                    quiz: null,
                    videoCompleted: false,
                    quizPassed: false,
                    quizScore: null,
                    quizAttempts: 0,
                    isUnlocked: false,
                });
            }
            const ch = chapterMap.get(r.chapter_number)!;
            if (r.type === 'video') {
                ch.video = r;
                const p = progress[r.id];
                if (p?.is_completed) ch.videoCompleted = true;
            } else if (r.type === 'quiz') {
                ch.quiz = r;
                const p = progress[r.id];
                if (p?.quiz_passed) ch.quizPassed = true;
                if (p?.quiz_score != null) ch.quizScore = p.quiz_score;
                if (p?.quiz_attempts) ch.quizAttempts = p.quiz_attempts;
            }
        }

        const sorted = Array.from(chapterMap.values()).sort((a, b) => a.chapter_number - b.chapter_number);

        // Unlock logic: Ch1 always unlocked, ChN unlocked when Ch(N-1) video completed AND quiz passed
        for (let i = 0; i < sorted.length; i++) {
            if (i === 0) {
                sorted[i].isUnlocked = true;
            } else {
                const prev = sorted[i - 1];
                sorted[i].isUnlocked = prev.videoCompleted && prev.quizPassed;
            }
        }

        return sorted;
    }, []);

    // Fetch resources and progress
    useEffect(() => {
        const fetchData = async () => {
            const { data: resourceData, error } = await supabase
                .from('educational_resources')
                .select('*')
                .eq('is_published', true)
                .order('sort_order', { ascending: true });

            if (error) {
                console.error('[Education] Error fetching resources:', error);
                setIsLoading(false);
                return;
            }

            if (resourceData && resourceData.length > 0) {
                setResources(resourceData);

                // Fetch progress if user is logged in
                let progressData: Record<string, ProgressRecord> = {};
                if (profile?.id) {
                    try {
                        const res = await fetch(`/api/education/progress?userId=${profile.id}`);
                        const json = await res.json();
                        if (json.progress) {
                            for (const p of json.progress) {
                                progressData[p.resource_id] = p;
                            }
                        }
                    } catch (err) {
                        console.error('[Education] Error fetching progress:', err);
                    }
                }

                setProgressMap(progressData);
                setChapters(buildChapters(resourceData, progressData));

                // Fetch certificate status
                if (profile?.id) {
                    try {
                        const certRes = await fetch(`/api/education/certificate?userId=${profile.id}`);
                        const certJson = await certRes.json();
                        setCertificateInfo(certJson);
                    } catch { /* ignore */ }
                }
            }
            setIsLoading(false);
        };

        fetchData();
    }, [profile?.id, buildChapters]);

    // Save progress to API
    const saveProgress = async (resourceId: string, type: 'video_complete' | 'quiz_result', extra?: { quizScore?: number; quizPassed?: boolean }) => {
        if (!profile?.id) return;
        try {
            const res = await fetch('/api/education/progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: profile.id, resourceId, type, ...extra }),
            });
            const json = await res.json();
            if (json.progress) {
                const newMap: Record<string, ProgressRecord> = {};
                for (const p of json.progress) {
                    newMap[p.resource_id] = p;
                }
                setProgressMap(newMap);
                setChapters(buildChapters(resources, newMap));
            }
        } catch (err) {
            console.error('[Education] Error saving progress:', err);
        }
    };

    // Video handlers
    const handleTimeUpdate = () => {
        if (videoRef.current) {
            const current = videoRef.current.currentTime;
            const duration = videoRef.current.duration;
            // End 1s early to skip Google Notebook LM end card
            const effectiveDuration = Math.max(duration - 1, 1);
            if (current >= effectiveDuration && duration > 1) {
                videoRef.current.pause();
                videoRef.current.currentTime = effectiveDuration;
                setIsPlaying(false);
                setVideoProgress(100);
                if (featuredResource) {
                    saveProgress(featuredResource.id, 'video_complete');
                }
                return;
            }
            setVideoProgress((current / effectiveDuration) * 100);
            const min = Math.floor(current / 60);
            const sec = Math.floor(current % 60);
            setCurrentTime(`${min}:${sec.toString().padStart(2, '0')}`);
        }
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            // Show duration minus 1s (hide Notebook LM card time)
            const duration = Math.max(videoRef.current.duration - 1, 0);
            const min = Math.floor(duration / 60);
            const sec = Math.floor(duration % 60);
            setVideoDuration(`${min}:${sec.toString().padStart(2, '0')}`);
        }
    };

    const handleVideoEnded = () => {
        setIsPlaying(false);
        setShowControls(true);
        if (featuredResource) {
            saveProgress(featuredResource.id, 'video_complete');
        }
    };

    // Auto-hide controls
    const resetControlsTimer = () => {
        setShowControls(true);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        if (isPlaying) {
            controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
        }
    };

    const handleMouseMove = () => resetControlsTimer();
    const handleMouseLeave = () => {
        if (isPlaying) {
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
            controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 1500);
        }
    };

    // Show controls when paused, auto-hide when playing
    useEffect(() => {
        if (!isPlaying) {
            setShowControls(true);
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        } else {
            controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
        }
        return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
    }, [isPlaying]);

    // Fullscreen
    const toggleFullscreen = () => {
        if (!videoContainerRef.current) return;
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            videoContainerRef.current.requestFullscreen();
        }
    };

    useEffect(() => {
        const handleFSChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFSChange);
        return () => document.removeEventListener('fullscreenchange', handleFSChange);
    }, []);

    const togglePlayPause = () => {
        if (videoRef.current) {
            if (isPlaying) videoRef.current.pause();
            else videoRef.current.play();
            setIsPlaying(!isPlaying);
        }
    };

    const toggleMute = () => {
        if (videoRef.current) {
            videoRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    };

    const cyclePlaybackSpeed = () => {
        const speeds = [1, 1.25, 1.5];
        const idx = speeds.indexOf(playbackSpeed);
        const newSpeed = speeds[(idx + 1) % speeds.length];
        setPlaybackSpeed(newSpeed);
        if (videoRef.current) videoRef.current.playbackRate = newSpeed;
    };

    const selectResource = (resource: EducationalResource) => {
        const ch = chapters.find(c => c.chapter_number === resource.chapter_number);
        if (!ch?.isUnlocked) return;
        if (resource.type === 'quiz' && !ch.videoCompleted) return;

        setFeaturedResource(resource);
        setIsPlaying(false);
        setVideoProgress(0);
        setCurrentTime("0:00");
        setVideoDuration("0:00");
        setPlaybackSpeed(1);
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.playbackRate = 1;
        }
    };

    const handleQuizComplete = async (score: number, passed: boolean) => {
        if (!featuredResource) return;
        await saveProgress(featuredResource.id, 'quiz_result', { quizScore: score, quizPassed: passed });

        // Auto-record certificate if this was the final quiz that completes everything
        if (passed && profile?.id) {
            try {
                const certRes = await fetch(`/api/education/certificate?userId=${profile.id}`);
                const certJson = await certRes.json();
                if (!certJson.completed) {
                    // Try recording — the API validates all chapters are done
                    const postRes = await fetch('/api/education/certificate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: profile.id }),
                    });
                    const postJson = await postRes.json();
                    if (postJson.success) {
                        setCertificateInfo({
                            completed: true,
                            completionDate: postJson.completionDate,
                            agentName: postJson.agentName,
                        });
                    }
                }
            } catch { /* certificate check is non-critical */ }
        }
    };

    const featuredChapter = chapters.find(ch => ch.chapter_number === featuredResource?.chapter_number);
    const isVideoCompleted = featuredResource?.type === 'video' && featuredChapter?.videoCompleted;
    const completedCount = chapters.filter(c => c.videoCompleted && c.quizPassed).length;
    const progressPercent = chapters.length ? Math.round((completedCount / chapters.length) * 100) : 0;
    const allComplete = chapters.length > 0 && completedCount === chapters.length;

    const handleDownloadCertificate = async () => {
        if (!profile?.id) return;
        setIsRecordingCert(true);
        try {
            // Record completion in employee profile if not already done
            if (!certificateInfo?.completed) {
                const res = await fetch('/api/education/certificate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: profile.id }),
                });
                const json = await res.json();
                if (json.success) {
                    setCertificateInfo({
                        completed: true,
                        completionDate: json.completionDate,
                        agentName: json.agentName,
                    });
                }
            }

            // Generate and download PDF
            const agentName = certificateInfo?.agentName || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Agent';
            const dateStr = certificateInfo?.completionDate
                ? new Date(certificateInfo.completionDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            downloadCertificate(agentName, dateStr);
        } catch (err) {
            console.error('[Education] Certificate error:', err);
        } finally {
            setIsRecordingCert(false);
        }
    };

    // ── RENDER ──────────────────────────────────────────────────
    return (
        <DashboardLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Training Academy</h1>
                        <p className="text-sm text-white/70 mt-1">
                            Complete each chapter&apos;s video and pass the quiz (80%) to unlock the next.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 glass-card px-4 py-2.5 rounded-xl border border-white/5">
                        <div className="text-right">
                            <div className="text-sm font-bold text-white">{completedCount}/{chapters.length}</div>
                            <div className="text-xs text-white/70 uppercase tracking-wider">Completed</div>
                        </div>
                        <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Certificate Banner */}
                {allComplete && !featuredResource && (
                    <div className="glass-card rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 via-indigo-500/5 to-purple-500/5 p-6">
                        <div className="flex flex-col sm:flex-row items-center gap-5">
                            <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-400/20 to-amber-500/10 border border-amber-400/20">
                                <Trophy className="w-10 h-10 text-amber-400" />
                            </div>
                            <div className="flex-1 text-center sm:text-left">
                                <h2 className="text-lg font-bold text-white mb-1">Training Complete!</h2>
                                <p className="text-sm text-white/80">
                                    You&apos;ve completed all {chapters.length} chapters and passed every quiz.
                                    {certificateInfo?.completionDate && (
                                        <span className="text-emerald-400 ml-1">
                                            Certified on {new Date(certificateInfo.completionDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                        </span>
                                    )}
                                </p>
                            </div>
                            <button
                                onClick={handleDownloadCertificate}
                                disabled={isRecordingCert}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-bold text-sm transition-all whitespace-nowrap disabled:opacity-50"
                            >
                                {isRecordingCert ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    <Download size={16} />
                                )}
                                Download Certificate
                            </button>
                        </div>
                    </div>
                )}

                {isLoading ? (
                    <div className="glass-card rounded-2xl border border-white/5 p-16 flex items-center justify-center">
                        <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
                    </div>
                ) : featuredResource ? (
                    /* ─── PLAYER VIEW ─── */
                    <div className="space-y-4">
                        <button
                            onClick={() => setFeaturedResource(null)}
                            className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors"
                        >
                            <ArrowLeft size={14} />
                            Back to all chapters
                        </button>

                        {featuredResource.type === 'quiz' && featuredResource.quiz_data ? (
                            <QuizRenderer
                                key={featuredResource.id}
                                quizData={featuredResource.quiz_data as { quiz_id: string; chapter: number; title: string; description: string; passing_score: number; questions: { id: number; type: "multiple_choice" | "true_false"; question: string; options?: string[]; correct_answer: number | boolean; explanation: string; }[]; }}
                                passingScore={featuredResource.passing_score || 80}
                                onComplete={handleQuizComplete}
                            />
                        ) : (
                            <>
                                {/* Video Player */}
                                <div className={`glass-card rounded-2xl overflow-hidden border border-white/5 ${isFullscreen ? '' : 'max-w-4xl'}`}>
                                    <div
                                        ref={videoContainerRef}
                                        className={`relative bg-black ${isFullscreen ? 'w-full h-full' : 'aspect-video'}`}
                                        onMouseMove={handleMouseMove}
                                        onMouseLeave={handleMouseLeave}
                                        style={{ cursor: showControls ? 'default' : 'none' }}
                                    >
                                        {featuredResource.media_url ? (
                                            <>
                                                <video
                                                    ref={videoRef}
                                                    key={featuredResource.id}
                                                    src={featuredResource.media_url}
                                                    poster={featuredResource.thumbnail_url || undefined}
                                                    className="absolute inset-0 w-full h-full object-contain"
                                                    onTimeUpdate={handleTimeUpdate}
                                                    onLoadedMetadata={handleLoadedMetadata}
                                                    onEnded={handleVideoEnded}
                                                    onPlay={() => setIsPlaying(true)}
                                                    onPause={() => setIsPlaying(false)}
                                                    onClick={togglePlayPause}
                                                    muted={isMuted}
                                                    playsInline
                                                    preload="metadata"
                                                    controlsList="nodownload noplaybackrate"
                                                    disablePictureInPicture
                                                />
                                                {/* Center play button (only when paused & controls visible) */}
                                                {!isPlaying && showControls && (
                                                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center cursor-pointer pointer-events-none">
                                                        <div className="p-5 rounded-full bg-white/10 backdrop-blur-sm">
                                                            <Play className="w-10 h-10 text-white ml-1" />
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <p className="text-white/70">No video available</p>
                                            </div>
                                        )}

                                        {/* Controls overlay — auto-hides */}
                                        <div className={`absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                            {/* Progress bar (visual only — not seekable) */}
                                            <div className="mb-2">
                                                <div className="h-1 bg-white/20 rounded-full">
                                                    <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${videoProgress}%` }} />
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <button onClick={togglePlayPause} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                                                        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                                                    </button>
                                                    <button onClick={toggleMute} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                                                        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                                                    </button>
                                                    <span className="text-xs text-white/70 font-medium">{currentTime} / {videoDuration}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <button onClick={cyclePlaybackSpeed} className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-xs font-bold text-white">
                                                        {playbackSpeed}x
                                                    </button>
                                                    <button onClick={toggleFullscreen} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                                                        <Maximize2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Video Info */}
                                <div className="glass-card p-5 rounded-2xl border border-white/5 max-w-4xl">
                                    <h2 className="text-xl font-bold text-white mb-1">{featuredResource.title}</h2>
                                    <div className="flex items-center gap-3 text-sm text-white/70 mb-4">
                                        <span className="flex items-center gap-1"><Clock size={13} />{videoDuration !== "0:00" ? videoDuration : featuredResource.media_duration || '—'}</span>
                                        <span>Chapter {featuredResource.chapter_number}</span>
                                        {isVideoCompleted && <span className="flex items-center gap-1 text-emerald-400"><CheckCircle size={13} />Completed</span>}
                                    </div>
                                    <p className="text-white/80 text-sm leading-relaxed mb-5">{featuredResource.description}</p>

                                    {isVideoCompleted ? (
                                        <div className="space-y-3">
                                            <div className="w-full py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-sm flex items-center justify-center gap-2">
                                                <CheckCircle size={16} /> Video Completed
                                            </div>
                                            {featuredChapter?.quiz && !featuredChapter.quizPassed && (
                                                <button
                                                    onClick={() => selectResource(featuredChapter.quiz!)}
                                                    className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                                                >
                                                    <FileQuestion size={16} /> Take Chapter {featuredResource.chapter_number} Quiz
                                                </button>
                                            )}
                                            {featuredChapter?.quizPassed && (
                                                <div className="w-full py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium text-sm flex items-center justify-center gap-2">
                                                    <CheckCircle size={16} /> Quiz Passed — {featuredChapter.quizScore}%
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 font-medium text-sm flex items-center justify-center gap-2">
                                            <Radio size={16} /> Watch full video to complete
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    /* ─── CURRICULUM OUTLINE ─── */
                    <div className="space-y-3">
                        {chapters.map((ch) => {
                            const thumbnail = ch.video?.thumbnail_url || ch.quiz?.thumbnail_url;
                            const isComplete = ch.videoCompleted && ch.quizPassed;

                            return (
                                <div
                                    key={ch.chapter_number}
                                    className={`glass-card rounded-2xl border overflow-hidden transition-all ${
                                        ch.isUnlocked
                                            ? "border-white/10 hover:border-indigo-500/20"
                                            : "border-white/5 opacity-50"
                                    }`}
                                >
                                    <div className="flex flex-col sm:flex-row">
                                        {/* Thumbnail */}
                                        <div
                                            className={`relative w-full sm:w-56 md:w-64 flex-shrink-0 aspect-video bg-gradient-to-br from-indigo-900/30 to-purple-900/30 ${ch.isUnlocked ? 'cursor-pointer' : ''}`}
                                            onClick={() => ch.isUnlocked && ch.video && selectResource(ch.video)}
                                        >
                                            {thumbnail ? (
                                                <Image
                                                    src={thumbnail}
                                                    alt={`Chapter ${ch.chapter_number}`}
                                                    fill
                                                    className="object-cover"
                                                    sizes="(max-width: 640px) 100vw, 256px"
                                                />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <Video className="w-8 h-8 text-white/20" />
                                                </div>
                                            )}

                                            {/* Lock overlay */}
                                            {!ch.isUnlocked && (
                                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-[1px]">
                                                    <Lock className="w-6 h-6 text-white/40" />
                                                </div>
                                            )}

                                            {/* Chapter badge */}
                                            <div className="absolute top-2 left-2 px-2.5 py-1 bg-black/60 backdrop-blur-sm rounded text-xs font-bold text-white uppercase tracking-wider">
                                                Ch {ch.chapter_number}
                                            </div>

                                            {/* Play icon for unlocked */}
                                            {ch.isUnlocked && !isComplete && (
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/30">
                                                    <Play className="w-8 h-8 text-white" />
                                                </div>
                                            )}

                                            {/* Completion checkmark */}
                                            {isComplete && (
                                                <div className="absolute top-2 right-2 p-1 bg-emerald-500 rounded-full">
                                                    <CheckCircle size={12} className="text-white" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Chapter info */}
                                        <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between min-w-0">
                                            <div>
                                                <div className="flex items-start justify-between gap-3 mb-1">
                                                    <h3 className="text-base font-semibold text-white leading-tight">
                                                        {ch.video?.title || `Chapter ${ch.chapter_number}`}
                                                    </h3>
                                                    {ch.video?.media_duration && (
                                                        <span className="text-sm text-white/70 flex items-center gap-1 flex-shrink-0 mt-0.5">
                                                            <Clock size={12} /> {ch.video.media_duration}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-white/70 leading-relaxed line-clamp-2 mb-3">
                                                    {ch.video?.description || ''}
                                                </p>
                                            </div>

                                            {/* Action buttons */}
                                            {ch.isUnlocked ? (
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {/* Watch Video button */}
                                                    <button
                                                        onClick={() => ch.video && selectResource(ch.video)}
                                                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                                                            ch.videoCompleted
                                                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                                                                : "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/25"
                                                        }`}
                                                    >
                                                        {ch.videoCompleted ? <CheckCircle size={13} /> : <Play size={13} />}
                                                        {ch.videoCompleted ? 'Video Done' : 'Watch Video'}
                                                    </button>

                                                    {/* Take Quiz button */}
                                                    <button
                                                        onClick={() => ch.quiz && ch.videoCompleted && selectResource(ch.quiz)}
                                                        disabled={!ch.videoCompleted}
                                                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                                                            ch.quizPassed
                                                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                                                                : !ch.videoCompleted
                                                                    ? "bg-white/5 text-white/40 border border-white/5 cursor-not-allowed"
                                                                    : "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/25"
                                                        }`}
                                                    >
                                                        {ch.quizPassed ? <CheckCircle size={13} /> : !ch.videoCompleted ? <Lock size={13} /> : <FileQuestion size={13} />}
                                                        {ch.quizPassed
                                                            ? `Quiz ${ch.quizScore}%`
                                                            : !ch.videoCompleted
                                                                ? 'Quiz Locked'
                                                                : 'Take Quiz'}
                                                    </button>

                                                    {/* Arrow to open */}
                                                    {ch.isUnlocked && (
                                                        <button
                                                            onClick={() => ch.video && selectResource(ch.video)}
                                                            className="ml-auto p-1.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors hidden sm:block"
                                                        >
                                                            <ChevronRight size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 text-sm text-white/40 font-medium">
                                                    <Lock size={13} />
                                                    Complete Chapter {ch.chapter_number - 1} to unlock
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
