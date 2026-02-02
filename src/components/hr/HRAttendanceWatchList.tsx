"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Eye, TrendingUp } from "lucide-react";
import { toTitleCase } from "@/lib/hr-utils";

interface WatchListAgent {
    name: string;
    absenceCount: number;
    isActive: boolean;
}

export default function HRAttendanceWatchList() {
    const [loading, setLoading] = useState(true);
    const [watchList, setWatchList] = useState<WatchListAgent[]>([]);
    const [activeAgentNames, setActiveAgentNames] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchData();

        const channel = supabase
            .channel('attendance_watchlist')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Agent Attendance Watch List' }, fetchData)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const fetchData = async () => {
        setLoading(true);

        try {
            // Get active agents from Agent Schedule (current workforce)
            const { data: schedules } = await supabase
                .from('Agent Schedule')
                .select('"First Name", "Last Name"');

            const activeNames = new Set<string>();
            schedules?.forEach((agent: any) => {
                const fullName = `${agent['First Name']} ${agent['Last Name']}`.trim().toLowerCase();
                activeNames.add(fullName);
            });
            setActiveAgentNames(activeNames);

            // Get attendance watch list data
            const { data: watchData } = await supabase
                .from('Agent Attendance Watch List')
                .select('*')
                .order('"COUNTA of Reason"', { ascending: false });

            if (!watchData || watchData.length === 0) {
                setWatchList([]);
                setLoading(false);
                return;
            }

            // Process and filter to active agents only
            const processed: WatchListAgent[] = watchData
                .filter((row: any) => row['Agent Name'] && row['Agent Name'].trim() !== '')
                .map((row: any) => {
                    const name = row['Agent Name']?.trim() || '';
                    const isActive = activeNames.has(name.toLowerCase());
                    return {
                        name: toTitleCase(name),
                        absenceCount: parseInt(row['COUNTA of Reason']) || 0,
                        isActive
                    };
                })
                .filter((agent: WatchListAgent) => agent.isActive && agent.absenceCount > 0)
                .slice(0, 10); // Top 10 repeat offenders

            setWatchList(processed);

        } catch (error) {
            console.error("Error fetching attendance watch list:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <Skeleton className="h-[300px] w-full rounded-2xl" />;
    }

    const getCountColor = (count: number) => {
        if (count >= 5) return 'text-red-400 bg-red-500/20';
        if (count >= 3) return 'text-amber-400 bg-amber-500/20';
        return 'text-yellow-400 bg-yellow-500/20';
    };

    const getBarWidth = (count: number) => {
        const max = Math.max(...watchList.map(a => a.absenceCount), 1);
        return `${(count / max) * 100}%`;
    };

    return (
        <Card className="bg-gradient-to-br from-red-500/10 to-orange-500/10 border-white/10 text-white overflow-hidden">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <Eye className="w-5 h-5 text-amber-400" />
                    Attendance Watch List
                    <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full ml-2">
                        Active Agents Only
                    </span>
                </CardTitle>
                <p className="text-xs text-white/40 mt-1">
                    Agents with repeated unscheduled absences
                </p>
            </CardHeader>
            <CardContent>
                {watchList.length === 0 ? (
                    <div className="h-[200px] flex flex-col items-center justify-center text-white/30">
                        <TrendingUp className="w-10 h-10 mb-2 text-green-400" />
                        <span>No attendance issues detected</span>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {watchList.map((agent, index) => (
                            <div key={agent.name} className="flex items-center gap-3">
                                {/* Rank */}
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index < 3 ? 'bg-red-500 text-white' : 'bg-white/10 text-white/60'
                                    }`}>
                                    {index + 1}
                                </div>

                                {/* Name & Bar */}
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm font-medium truncate max-w-[180px]" title={agent.name}>
                                            {agent.name}
                                        </span>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getCountColor(agent.absenceCount)}`}>
                                            {agent.absenceCount} {agent.absenceCount === 1 ? 'absence' : 'absences'}
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${agent.absenceCount >= 5 ? 'bg-red-500' :
                                                    agent.absenceCount >= 3 ? 'bg-amber-500' : 'bg-yellow-500'
                                                }`}
                                            style={{ width: getBarWidth(agent.absenceCount) }}
                                        />
                                    </div>
                                </div>

                                {/* Warning Icon for high count */}
                                {agent.absenceCount >= 3 && (
                                    <AlertTriangle className={`w-4 h-4 ${agent.absenceCount >= 5 ? 'text-red-400' : 'text-amber-400'}`} />
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
