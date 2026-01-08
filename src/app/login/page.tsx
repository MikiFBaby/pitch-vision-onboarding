"use client";
import React, { useEffect, useState, Suspense } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { SignInPage } from "@/components/ui/sign-in";

// Role-specific content mapping
const ROLE_CONTENT: Record<string, { title: string; description: string; heroImage: string }> = {
    agent: {
        title: "Agent Portal",
        description: "Your voice, amplified. Sign in to access your intelligence dashboard and track your performance.",
        heroImage: "/images/login-hero-ai.png"
    },
    qa: {
        title: "QA Analysis",
        description: "Precision performance verification. Access the analytical lens to review and validate call quality.",
        heroImage: "/images/login-hero-ai.png"
    },
    manager: {
        title: "Strategic Hub",
        description: "Lead with insight. Coordinate your team's collective intelligence and drive strategic improvement.",
        heroImage: "/images/login-hero-ai.png"
    },
    hr: {
        title: "HR Portal",
        description: "Empower your workforce. Access talent analytics, manage recruitment, and drive employee success.",
        heroImage: "/images/login-hero-ai.png"
    },
    executive: {
        title: "Visionary Nexus",
        description: "Strategic oversight and global performance analytics. Access the high-level intelligence dashboard.",
        heroImage: "/images/login-hero-ai.png"
    },
    partner: {
        title: "Synthesis Gate",
        description: "Growth through collaborative intelligence. Access your partner resources and manage shared goals.",
        heroImage: "/images/login-hero-ai.png"
    }
};

const DEFAULT_CONTENT = {
    title: "Intelligence Hub",
    description: "Welcome to Pitch Vision. Sign in to access your role-specific dashboard and analytics.",
    heroImage: "/images/login-hero-ai.png"
};

function LoginForm() {
    const { user, signInWithGoogle, loginWithEmail, signupWithEmail, loading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const roleId = searchParams.get("role") || "";
    const mode = searchParams.get("mode");

    const emailParam = searchParams.get("email") || "";

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSignup, setIsSignup] = useState(mode === "signup");

    const content = ROLE_CONTENT[roleId] || DEFAULT_CONTENT;

    const validateUserWithBackend = async (firebaseUid: string, email: string) => {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firebaseUid, email })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Login failed');
        }

        if (roleId && data.user.role !== roleId) {
            throw new Error(`This account is registered as ${data.user.role}, not ${roleId}`);
        }

        if (data.user.status !== 'active') {
            throw new Error('Your account is not active. Contact your administrator.');
        }

        return data;
    };

    const handleSignupBackend = async (firebaseUid: string, email: string, role: string) => {
        const response = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firebaseUid, email, role })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Registration failed');
        return data;
    };

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        setError(null);
        try {
            await signInWithGoogle();
        } catch (error: any) {
            console.error("Login failed", error);
            setError(error.message);
            setIsLoading(false);
        }
    };

    const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        const formData = new FormData(e.currentTarget);
        const email = formData.get("email") as string;
        const password = formData.get("password") as string;

        try {
            if (isSignup) {
                await signupWithEmail(email, password, "");
            } else {
                await loginWithEmail(email, password);
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message || (isSignup ? "Registration failed." : "Authentication failed. Please check your credentials."));
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const syncUser = async () => {
            if (user && !loading && isLoading) {
                try {
                    if (isSignup) {
                        await handleSignupBackend(user.uid, user.email || '', roleId);
                        setError(null);
                        router.push('/onboarding');
                    } else {
                        const data = await validateUserWithBackend(user.uid, user.email || '');
                        setError(null);
                        router.push(data.redirectTo);
                    }
                } catch (err: any) {
                    setError(err.message);
                    setIsLoading(false);
                }
            }
        };
        syncUser();
    }, [user, loading, isLoading, router, roleId, isSignup]);

    const handleToggleMode = () => {
        setIsSignup(!isSignup);
        setError(null);
    };

    const handleResetPassword = () => {
        alert("Password reset instructions will be sent to your email.");
    };

    return (
        <SignInPage
            title={isSignup ? "Join Pitch Vision" : content.title}
            description={error ? <span className="text-red-400 font-medium">{error}</span> : (isSignup ? "Create your account to access the Pitch Vision Intelligence Hub." : content.description)}
            heroImageSrc={content.heroImage}
            onSignIn={handleFormSubmit}
            onGoogleSignIn={handleGoogleLogin}
            onResetPassword={handleResetPassword}
            onCreateAccount={handleToggleMode}
            isLoading={isLoading || loading}
            buttonText={isSignup ? "Create Account" : "Authorize Access"}
            showRememberMe={!isSignup}
            showCreateAccount={!isSignup}
            defaultEmailValue={emailParam}
            emailReadOnly={isSignup && !!emailParam}
        />
    );
}

export default function LoginPage() {
    return (
        <div className="min-h-screen w-screen bg-black">
            <Suspense fallback={<div className="min-h-screen w-screen flex items-center justify-center bg-black text-white">Loading...</div>}>
                <LoginForm />
            </Suspense>
        </div>
    );
}
