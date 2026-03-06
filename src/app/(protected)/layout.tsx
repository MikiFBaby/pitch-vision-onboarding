"use client";
import React, { useEffect, Suspense } from "react";
import { useAuth } from "@/context/AuthContext";
import { QAProvider } from "@/context/QAContext";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

function ProtectedLayoutInner({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, profile, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Check for QA Lockdown mode
    const isQaLocked = process.env.NEXT_PUBLIC_QA_ONLY === 'true';

    // Hide floating button on Aura AI page (already has voice there)
    const isAuraPage = pathname === '/qa' && searchParams.get('view') === 'aura';

    useEffect(() => {
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
            const protectedRoles = ['agent', 'qa', 'manager', 'hr', 'executive', 'payroll'];

            // Admin Access Override for miki@pitchperfectsolutions.net
            if (user.email === 'miki@pitchperfectsolutions.net') {
                return;
            }

            // Portal access gate — redirect to thank-you page if portal is disabled for this role
            if (currentSection === profile.role && !profile.portal_access) {
                router.push('/onboarding/complete');
                return;
            }

            // HR sub-route restrictions for users with limited permissions
            if (currentSection === 'hr' && profile.role === 'hr' && profile.hr_permissions?.allowed_pages?.length) {
                const allowedPages = profile.hr_permissions.allowed_pages as string[];
                const hrSubPath = pathSegments[2]; // e.g. "onboarding", "directory", "calendar"
                if (!hrSubPath || !allowedPages.includes(hrSubPath)) {
                    router.push(`/hr/${allowedPages[0]}`);
                    return;
                }
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
    if (!user && !isQaLocked) return null;

    return (
        <QAProvider>
            {children}
        </QAProvider>
    );
}

// Wrapper with Suspense for useSearchParams compatibility with Next.js 16+
export default function ProtectedLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <Suspense fallback={
            <div className="flex h-screen items-center justify-center bg-gray-950 text-white">
                Loading...
            </div>
        }>
            <ProtectedLayoutInner>
                {children}
            </ProtectedLayoutInner>
        </Suspense>
    );
}
