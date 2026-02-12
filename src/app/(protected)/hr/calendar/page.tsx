"use client";

import React from 'react';
import DashboardLayout from "@/components/layout/DashboardLayout";
import HRCalendar from "@/components/hr/HRCalendar";

export default function HRCalendarPage() {
    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div>
                    <h2 className="text-4xl font-bold tracking-tight text-white">Training Calendar</h2>
                    <p className="text-white/60 text-lg mt-1">View scheduled training sessions and track attendance.</p>
                </div>

                <HRCalendar />
            </div>
        </DashboardLayout>
    );
}
