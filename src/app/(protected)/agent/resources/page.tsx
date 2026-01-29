"use client";
import React from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { FolderOpen, FileText, Video, Headphones, ExternalLink, Download } from "lucide-react";

// Mock resource data - will be replaced with Supabase data
const resources = [
    {
        id: 1,
        title: "Compliance Guidelines 2024",
        description: "Complete compliance requirements and best practices for call handling.",
        type: "document",
        icon: FileText,
        downloadUrl: "#"
    },
    {
        id: 2,
        title: "Product Knowledge Base",
        description: "Comprehensive guide to all products and services.",
        type: "document",
        icon: FileText,
        downloadUrl: "#"
    },
    {
        id: 3,
        title: "Sales Scripts Library",
        description: "Approved scripts and talk tracks for various scenarios.",
        type: "document",
        icon: FileText,
        downloadUrl: "#"
    },
    {
        id: 4,
        title: "Objection Handling Guide",
        description: "Strategies and responses for common customer objections.",
        type: "document",
        icon: FileText,
        downloadUrl: "#"
    },
    {
        id: 5,
        title: "CRM Quick Reference",
        description: "Step-by-step guides for common CRM tasks.",
        type: "document",
        icon: FileText,
        downloadUrl: "#"
    },
    {
        id: 6,
        title: "Weekly Updates Archive",
        description: "Past announcements and policy updates.",
        type: "folder",
        icon: FolderOpen,
        downloadUrl: "#"
    }
];

export default function ResourceHubPage() {
    return (
        <DashboardLayout>
            <div className="space-y-8">
                {/* Header */}
                <div className="flex flex-col gap-1">
                    <h2 className="text-3xl font-bold tracking-tight text-white group cursor-default">
                        Resource Hub
                        <span className="inline-block ml-2 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </h2>
                    <p className="text-white/50 text-sm font-medium">
                        Access documents, guides, and materials to support your performance.
                    </p>
                </div>

                {/* Quick Stats */}
                <div className="grid gap-4 md:grid-cols-3">
                    <div className="glass-card p-5 rounded-2xl border border-white/5">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-emerald-500/20">
                                <FileText className="w-6 h-6 text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-white">24</p>
                                <p className="text-xs text-white/50 uppercase tracking-wider">Documents</p>
                            </div>
                        </div>
                    </div>
                    <div className="glass-card p-5 rounded-2xl border border-white/5">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-blue-500/20">
                                <Video className="w-6 h-6 text-blue-400" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-white">8</p>
                                <p className="text-xs text-white/50 uppercase tracking-wider">Videos</p>
                            </div>
                        </div>
                    </div>
                    <div className="glass-card p-5 rounded-2xl border border-white/5">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-purple-500/20">
                                <Headphones className="w-6 h-6 text-purple-400" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-white">12</p>
                                <p className="text-xs text-white/50 uppercase tracking-wider">Audio Files</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Resources Grid */}
                <div className="space-y-4">
                    <h3 className="text-lg font-bold tracking-tight text-white uppercase tracking-[0.1em]">
                        Available Resources
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {resources.map((resource) => {
                            const IconComponent = resource.icon;
                            return (
                                <div
                                    key={resource.id}
                                    className="glass-card p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all duration-300 group cursor-pointer"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="p-3 rounded-xl bg-white/5 group-hover:bg-indigo-500/20 transition-colors">
                                            <IconComponent className="w-5 h-5 text-white/60 group-hover:text-indigo-400 transition-colors" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-white text-sm truncate">
                                                {resource.title}
                                            </h4>
                                            <p className="text-xs text-white/40 mt-1 line-clamp-2">
                                                {resource.description}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
                                        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-medium transition-all">
                                            <ExternalLink size={12} />
                                            View
                                        </button>
                                        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-medium transition-all">
                                            <Download size={12} />
                                            Download
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
