"use client";
import React, { useState, useEffect, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Calendar, GraduationCap, X, UserX, UserCheck, Users, CalendarDays, TrendingDown, CalendarClock } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { motion, AnimatePresence } from 'framer-motion';

interface Trainee {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    training_no_show: boolean;
}

interface DayGroup {
    date: string;
    trainees: Trainee[];
}

export default function HRCalendar() {
    const [dayGroups, setDayGroups] = useState<Map<string, Trainee[]>>(new Map());
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const fetchTrainees = useCallback(async () => {
        const { data, error } = await supabase
            .from('onboarding_new_hires')
            .select('id, first_name, last_name, email, training_start_date, training_no_show')
            .not('training_start_date', 'is', null);

        if (error) {
            console.error('Error fetching training data:', error);
            return;
        }

        const groups = new Map<string, Trainee[]>();
        (data || []).forEach((hire: any) => {
            const date = hire.training_start_date;
            if (!date) return;
            const existing = groups.get(date) || [];
            existing.push({
                id: hire.id,
                first_name: hire.first_name,
                last_name: hire.last_name,
                email: hire.email || '',
                training_no_show: hire.training_no_show || false,
            });
            groups.set(date, existing);
        });

        setDayGroups(groups);
    }, []);

    useEffect(() => {
        fetchTrainees();

        const channel = supabase
            .channel('training_calendar')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'onboarding_new_hires' }, () => fetchTrainees())
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchTrainees]);

    const toggleNoShow = async (traineeId: string, currentValue: boolean) => {
        setUpdatingId(traineeId);
        const { error } = await supabase
            .from('onboarding_new_hires')
            .update({ training_no_show: !currentValue })
            .eq('id', traineeId);

        if (error) {
            console.error('Error toggling no-show:', error);
        } else {
            // Optimistic update
            setDayGroups(prev => {
                const next = new Map(prev);
                for (const [date, trainees] of next.entries()) {
                    const updated = trainees.map(t =>
                        t.id === traineeId ? { ...t, training_no_show: !currentValue } : t
                    );
                    next.set(date, updated);
                }
                return next;
            });
        }
        setUpdatingId(null);
    };

    // Build FullCalendar events - just counts per day
    const calendarEvents = Array.from(dayGroups.entries()).map(([date, trainees]) => {
        const noShowCount = trainees.filter(t => t.training_no_show).length;
        const attendedCount = trainees.length - noShowCount;
        return {
            id: `day-${date}`,
            start: date,
            allDay: true,
            display: 'background' as const,
            backgroundColor: 'transparent',
            extendedProps: { count: trainees.length, attended: attendedCount, noShows: noShowCount },
        };
    });

    const selectedTrainees = selectedDate ? (dayGroups.get(selectedDate) || []) : [];
    const selectedNoShows = selectedTrainees.filter(t => t.training_no_show).length;
    const selectedAttended = selectedTrainees.length - selectedNoShows;

    // Compute stats for data cards
    const todayStr = new Date().toLocaleDateString('en-CA');
    const todayTrainees = dayGroups.get(todayStr) || [];

    // This week (Mon-Sun)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const mondayStr = monday.toLocaleDateString('en-CA');
    const sundayStr = sunday.toLocaleDateString('en-CA');

    let weekTrainees = 0;
    let weekNoShows = 0;

    // All-time totals
    let totalScheduled = 0;
    let totalNoShows = 0;

    // Next upcoming session
    let nextSessionDate: string | null = null;
    let nextSessionCount = 0;

    for (const [date, trainees] of dayGroups.entries()) {
        totalScheduled += trainees.length;
        totalNoShows += trainees.filter(t => t.training_no_show).length;

        if (date >= mondayStr && date <= sundayStr) {
            weekTrainees += trainees.length;
            weekNoShows += trainees.filter(t => t.training_no_show).length;
        }

        if (date > todayStr && (!nextSessionDate || date < nextSessionDate)) {
            nextSessionDate = date;
            nextSessionCount = trainees.length;
        }
    }

    const noShowRate = totalScheduled > 0 ? ((totalNoShows / totalScheduled) * 100).toFixed(1) : '0.0';

    const statCards = [
        {
            label: 'Today',
            value: todayTrainees.length,
            sub: todayTrainees.length > 0 ? `${todayTrainees.filter(t => t.training_no_show).length} no-show` : 'No sessions',
            icon: <Users size={18} />,
            color: 'violet',
        },
        {
            label: 'This Week',
            value: weekTrainees,
            sub: weekNoShows > 0 ? `${weekNoShows} no-show` : 'All present',
            icon: <CalendarDays size={18} />,
            color: 'blue',
        },
        {
            label: 'No-Show Rate',
            value: `${noShowRate}%`,
            sub: `${totalNoShows} of ${totalScheduled} total`,
            icon: <TrendingDown size={18} />,
            color: parseFloat(noShowRate) > 15 ? 'red' : parseFloat(noShowRate) > 5 ? 'amber' : 'emerald',
        },
        {
            label: 'Next Session',
            value: nextSessionDate ? new Date(nextSessionDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—',
            sub: nextSessionDate ? `${nextSessionCount} trainee${nextSessionCount !== 1 ? 's' : ''}` : 'None scheduled',
            icon: <CalendarClock size={18} />,
            color: 'cyan',
        },
    ];

    const colorMap: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
        violet: { bg: 'bg-violet-500/10', border: 'border-violet-500/20', text: 'text-violet-400', iconBg: 'bg-violet-500/20' },
        blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', iconBg: 'bg-blue-500/20' },
        red: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', iconBg: 'bg-red-500/20' },
        amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', iconBg: 'bg-amber-500/20' },
        emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', iconBg: 'bg-emerald-500/20' },
        cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400', iconBg: 'bg-cyan-500/20' },
    };

    return (
        <div className="space-y-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((card) => {
                    const c = colorMap[card.color] || colorMap.violet;
                    return (
                        <div key={card.label} className={`${c.bg} border ${c.border} rounded-2xl p-4 flex items-center gap-4`}>
                            <div className={`${c.iconBg} p-2.5 rounded-xl ${c.text}`}>
                                {card.icon}
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider">{card.label}</p>
                                <p className={`text-xl font-bold ${c.text}`}>{card.value}</p>
                                <p className="text-[11px] text-white/40">{card.sub}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

        <div className="glass-card p-8 rounded-2xl border-white/5 bg-white/5">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-violet-500/20 rounded-lg">
                        <Calendar className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white uppercase tracking-wider">Training Calendar</h3>
                        <p className="text-xs text-white/60">Click any day to view scheduled trainees and mark attendance</p>
                    </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-2 text-white/60">
                        <span className="w-3 h-3 rounded-full bg-violet-500 inline-block" />
                        Scheduled
                    </span>
                    <span className="flex items-center gap-2 text-white/60">
                        <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                        No-Show
                    </span>
                </div>
            </div>

            <div className="fullcalendar-wrapper">
                <FullCalendar
                    plugins={[dayGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    headerToolbar={{
                        left: 'prev,next today',
                        center: 'title',
                        right: ''
                    }}
                    events={calendarEvents}
                    dateClick={(arg) => {
                        const dateStr = arg.dateStr;
                        if (dayGroups.has(dateStr)) {
                            setSelectedDate(dateStr);
                        }
                    }}
                    dayCellContent={(arg) => {
                        const dateStr = arg.date.toLocaleDateString('en-CA');
                        const trainees = dayGroups.get(dateStr);
                        const count = trainees?.length || 0;
                        const noShows = trainees?.filter(t => t.training_no_show).length || 0;

                        return (
                            <div className="w-full flex flex-col items-center gap-1 py-1">
                                <span className="fc-daygrid-day-number">{arg.dayNumberText}</span>
                                {count > 0 && (
                                    <div className="flex items-center gap-1.5 cursor-pointer">
                                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-400/30">
                                            <GraduationCap size={12} className="text-violet-400" />
                                            <span className="text-xs font-bold text-violet-300">{count}</span>
                                        </div>
                                        {noShows > 0 && (
                                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/20 border border-red-400/30">
                                                <span className="text-[10px] font-bold text-red-400">{noShows} NS</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    }}
                    selectable={false}
                    dayMaxEvents={false}
                    weekends={true}
                    height="auto"
                    fixedWeekCount={false}
                />
            </div>

            {/* Day Detail Modal */}
            <AnimatePresence>
                {selectedDate && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setSelectedDate(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.2 }}
                            className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="p-5 border-b border-white/10">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-violet-500/20 rounded-lg">
                                            <GraduationCap className="w-5 h-5 text-violet-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white">
                                                Training — {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                            </h3>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className="text-xs text-white/60">{selectedTrainees.length} scheduled</span>
                                                {selectedAttended > 0 && (
                                                    <span className="text-xs text-emerald-400">{selectedAttended} attended</span>
                                                )}
                                                {selectedNoShows > 0 && (
                                                    <span className="text-xs text-red-400">{selectedNoShows} no-show</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedDate(null)}
                                        className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Trainee List */}
                            <div className="p-5 overflow-y-auto max-h-[60vh] space-y-2">
                                {selectedTrainees.length === 0 ? (
                                    <p className="text-white/50 text-sm text-center py-8">No trainees scheduled for this day.</p>
                                ) : (
                                    selectedTrainees.map((trainee) => (
                                        <div
                                            key={trainee.id}
                                            className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                                                trainee.training_no_show
                                                    ? 'bg-red-500/10 border-red-500/20'
                                                    : 'bg-white/5 border-white/10 hover:border-white/20'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                                                    trainee.training_no_show
                                                        ? 'bg-red-500/20 text-red-400'
                                                        : 'bg-violet-500/20 text-violet-300'
                                                }`}>
                                                    {trainee.first_name?.[0]}{trainee.last_name?.[0]}
                                                </div>
                                                <div>
                                                    <p className={`text-sm font-semibold ${trainee.training_no_show ? 'text-white/50 line-through' : 'text-white'}`}>
                                                        {trainee.first_name} {trainee.last_name || ''}
                                                    </p>
                                                    <p className="text-xs text-white/40">{trainee.email}</p>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => toggleNoShow(trainee.id, trainee.training_no_show)}
                                                disabled={updatingId === trainee.id}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                                    trainee.training_no_show
                                                        ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30'
                                                        : 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                                                } ${updatingId === trainee.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                {trainee.training_no_show ? (
                                                    <>
                                                        <UserCheck size={14} />
                                                        Mark Present
                                                    </>
                                                ) : (
                                                    <>
                                                        <UserX size={14} />
                                                        No-Show
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style jsx global>{`
                .fullcalendar-wrapper {
                    --fc-border-color: rgba(255, 255, 255, 0.1);
                    --fc-button-bg-color: #7c3aed;
                    --fc-button-border-color: #7c3aed;
                    --fc-button-hover-bg-color: #6d28d9;
                    --fc-button-hover-border-color: #6d28d9;
                    --fc-button-active-bg-color: #5b21b6;
                    --fc-button-active-border-color: #5b21b6;
                    --fc-today-bg-color: rgba(124, 58, 237, 0.1);
                }

                .fc {
                    color: white;
                    font-family: inherit;
                    background: transparent;
                }

                .fc-view-harness {
                    background: transparent;
                }

                .fc .fc-scrollgrid {
                    background: transparent;
                    border-color: var(--fc-border-color);
                }

                .fc .fc-daygrid-body,
                .fc .fc-daygrid-day,
                .fc .fc-daygrid-day-frame {
                    background: transparent;
                }

                .fc .fc-button {
                    text-transform: uppercase;
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 0.05em;
                    padding: 8px 16px;
                    border-radius: 8px;
                    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
                }

                .fc .fc-button-primary:not(:disabled):active,
                .fc .fc-button-primary:not(:disabled).fc-button-active {
                    background-color: var(--fc-button-active-bg-color);
                    border-color: var(--fc-button-active-border-color);
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }

                .fc .fc-col-header-cell {
                    background: rgba(255, 255, 255, 0.03);
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    padding: 16px 0;
                    color: rgba(255, 255, 255, 0.5);
                    border-color: var(--fc-border-color);
                }

                .fc .fc-daygrid-day-number {
                    color: rgba(255, 255, 255, 0.7);
                    font-weight: 600;
                    font-size: 14px;
                }

                .fc .fc-daygrid-day.fc-day-today {
                    background-color: var(--fc-today-bg-color) !important;
                }

                .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number {
                    color: white;
                    font-weight: 700;
                    background: #7c3aed;
                    border-radius: 50%;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .fc-theme-standard td,
                .fc-theme-standard th {
                    border-color: var(--fc-border-color);
                }

                .fc-theme-standard .fc-scrollgrid {
                    border-color: var(--fc-border-color);
                }

                .fc .fc-daygrid-day:hover {
                    background: rgba(255, 255, 255, 0.05) !important;
                    cursor: pointer;
                }

                .fc .fc-toolbar-title {
                    color: white;
                    font-size: 20px;
                    font-weight: 700;
                }

                .fc .fc-daygrid-day-frame {
                    min-height: 90px;
                }

                /* Hide default event rendering since we use dayCellContent */
                .fc .fc-bg-event {
                    opacity: 0;
                }

                .fc .fc-daygrid-day-top {
                    justify-content: center;
                }
            `}</style>
        </div>
        </div>
    );
}
