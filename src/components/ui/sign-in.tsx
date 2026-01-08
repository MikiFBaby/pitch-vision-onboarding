"use client";

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from "@/lib/utils";

// --- HELPER COMPONENTS (ICONS) ---

const GoogleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s12-5.373 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z" />
        <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z" />
    </svg>
);

// --- TYPE DEFINITIONS ---

interface SignInPageProps {
    title?: React.ReactNode;
    description?: React.ReactNode;
    heroImageSrc?: string;
    onSignIn?: (event: React.FormEvent<HTMLFormElement>) => void;
    onGoogleSignIn?: () => void;
    onResetPassword?: () => void;
    onCreateAccount?: () => void;
    isLoading?: boolean;
    buttonText?: string;
    showSocial?: boolean;
    showRememberMe?: boolean;
    showCreateAccount?: boolean;
    emailReadOnly?: boolean;
    defaultEmailValue?: string;
}

// --- SUB-COMPONENTS ---

const GlassInputWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm transition-colors focus-within:border-violet-400/70 focus-within:bg-violet-500/10">
        {children}
    </div>
);

// --- MAIN COMPONENT ---

export const SignInPage: React.FC<SignInPageProps> = ({
    title = <span className="font-light text-white tracking-tighter">Welcome</span>,
    description = "Access your account and continue your journey with us",
    heroImageSrc,
    onSignIn,
    onGoogleSignIn,
    onResetPassword,
    onCreateAccount,
    isLoading = false,
    buttonText = "Sign In",
    showSocial = true,
    showRememberMe = true,
    showCreateAccount = true,
    emailReadOnly = false,
    defaultEmailValue = "",
}) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className="h-[100dvh] flex flex-col md:flex-row font-sans w-[100dvw] bg-black text-white">
            {/* Left column: sign-in form */}
            <section className="flex-1 flex items-center justify-center p-8 z-10">
                <div className="w-full max-w-md">
                    <div className="flex flex-col gap-6">
                        <h1 className="animate-element animate-delay-100 text-4xl md:text-5xl font-semibold leading-tight">{title}</h1>
                        <p className="animate-element animate-delay-200 text-white/60">{description}</p>

                        <form className="space-y-5" onSubmit={onSignIn}>
                            <div className="animate-element animate-delay-300">
                                <label className="text-sm font-medium text-white/40 mb-2 block">Email Address</label>
                                <GlassInputWrapper>
                                    <input
                                        name="email"
                                        id="email"
                                        type="email"
                                        placeholder="Enter your email address"
                                        defaultValue={defaultEmailValue}
                                        readOnly={emailReadOnly}
                                        className={cn(
                                            "w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none text-white placeholder:text-white/20",
                                            emailReadOnly && "opacity-60 cursor-not-allowed"
                                        )}
                                        required
                                    />
                                </GlassInputWrapper>
                            </div>

                            <div className="animate-element animate-delay-400">
                                <label className="text-sm font-medium text-white/40 mb-2 block">{buttonText === "Complete Setup" ? "Create Password" : "Password"}</label>
                                <GlassInputWrapper>
                                    <div className="relative">
                                        <input
                                            name="password"
                                            id="password"
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder={buttonText === "Complete Setup" ? "Minimum 8 characters" : "Enter your password"}
                                            className="w-full bg-transparent text-sm p-4 pr-12 rounded-2xl focus:outline-none text-white placeholder:text-white/20"
                                            required
                                            minLength={buttonText === "Complete Setup" ? 8 : undefined}
                                        />
                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-3 flex items-center">
                                            {showPassword ? <EyeOff className="w-5 h-5 text-white/40 hover:text-white transition-colors" /> : <Eye className="w-5 h-5 text-white/40 hover:text-white transition-colors" />}
                                        </button>
                                    </div>
                                </GlassInputWrapper>
                            </div>

                            <div className="animate-element animate-delay-500 flex items-center justify-between text-sm">
                                {showRememberMe ? (
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <input type="checkbox" name="rememberMe" className="custom-checkbox h-4 w-4 rounded border-white/20 bg-white/5 checked:bg-violet-500 transition-all" />
                                        <span className="text-white/70 group-hover:text-white transition-colors">Keep me signed in</span>
                                    </label>
                                ) : <div />}
                                {buttonText !== "Complete Setup" && (
                                    <a href="#" onClick={(e) => { e.preventDefault(); onResetPassword?.(); }} className="hover:underline text-violet-400 transition-colors">Reset password</a>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="animate-element animate-delay-600 w-full rounded-2xl bg-white text-black py-4 font-semibold hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? (buttonText === "Complete Setup" ? "Setting up..." : "Signing In...") : buttonText}
                            </button>
                        </form>

                        {showSocial && (
                            <>
                                <div className="animate-element animate-delay-700 relative flex items-center justify-center">
                                    <span className="w-full border-t border-white/10"></span>
                                    <span className="px-4 text-sm text-white/40 bg-black absolute uppercase tracking-widest text-[10px]">Or continue with</span>
                                </div>

                                <button
                                    onClick={onGoogleSignIn}
                                    disabled={isLoading}
                                    className="animate-element animate-delay-800 w-full flex items-center justify-center gap-3 border border-white/10 rounded-2xl py-4 hover:bg-white/5 active:scale-[0.98] transition-all disabled:opacity-50"
                                >
                                    <GoogleIcon />
                                    <span className="text-sm font-medium">Continue with Google</span>
                                </button>
                            </>
                        )}

                        {showCreateAccount && (
                            <p className="animate-element animate-delay-900 text-center text-sm text-white/40">
                                New to our platform? <a href="#" onClick={(e) => { e.preventDefault(); onCreateAccount?.(); }} className="text-violet-400 hover:underline transition-colors">Create Account</a>
                            </p>
                        )}
                    </div>
                </div>
            </section>

            {/* Right column: hero image */}
            {heroImageSrc && (
                <section className="hidden md:block flex-1 relative p-4">
                    <div
                        className="animate-slide-right animate-delay-300 absolute inset-4 rounded-3xl bg-cover bg-center overflow-hidden shadow-2xl border border-white/10"
                        style={{ backgroundImage: `url(${heroImageSrc})` }}
                    >
                        {/* Gradient Overlay for Depth */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

                        {/* Minimalist Floating Accent */}
                        <div className="absolute top-12 left-12">
                            <div className="w-24 h-1 bg-white/40 rounded-full blur-[1px]" />
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
};
