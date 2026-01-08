"use client";
import React, { useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Calendar, Plus, Users, FileText, TrendingUp, Award } from 'lucide-react';

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end?: string;
    backgroundColor?: string;
    borderColor?: string;
    textColor?: string;
    extendedProps?: {
        category?: 'interview' | 'orientation' | 'review' | 'meeting' | 'deadline' | 'event';
    };
}

const EVENT_CATEGORIES = {
    interview: { bg: '#3b82f6', border: '#2563eb', label: 'Interview', icon: Users },
    orientation: { bg: '#10b981', border: '#059669', label: 'Orientation', icon: FileText },
    review: { bg: '#f59e0b', border: '#d97706', label: 'Review', icon: TrendingUp },
    meeting: { bg: '#8b5cf6', border: '#7c3aed', label: 'Meeting', icon: Calendar },
    deadline: { bg: '#ef4444', border: '#dc2626', label: 'Deadline', icon: Award },
    event: { bg: '#ec4899', border: '#db2777', label: 'Event', icon: Calendar }
};

export default function HRCalendar() {
    const [events, setEvents] = useState<CalendarEvent[]>([
        {
            id: '1',
            title: 'New Hire Orientation',
            start: '2026-01-06T09:00:00',
            end: '2026-01-06T12:00:00',
            backgroundColor: EVENT_CATEGORIES.orientation.bg,
            borderColor: EVENT_CATEGORIES.orientation.border,
            textColor: '#fff',
            extendedProps: { category: 'orientation' }
        },
        {
            id: '2',
            title: 'Performance Review - Sales Team',
            start: '2026-01-08T14:00:00',
            end: '2026-01-08T16:00:00',
            backgroundColor: EVENT_CATEGORIES.review.bg,
            borderColor: EVENT_CATEGORIES.review.border,
            textColor: '#fff',
            extendedProps: { category: 'review' }
        },
        {
            id: '3',
            title: 'Recruitment Meeting',
            start: '2026-01-09T10:00:00',
            end: '2026-01-09T11:30:00',
            backgroundColor: EVENT_CATEGORIES.meeting.bg,
            borderColor: EVENT_CATEGORIES.meeting.border,
            textColor: '#fff',
            extendedProps: { category: 'meeting' }
        },
        {
            id: '4',
            title: 'Benefits Enrollment Deadline',
            start: '2026-01-15',
            backgroundColor: EVENT_CATEGORIES.deadline.bg,
            borderColor: EVENT_CATEGORIES.deadline.border,
            textColor: '#fff',
            extendedProps: { category: 'deadline' }
        },
        {
            id: '5',
            title: 'Team Building Event',
            start: '2026-01-20T13:00:00',
            end: '2026-01-20T17:00:00',
            backgroundColor: EVENT_CATEGORIES.event.bg,
            borderColor: EVENT_CATEGORIES.event.border,
            textColor: '#fff',
            extendedProps: { category: 'event' }
        },
        {
            id: '6',
            title: 'Software Engineer Interview',
            start: '2026-01-12T10:00:00',
            end: '2026-01-12T11:00:00',
            backgroundColor: EVENT_CATEGORIES.interview.bg,
            borderColor: EVENT_CATEGORIES.interview.border,
            textColor: '#fff',
            extendedProps: { category: 'interview' }
        }
    ]);

    const [selectedCategory, setSelectedCategory] = useState<keyof typeof EVENT_CATEGORIES>('meeting');

    const handleDateClick = (arg: any) => {
        const title = prompt('Enter Event Title:');
        if (title) {
            const category = selectedCategory;
            const newEvent: CalendarEvent = {
                id: String(Date.now()),
                title,
                start: arg.dateStr,
                backgroundColor: EVENT_CATEGORIES[category].bg,
                borderColor: EVENT_CATEGORIES[category].border,
                textColor: '#fff',
                extendedProps: { category }
            };
            setEvents([...events, newEvent]);
        }
    };

    const handleEventClick = (info: any) => {
        if (confirm(`Delete event '${info.event.title}'?`)) {
            setEvents(events.filter(event => event.id !== info.event.id));
        }
    };

    const handleEventDrop = (info: any) => {
        setEvents(events.map(event =>
            event.id === info.event.id
                ? { ...event, start: info.event.startStr, end: info.event.endStr || undefined }
                : event
        ));
    };

    return (
        <div className="glass-card p-8 rounded-2xl border-white/5 bg-white/5">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-500/20 rounded-lg">
                        <Calendar className="w-5 h-5 text-rose-500" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white uppercase tracking-wider">HR Calendar</h3>
                        <p className="text-xs text-white/50">Schedule interviews, meetings, and events</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value as keyof typeof EVENT_CATEGORIES)}
                        className="px-3 py-2 bg-white/5 text-white rounded-lg text-sm font-semibold border border-white/10 focus:outline-none focus:ring-2 focus:ring-rose-500 [&>option]:bg-[#1a1a1a]"
                    >
                        {Object.entries(EVENT_CATEGORIES).map(([key, value]) => (
                            <option key={key} value={key}>{value.label}</option>
                        ))}
                    </select>
                    <button
                        className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition-all text-sm font-semibold shadow-lg shadow-rose-500/30"
                        onClick={() => handleDateClick({ dateStr: new Date().toISOString().split('T')[0] })}
                    >
                        <Plus size={16} />
                        Add Event
                    </button>
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-6 pb-6 border-b border-white/10">
                {Object.entries(EVENT_CATEGORIES).map(([key, value]) => {
                    const Icon = value.icon;
                    return (
                        <div key={key} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
                            <div className="w-3 h-3 rounded" style={{ backgroundColor: value.bg }}></div>
                            <Icon size={14} className="text-white/70" />
                            <span className="text-xs font-semibold text-white/70">{value.label}</span>
                        </div>
                    );
                })}
            </div>

            <div className="fullcalendar-wrapper">
                <FullCalendar
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    headerToolbar={{
                        left: 'prev,next today',
                        center: 'title',
                        right: 'dayGridMonth,timeGridWeek,timeGridDay'
                    }}
                    events={events}
                    dateClick={handleDateClick}
                    eventClick={handleEventClick}
                    eventDrop={handleEventDrop}
                    editable={true}
                    selectable={true}
                    selectMirror={true}
                    dayMaxEvents={true}
                    weekends={true}
                    height="auto"
                    eventTimeFormat={{
                        hour: '2-digit',
                        minute: '2-digit',
                        meridiem: 'short'
                    }}
                />
            </div>

            <style jsx global>{`
                .fullcalendar-wrapper {
                    --fc-border-color: rgba(255, 255, 255, 0.1);
                    --fc-button-bg-color: #f43f5e;
                    --fc-button-border-color: #f43f5e;
                    --fc-button-hover-bg-color: #e11d48;
                    --fc-button-hover-border-color: #e11d48;
                    --fc-button-active-bg-color: #be123c;
                    --fc-button-active-border-color: #be123c;
                    --fc-today-bg-color: rgba(244, 63, 94, 0.1);
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
                    padding: 10px;
                    font-size: 14px;
                }

                .fc .fc-daygrid-day.fc-day-today {
                    background-color: var(--fc-today-bg-color) !important;
                }

                .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number {
                    color: white;
                    font-weight: 700;
                    background: #f43f5e;
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

                .fc-event {
                    border-radius: 6px;
                    padding: 4px 6px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
                    border: none;
                }

                .fc-event:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                    filter: brightness(1.1);
                }

                .fc .fc-toolbar-title {
                    color: white;
                    font-size: 20px;
                    font-weight: 700;
                }

                .fc .fc-daygrid-event-harness {
                    margin: 3px 2px;
                }

                .fc .fc-daygrid-day-frame {
                    min-height: 100px;
                }

                .fc .fc-timegrid-slot-label {
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 11px;
                    font-weight: 600;
                }

                .fc .fc-timegrid-slot {
                    background: transparent;
                }
                
                .fc .fc-timegrid-slot:hover {
                    background: rgba(255, 255, 255, 0.02);
                }

                .fc .fc-timegrid-axis {
                    background: transparent;
                }
            `}</style>
        </div>
    );
}
