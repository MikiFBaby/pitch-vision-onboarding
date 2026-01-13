"use client";
import React, { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { QAProvider } from "@/context/QAContext";
import { useRouter, usePathname } from "next/navigation";

export default function ProtectedLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, profile, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    // Check for QA Lockdown mode
    const isQaLocked = process.env.NEXT_PUBLIC_QA_ONLY === 'true';

    useEffect(() => {
        // 1. Temporary Bypass: Allow public access to QA portal for internal testing
        if (pathname.startsWith('/qa')) {
            return;
        }

        // If in QA Lockdown mode and on the QA path, allow access without user
        if (isQaLocked && pathname.startsWith('/qa')) {
            return;
        }

        if (!loading && !user) {
            router.push("/login");
            return;
        }

        if (!loading && user && profile) {
            // Check if user is accessing a role-specific route
            const pathSegments = pathname.split('/');
            // The role is usually the second segment e.g., /agent, /hr
            const currentSection = pathSegments[1];

            // List of protected role roots
            const protectedRoles = ['agent', 'qa', 'manager', 'hr', 'executive', 'partner'];

            // Admin Access Override for miki@pitchperfectsolutions.net
            if (user.email === 'miki@pitchperfectsolutions.net') {
                return;
            }

            if (protectedRoles.includes(currentSection)) {
                // If the current section doesn't match the user's role (and they are not admin/super user), redirect
                /*
                if (currentSection !== profile.role) {
                    console.warn(`Unauthorized access attempt: User ${profile.role} tried to access ${currentSection}`);
                    router.push(`/${profile.role}`);
                }
                */
            }
        }
    }, [user, profile, loading, router, pathname]);

    if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

    // Allow rendering if user exists OR if it's the QA portal (bypassed)
    if (!user && !isQaLocked && !pathname.startsWith('/qa')) return null;

    return (
        <QAProvider>
            {children}
        </QAProvider>
    );
}
