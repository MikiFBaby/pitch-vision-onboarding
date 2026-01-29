"use client";
import React, { useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
    Search,
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize2,
    Grid3X3,
    Heart,
    Share2,
    Eye,
    ThumbsUp,
    Radio,
    Clock,
    Users,
    MessageCircle,
    Send,
    ChevronRight,
    Video,
    Headphones,
    FileQuestion,
    CheckCircle
} from "lucide-react";
import Image from "next/image";

// Mock content data - will be replaced with Supabase data
const featuredContent = {
    id: "compliance-intro",
    type: "video",
    title: "Compliance Fundamentals: Understanding the Regulatory Framework",
    description: "Master the essential compliance requirements for call handling and customer interactions. This comprehensive module covers regulatory requirements, best practices, and real-world scenarios that every agent needs to understand.",
    instructor: {
        name: "Sarah Johnson",
        avatar: "/images/avatar-agent.png",
        title: "Compliance Director",
        followers: 1245
    },
    duration: "25:34",
    currentTime: "12:18",
    views: 3892,
    likes: 847,
    isLive: false,
    thumbnail: "/images/compliance-video-thumb.jpg"
};

const liveChat = [
    { id: 1, user: "Marcus Chen", avatar: "/images/avatar-agent.png", message: "Great explanation of the disclosure requirements!", online: true },
    { id: 2, user: "Emily Rodriguez", avatar: "/images/avatar-agent.png", message: "Can you clarify the timeout policy?", online: true },
    { id: 3, user: "James Wilson", avatar: "/images/avatar-agent.png", message: "This helped me understand the verification process", online: false },
    { id: 4, user: "Aisha Patel", avatar: "/images/avatar-agent.png", message: "Taking notes on this section!", online: true },
];

const relatedContent = [
    {
        id: "advanced-compliance",
        type: "video",
        title: "Advanced Compliance Scenarios",
        instructor: "Sarah Johnson",
        views: 2156,
        duration: "32:15",
        thumbnail: "/images/course-compliance.jpg"
    },
    {
        id: "sales-techniques",
        type: "video",
        title: "Mastering the Sales Call",
        instructor: "Michael Chen",
        views: 4521,
        duration: "28:42",
        thumbnail: "/images/course-sales.jpg"
    },
    {
        id: "product-knowledge",
        type: "audio",
        title: "Product Deep Dive Podcast",
        instructor: "Lisa Park",
        views: 1823,
        duration: "45:00",
        thumbnail: "/images/course-product.jpg"
    },
];

const contentCategories = [
    { id: "all", label: "All Content", icon: Grid3X3 },
    { id: "video", label: "Video Lessons", icon: Video },
    { id: "audio", label: "Audio Training", icon: Headphones },
    { id: "quiz", label: "Assessments", icon: FileQuestion },
];

export default function EducationalPortalPage() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isLiked, setIsLiked] = useState(false);
    const [chatMessage, setChatMessage] = useState("");
    const [activeCategory, setActiveCategory] = useState("all");
    const [progress, setProgress] = useState(48); // Percentage of video watched

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

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Left Column - Video Player & Info */}
                    <div className="xl:col-span-2 space-y-4">
                        {/* Video Player */}
                        <div className="glass-card rounded-2xl overflow-hidden border border-white/5">
                            {/* Video Frame */}
                            <div className="relative aspect-video bg-gradient-to-br from-indigo-900/50 to-purple-900/50">
                                {/* Placeholder Video Background */}
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                    <button
                                        onClick={() => setIsPlaying(!isPlaying)}
                                        className="p-6 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-all duration-300 hover:scale-110"
                                    >
                                        {isPlaying ? (
                                            <Pause className="w-12 h-12 text-white" />
                                        ) : (
                                            <Play className="w-12 h-12 text-white ml-1" />
                                        )}
                                    </button>
                                </div>

                                {/* Video Controls Overlay */}
                                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                                    {/* Live Badge (if applicable) */}
                                    {featuredContent.isLive && (
                                        <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-red-500 rounded-lg">
                                            <Radio className="w-3 h-3 animate-pulse" />
                                            <span className="text-xs font-bold text-white uppercase">Live</span>
                                        </div>
                                    )}

                                    {/* Progress Bar */}
                                    <div className="mb-3">
                                        <div className="h-1 bg-white/20 rounded-full cursor-pointer group">
                                            <div
                                                className="h-full bg-indigo-500 rounded-full relative group-hover:h-1.5 transition-all"
                                                style={{ width: `${progress}%` }}
                                            >
                                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Controls Row */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => setIsPlaying(!isPlaying)}
                                                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                                            >
                                                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                                            </button>
                                            <button
                                                onClick={() => setIsMuted(!isMuted)}
                                                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                                            >
                                                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                                            </button>
                                            <span className="text-sm text-white/80 font-medium">
                                                {featuredContent.currentTime} / {featuredContent.duration}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                                                <Grid3X3 size={18} />
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
                        <div className="glass-card p-6 rounded-2xl border border-white/5">
                            {/* Instructor & Actions Row */}
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                                            {featuredContent.instructor.name[0]}
                                        </div>
                                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 border-2 border-[#0a0a1a] rounded-full" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white">{featuredContent.instructor.name}</h4>
                                        <p className="text-xs text-white/50">{featuredContent.instructor.followers.toLocaleString()} followers</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-all">
                                        <Share2 size={16} />
                                        <span className="text-sm font-medium">Share</span>
                                    </button>
                                    <button
                                        onClick={() => setIsLiked(!isLiked)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${isLiked
                                                ? "bg-rose-500 text-white"
                                                : "bg-white/5 hover:bg-white/10 text-white/80 hover:text-white"
                                            }`}
                                    >
                                        <Heart size={16} className={isLiked ? "fill-current" : ""} />
                                        <span className="text-sm font-medium">{isLiked ? "Liked" : "Like"}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Title */}
                            <h2 className="text-xl font-bold text-white mb-3">
                                {featuredContent.title}
                            </h2>

                            {/* Stats Row */}
                            <div className="flex flex-wrap items-center gap-4 mb-4 text-sm text-white/50">
                                <span className="flex items-center gap-1.5">
                                    <Eye size={14} />
                                    {featuredContent.views.toLocaleString()} views
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <ThumbsUp size={14} />
                                    {featuredContent.likes.toLocaleString()} likes
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Clock size={14} />
                                    {featuredContent.duration}
                                </span>
                            </div>

                            {/* Description */}
                            <p className="text-white/60 text-sm leading-relaxed">
                                {featuredContent.description}
                            </p>

                            {/* Mark Complete Button */}
                            <div className="mt-6 pt-4 border-t border-white/5">
                                <button className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                                    <CheckCircle size={18} />
                                    Mark as Complete
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Chat & Related */}
                    <div className="space-y-6">
                        {/* Live Chat / Discussion */}
                        <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
                            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                                <h3 className="font-bold text-white flex items-center gap-2">
                                    <MessageCircle size={16} className="text-indigo-400" />
                                    Discussion
                                </h3>
                                <span className="flex items-center gap-1.5 text-xs text-white/50">
                                    <Users size={12} />
                                    {liveChat.filter(c => c.online).length} online
                                </span>
                            </div>

                            {/* Chat Messages */}
                            <div className="h-64 overflow-y-auto p-4 space-y-4">
                                {liveChat.map((chat) => (
                                    <div key={chat.id} className="flex items-start gap-3">
                                        <div className="relative flex-shrink-0">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                                                {chat.user[0]}
                                            </div>
                                            {chat.online && (
                                                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border border-[#0a0a1a] rounded-full" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-white">{chat.user}</span>
                                                {chat.online && (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                                )}
                                            </div>
                                            <p className="text-xs text-white/60 mt-0.5">{chat.message}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Chat Input */}
                            <div className="p-4 border-t border-white/5">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={chatMessage}
                                        onChange={(e) => setChatMessage(e.target.value)}
                                        placeholder="Write your message..."
                                        className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-indigo-500/50"
                                    />
                                    <button className="p-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white transition-colors">
                                        <Send size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Related Content */}
                        <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
                            <div className="p-4 border-b border-white/5">
                                <h3 className="font-bold text-white">Related Content</h3>
                            </div>

                            <div className="p-4 space-y-4">
                                {relatedContent.map((content) => (
                                    <Link
                                        key={content.id}
                                        href={`/agent/education/${content.id}`}
                                        className="flex gap-3 group"
                                    >
                                        {/* Thumbnail */}
                                        <div className="relative w-28 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-indigo-600/30 to-purple-600/30 flex-shrink-0">
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                {content.type === "video" ? (
                                                    <Video className="w-5 h-5 text-white/60" />
                                                ) : (
                                                    <Headphones className="w-5 h-5 text-white/60" />
                                                )}
                                            </div>
                                            <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 rounded text-[10px] text-white font-medium">
                                                {content.duration}
                                            </div>
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-medium text-white group-hover:text-indigo-400 transition-colors line-clamp-2">
                                                {content.title}
                                            </h4>
                                            <p className="text-xs text-white/50 mt-1">{content.instructor}</p>
                                            <p className="text-xs text-white/40 mt-0.5">{content.views.toLocaleString()} views</p>
                                        </div>
                                    </Link>
                                ))}
                            </div>

                            {/* See All Button */}
                            <div className="p-4 pt-0">
                                <Link
                                    href="/agent/education/browse"
                                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 font-medium text-sm transition-all"
                                >
                                    See All Content
                                    <ChevronRight size={16} />
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
