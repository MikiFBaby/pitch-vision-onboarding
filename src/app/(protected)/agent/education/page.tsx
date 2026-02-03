"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";
import {
    Search,
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize2,
    Grid3X3,
    Radio,
    Clock,
    ChevronRight,
    Video,
    FileQuestion,
    CheckCircle,
    Loader2
} from "lucide-react";
import Image from "next/image";

// Types for educational resources
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

const contentCategories = [
    { id: "all", label: "All Content", icon: Grid3X3 },
    { id: "video", label: "Videos", icon: Video },
    { id: "quiz", label: "Quizzes", icon: FileQuestion },
];

export default function EducationalPortalPage() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [activeCategory, setActiveCategory] = useState("all");
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState("0:00");
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [isWatched, setIsWatched] = useState(false);
    const [videoDuration, setVideoDuration] = useState("0:00");

    // Supabase data states
    const [resources, setResources] = useState<EducationalResource[]>([]);
    const [featuredResource, setFeaturedResource] = useState<EducationalResource | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Video ref for actual playback
    const videoRef = useRef<HTMLVideoElement>(null);

    // Fetch educational resources from Supabase
    useEffect(() => {
        const fetchResources = async () => {
            console.log('[Education] Fetching resources...');
            const { data, error } = await supabase
                .from('educational_resources')
                .select('*')
                .eq('is_published', true)
                .order('sort_order', { ascending: true });

            if (error) {
                console.error('[Education] Error fetching educational resources:', error);
                setIsLoading(false);
                return;
            }

            console.log('[Education] Fetched data:', data);
            if (data && data.length > 0) {
                setResources(data);
                // Set first resource as featured
                setFeaturedResource(data[0]);
                console.log('[Education] Featured resource:', data[0]);
            }
            setIsLoading(false);
        };

        fetchResources();
    }, []);

    // Handle video time updates
    const handleTimeUpdate = () => {
        if (videoRef.current) {
            const current = videoRef.current.currentTime;
            const duration = videoRef.current.duration;
            const progressPercent = (current / duration) * 100;
            setProgress(progressPercent);

            const minutes = Math.floor(current / 60);
            const seconds = Math.floor(current % 60);
            setCurrentTime(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        }
    };

    // Handle video metadata loaded - get duration
    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            const duration = videoRef.current.duration;
            const minutes = Math.floor(duration / 60);
            const seconds = Math.floor(duration % 60);
            setVideoDuration(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        }
    };

    // Handle video completion - mark as watched
    const handleVideoEnded = () => {
        setIsPlaying(false);
        setIsWatched(true);
        // TODO: Save watched status to Supabase user_progress table
        console.log('[Education] Video completed - marked as watched');
    };

    // Handle play/pause toggle
    const togglePlayPause = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    // Handle mute toggle
    const toggleMute = () => {
        if (videoRef.current) {
            videoRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    };

    // Cycle through playback speeds: 1x -> 1.25x -> 1.5x -> 1x
    const cyclePlaybackSpeed = () => {
        const speeds = [1, 1.25, 1.5];
        const currentIndex = speeds.indexOf(playbackSpeed);
        const nextIndex = (currentIndex + 1) % speeds.length;
        const newSpeed = speeds[nextIndex];
        setPlaybackSpeed(newSpeed);
        if (videoRef.current) {
            videoRef.current.playbackRate = newSpeed;
        }
    };

    // Filter resources by category
    const filteredResources = resources.filter(r =>
        activeCategory === 'all' || r.type === activeCategory
    );

    // Get related content (exclude featured)
    const relatedContent = filteredResources.filter(r => r.id !== featuredResource?.id).slice(0, 3);

    return (
        <DashboardLayout>
            <div className="space-y-6">
                {/* Search Bar */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                    <input
                        type="text"
                        placeholder="Search courses, videos, and training materials..."
                        className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                    />
                </div>

                {/* Category Tabs */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {contentCategories.map((cat) => {
                        const Icon = cat.icon;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeCategory === cat.id
                                    ? "bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.3)]"
                                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                                    }`}
                            >
                                <Icon size={14} />
                                {cat.label}
                            </button>
                        );
                    })}
                </div>

                {/* Main Content */}
                <div className="space-y-6">
                    {/* Video Player - Constrained Width */}
                    <div className="glass-card rounded-2xl overflow-hidden border border-white/5 max-w-4xl">
                        {/* Video Frame - 16:9 aspect ratio but smaller */}
                        <div className="relative aspect-video bg-gradient-to-br from-indigo-900/50 to-purple-900/50">
                            {isLoading ? (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
                                </div>
                            ) : featuredResource?.media_url ? (
                                <>
                                    {/* Actual Video Element */}
                                    <video
                                        ref={videoRef}
                                        src={featuredResource.media_url}
                                        className="absolute inset-0 w-full h-full object-contain bg-black"
                                        onTimeUpdate={handleTimeUpdate}
                                        onLoadedMetadata={handleLoadedMetadata}
                                        onEnded={handleVideoEnded}
                                        muted={isMuted}
                                        crossOrigin="anonymous"
                                        playsInline
                                        preload="metadata"
                                        controlsList="nodownload"
                                    />
                                    {/* Play Button Overlay */}
                                    {!isPlaying && (
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                            <button
                                                onClick={togglePlayPause}
                                                className="p-6 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-all duration-300 hover:scale-110"
                                            >
                                                <Play className="w-12 h-12 text-white ml-1" />
                                            </button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <p className="text-white/50">No video available</p>
                                </div>
                            )}

                            {/* Video Controls Overlay */}
                            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                                {/* Progress Bar - Display Only (no scrubbing) */}
                                <div className="mb-3">
                                    <div className="h-1 bg-white/20 rounded-full">
                                        <div
                                            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Controls Row */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={togglePlayPause}
                                            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                                        >
                                            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                                        </button>
                                        <button
                                            onClick={toggleMute}
                                            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                                        >
                                            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                                        </button>
                                        <span className="text-sm text-white/80 font-medium">
                                            {currentTime} / {videoDuration}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* Playback Speed Button */}
                                        <button
                                            onClick={cyclePlaybackSpeed}
                                            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm font-bold text-white"
                                        >
                                            {playbackSpeed}x
                                        </button>
                                        <button className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                                            <Maximize2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Video Info */}
                    <div className="glass-card p-6 rounded-2xl border border-white/5 max-w-4xl">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                                <h2 className="text-2xl font-bold text-white mb-2">
                                    {featuredResource?.title || 'Select a video'}
                                </h2>
                                <div className="flex items-center gap-4 text-sm text-white/50">
                                    <span className="flex items-center gap-1.5">
                                        <Clock size={14} />
                                        {videoDuration || featuredResource?.media_duration || '—'}
                                    </span>
                                    <span>Chapter {featuredResource?.chapter_number || 1}</span>
                                    {featuredResource?.is_required && (
                                        <span className="flex items-center gap-1.5 text-amber-400">
                                            <CheckCircle size={14} />
                                            Required
                                        </span>
                                    )}
                                    {isWatched && (
                                        <span className="flex items-center gap-1.5 text-emerald-400">
                                            <CheckCircle size={14} />
                                            Completed
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Description */}
                        <p className="text-white/60 text-sm leading-relaxed mb-6">
                            {featuredResource?.description || 'Watch the video above to learn more about this topic. Complete the full video to mark this chapter as done.'}
                        </p>

                        {/* Mark Complete Button - Changes When Watched */}
                        {isWatched ? (
                            <div className="w-full py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-sm flex items-center justify-center gap-2">
                                <CheckCircle size={18} />
                                Chapter Completed
                            </div>
                        ) : (
                            <div className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white/50 font-medium text-sm flex items-center justify-center gap-2">
                                <Radio size={18} />
                                Complete video to mark as done
                            </div>
                        )}
                    </div>

                    {/* More Chapters Section */}
                    {relatedContent.length > 0 && (
                        <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
                            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                                <h3 className="font-bold text-white">More Chapters</h3>
                                <Link
                                    href="/agent/education/browse"
                                    className="flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                                >
                                    See All
                                    <ChevronRight size={14} />
                                </Link>
                            </div>

                            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {relatedContent.map((content) => (
                                    <button
                                        key={content.id}
                                        onClick={() => setFeaturedResource(content)}
                                        className="flex gap-3 group text-left p-3 rounded-xl hover:bg-white/5 transition-colors"
                                    >
                                        {/* Thumbnail */}
                                        <div className="relative w-24 h-14 rounded-lg overflow-hidden bg-gradient-to-br from-indigo-600/30 to-purple-600/30 flex-shrink-0">
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                {content.type === "video" ? (
                                                    <Video className="w-5 h-5 text-white/60" />
                                                ) : (
                                                    <FileQuestion className="w-5 h-5 text-white/60" />
                                                )}
                                            </div>
                                            {content.media_duration && (
                                                <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 rounded text-[10px] text-white font-medium">
                                                    {content.media_duration}
                                                </div>
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-medium text-white group-hover:text-indigo-400 transition-colors line-clamp-2">
                                                {content.title}
                                            </h4>
                                            <p className="text-xs text-white/40 mt-1">Chapter {content.chapter_number}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
