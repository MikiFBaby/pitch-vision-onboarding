"use client";
import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
    ArrowLeft,
    Clock,
    CheckCircle,
    Play,
    Pause,
    Volume2,
    Maximize2,
    ChevronDown,
    ChevronUp,
    FileText,
    Video,
    Headphones,
    Lock
} from "lucide-react";

// Mock course detail data - will be replaced with Supabase data
const courseData: Record<string, any> = {
    "compliance-fundamentals": {
        id: "compliance-fundamentals",
        title: "Compliance Fundamentals",
        description: "Master the essential compliance requirements for call handling and customer interactions. This comprehensive course covers regulatory requirements, best practices, and real-world scenarios.",
        duration: "2h 30m",
        instructor: "Sarah Johnson",
        modules: [
            {
                id: 1,
                title: "Introduction to Compliance",
                duration: "15m",
                type: "video",
                completed: true,
                content: {
                    videoUrl: "/videos/compliance-intro.mp4",
                    transcript: "Welcome to Compliance Fundamentals..."
                }
            },
            {
                id: 2,
                title: "Regulatory Framework Overview",
                duration: "25m",
                type: "video",
                completed: true,
                content: {
                    videoUrl: "/videos/regulatory-overview.mp4"
                }
            },
            {
                id: 3,
                title: "Call Recording Requirements",
                duration: "20m",
                type: "audio",
                completed: true,
                content: {
                    audioUrl: "/audio/call-recording.mp3"
                }
            },
            {
                id: 4,
                title: "Disclosure Scripts",
                duration: "15m",
                type: "document",
                completed: true,
                content: {
                    documentUrl: "/docs/disclosure-scripts.pdf"
                }
            },
            {
                id: 5,
                title: "Handling Sensitive Information",
                duration: "30m",
                type: "video",
                completed: true,
                content: {
                    videoUrl: "/videos/sensitive-info.mp4"
                }
            },
            {
                id: 6,
                title: "Common Compliance Violations",
                duration: "25m",
                type: "video",
                completed: true,
                content: {
                    videoUrl: "/videos/violations.mp4"
                }
            },
            {
                id: 7,
                title: "Quiz: Compliance Basics",
                duration: "10m",
                type: "quiz",
                completed: true,
                content: {}
            },
            {
                id: 8,
                title: "Final Assessment",
                duration: "20m",
                type: "quiz",
                completed: true,
                content: {}
            }
        ]
    },
    "advanced-sales-techniques": {
        id: "advanced-sales-techniques",
        title: "Advanced Sales Techniques",
        description: "Learn proven strategies to improve conversion rates and customer satisfaction. This course covers advanced selling methodologies and practical techniques.",
        duration: "3h 15m",
        instructor: "Michael Chen",
        modules: [
            {
                id: 1,
                title: "The Psychology of Sales",
                duration: "30m",
                type: "video",
                completed: true,
                content: {}
            },
            {
                id: 2,
                title: "Building Rapport Quickly",
                duration: "25m",
                type: "video",
                completed: true,
                content: {}
            },
            {
                id: 3,
                title: "Identifying Customer Needs",
                duration: "20m",
                type: "video",
                completed: true,
                content: {}
            },
            {
                id: 4,
                title: "Effective Questioning Techniques",
                duration: "25m",
                type: "audio",
                completed: true,
                content: {}
            },
            {
                id: 5,
                title: "Value Proposition Delivery",
                duration: "30m",
                type: "video",
                completed: true,
                content: {}
            },
            {
                id: 6,
                title: "Handling Price Objections",
                duration: "20m",
                type: "video",
                completed: true,
                content: {}
            },
            {
                id: 7,
                title: "Closing Strategies",
                duration: "25m",
                type: "video",
                completed: true,
                content: {}
            },
            {
                id: 8,
                title: "Practice: Role Play Scenarios",
                duration: "15m",
                type: "audio",
                completed: false,
                content: {}
            },
            {
                id: 9,
                title: "Follow-Up Best Practices",
                duration: "15m",
                type: "document",
                completed: false,
                content: {}
            },
            {
                id: 10,
                title: "CRM Integration Tips",
                duration: "10m",
                type: "video",
                completed: false,
                content: {}
            },
            {
                id: 11,
                title: "Performance Metrics",
                duration: "10m",
                type: "document",
                completed: false,
                content: {}
            },
            {
                id: 12,
                title: "Final Assessment",
                duration: "20m",
                type: "quiz",
                completed: false,
                content: {}
            }
        ]
    }
};

// Default course for undefined IDs
const defaultCourse = {
    id: "default",
    title: "Course Not Found",
    description: "This course is not available or is still being developed.",
    duration: "N/A",
    instructor: "N/A",
    modules: []
};

export default function CourseDetailPage() {
    const params = useParams();
    const router = useRouter();
    const courseId = params.courseId as string;

    const course = courseData[courseId] || defaultCourse;
    const [expandedModule, setExpandedModule] = useState<number | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    const completedModules = course.modules.filter((m: any) => m.completed).length;
    const progress = course.modules.length > 0
        ? Math.round((completedModules / course.modules.length) * 100)
        : 0;

    const getTypeIcon = (type: string) => {
        switch (type) {
            case "video": return <Video className="w-4 h-4" />;
            case "audio": return <Headphones className="w-4 h-4" />;
            case "document": return <FileText className="w-4 h-4" />;
            case "quiz": return <CheckCircle className="w-4 h-4" />;
            default: return <FileText className="w-4 h-4" />;
        }
    };

    return (
        <DashboardLayout>
            <div className="space-y-6">
                {/* Back Button */}
                <button
                    onClick={() => router.push("/agent/education")}
                    className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
                >
                    <ArrowLeft size={18} />
                    <span className="text-sm font-medium">Back to Courses</span>
                </button>

                {/* Course Header */}
                <div className="glass-card p-6 rounded-2xl border border-white/5">
                    <div className="flex flex-col lg:flex-row gap-6">
                        {/* Thumbnail */}
                        <div className="w-full lg:w-80 h-48 bg-gradient-to-br from-indigo-600/30 to-purple-600/30 rounded-xl flex items-center justify-center">
                            <div className="p-4 rounded-full bg-white/10">
                                <Play className="w-8 h-8 text-white" />
                            </div>
                        </div>

                        {/* Info */}
                        <div className="flex-1">
                            <h1 className="text-2xl font-bold text-white mb-2">{course.title}</h1>
                            <p className="text-white/50 text-sm mb-4">{course.description}</p>

                            <div className="flex flex-wrap items-center gap-4 mb-4 text-sm text-white/60">
                                <span className="flex items-center gap-1">
                                    <Clock size={14} />
                                    {course.duration}
                                </span>
                                <span>{course.modules.length} modules</span>
                                <span>By {course.instructor}</span>
                            </div>

                            {/* Progress */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-white/60">Progress</span>
                                    <span className="text-white font-bold">{progress}%</span>
                                </div>
                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Modules List */}
                <div className="space-y-3">
                    <h3 className="text-lg font-bold tracking-tight text-white uppercase tracking-[0.1em]">
                        Course Modules
                    </h3>

                    {course.modules.map((module: any, index: number) => {
                        const isExpanded = expandedModule === module.id;
                        const isLocked = index > 0 && !course.modules[index - 1].completed && !module.completed;

                        return (
                            <div
                                key={module.id}
                                className={`glass-card rounded-xl border border-white/5 overflow-hidden transition-all ${isLocked ? "opacity-50" : ""
                                    }`}
                            >
                                <button
                                    onClick={() => !isLocked && setExpandedModule(isExpanded ? null : module.id)}
                                    className="w-full p-4 flex items-center gap-4 hover:bg-white/5 transition-colors"
                                    disabled={isLocked}
                                >
                                    {/* Status */}
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${module.completed
                                            ? "bg-emerald-500/20 text-emerald-400"
                                            : isLocked
                                                ? "bg-white/5 text-white/30"
                                                : "bg-white/10 text-white/60"
                                        }`}>
                                        {module.completed ? (
                                            <CheckCircle size={16} />
                                        ) : isLocked ? (
                                            <Lock size={14} />
                                        ) : (
                                            <span className="text-xs font-bold">{index + 1}</span>
                                        )}
                                    </div>

                                    {/* Type Icon */}
                                    <div className="text-white/40">
                                        {getTypeIcon(module.type)}
                                    </div>

                                    {/* Title */}
                                    <div className="flex-1 text-left">
                                        <h4 className="font-medium text-white text-sm">{module.title}</h4>
                                        <p className="text-xs text-white/40">{module.duration}</p>
                                    </div>

                                    {/* Expand Icon */}
                                    {!isLocked && (
                                        <div className="text-white/40">
                                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                        </div>
                                    )}
                                </button>

                                {/* Expanded Content */}
                                {isExpanded && !isLocked && (
                                    <div className="p-4 pt-0 border-t border-white/5">
                                        {/* Video/Audio Player Placeholder */}
                                        {(module.type === "video" || module.type === "audio") && (
                                            <div className="bg-black/40 rounded-xl p-4 mb-4">
                                                <div className="aspect-video bg-black/60 rounded-lg flex items-center justify-center mb-4">
                                                    <button
                                                        onClick={() => setIsPlaying(!isPlaying)}
                                                        className="p-4 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                                                    >
                                                        {isPlaying ? (
                                                            <Pause className="w-8 h-8 text-white" />
                                                        ) : (
                                                            <Play className="w-8 h-8 text-white" />
                                                        )}
                                                    </button>
                                                </div>

                                                {/* Controls */}
                                                <div className="flex items-center gap-4">
                                                    <button
                                                        onClick={() => setIsPlaying(!isPlaying)}
                                                        className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                                                    >
                                                        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                                                    </button>
                                                    <div className="flex-1 h-1 bg-white/20 rounded-full">
                                                        <div className="w-1/3 h-full bg-indigo-500 rounded-full" />
                                                    </div>
                                                    <span className="text-xs text-white/60">5:23 / {module.duration}</span>
                                                    <Volume2 size={16} className="text-white/40" />
                                                    <Maximize2 size={16} className="text-white/40" />
                                                </div>
                                            </div>
                                        )}

                                        {/* Mark Complete Button */}
                                        {!module.completed && (
                                            <button className="w-full py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm transition-colors">
                                                Mark as Complete
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </DashboardLayout>
    );
}
