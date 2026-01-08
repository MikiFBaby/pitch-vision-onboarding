"use client";
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { TagSelector } from '@/components/onboarding/TagSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
    User,
    Sparkles,
    Target,
    AtSign,
    Camera,
    ChevronRight,
    ChevronLeft,
    CheckCircle2,
    MessageSquare
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const STAGES = [
    { id: 'basics', title: 'The Basics', icon: User },
    { id: 'role', title: 'Your Role', icon: Target },
    { id: 'bio', title: 'Persona', icon: MessageSquare },
    { id: 'community', title: 'Community', icon: Sparkles }
];

const SUGGESTED_INTERESTS = [
    "AI", "Strategy", "Creative", "Analytics", "Sales", "Customer Success",
    "Engineering", "Design", "Leadership", "Product", "Wellbeing", "Gaming",
    "Travel", "Music", "Tech", "Networking"
];

const AVATAR_OPTIONS = [
    { role: 'agent', label: 'Agent', url: "/images/avatar-agent-modern.png" },
    { role: 'qa', label: 'Quality Assurance', url: "/images/avatar-qa-modern.png" },
    { role: 'manager', label: 'Manager', url: "/images/avatar-manager-modern.png" },
    { role: 'hr', label: 'HR', url: "/images/avatar-hr-modern.png" },
    { role: 'executive', label: 'Executive', url: "/images/avatar-executive-modern.png" },
    { role: 'partner', label: 'Partner', url: "/images/avatar-partner-modern.png" }
];

export default function OnboardingPage() {
    const { user, profile, loading, refreshProfile } = useAuth();
    const router = useRouter();

    const [currentStage, setCurrentStage] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        bio: '',
        interests: [] as string[],
        avatarUrl: AVATAR_OPTIONS[0].url,
        role: AVATAR_OPTIONS[0].role
    });

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }

        if (profile) {
            setFormData({
                firstName: profile.first_name || '',
                lastName: profile.last_name || '',
                bio: profile.bio || '',
                interests: profile.interests || [],
                avatarUrl: profile.avatar_url || AVATAR_OPTIONS[0].url,
                role: profile.role || AVATAR_OPTIONS[0].role
            });
        }
    }, [user, profile, loading, router]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData({
                    ...formData,
                    avatarUrl: reader.result as string
                });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleNext = () => {
        if (currentStage < STAGES.length - 1) {
            setCurrentStage(prev => prev + 1);
        } else {
            handleSubmit();
        }
    };

    const handleBack = () => {
        if (currentStage > 0) {
            setCurrentStage(prev => prev - 1);
        }
    };

    const handleSubmit = async () => {
        if (!user) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const response = await fetch('/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firebaseUid: user.uid,
                    email: user.email,
                    ...formData
                })
            });

            const data = await response.json();
            console.log('Onboarding Submission Result:', data);
            if (!data.success) throw new Error(data.error || 'Failed to update profile');

            // Refresh global profile state
            await refreshProfile();

            // Success redirect - use the actual role from the saved data
            const targetRole = data.user?.role || formData.role || 'agent';
            router.push(`/${targetRole}`);
        } catch (err: any) {
            setError(err.message);
            setIsSubmitting(false);
        }
    };

    if (loading || !user) {
        return <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="w-8 h-8 border-t-2 border-white rounded-full animate-spin" />
        </div>;
    }

    const stage = STAGES[currentStage];
    const Icon = stage.icon;

    return (
        <div className="min-h-screen bg-black text-white selection:bg-white/20 overflow-hidden relative">
            {/* Background elements */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full animate-pulse" />
            </div>

            <div className="max-w-4xl mx-auto px-6 pt-20 pb-12 relative z-10 min-h-screen flex flex-col">
                {/* Header */}
                <div className="space-y-4 mb-20 text-center">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full"
                    >
                        <Sparkles className="w-4 h-4 text-blue-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Profile Configuration</span>
                    </motion.div>
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
                        Welcome to Pitch Vision
                    </h1>
                    <p className="text-white/40 text-sm max-w-md mx-auto">
                        Let's set up your profile and join the community of visionaries.
                    </p>
                </div>

                {/* Progress Bar */}
                <div className="flex justify-between mb-12 relative px-4 max-w-lg mx-auto w-full">
                    <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white/5 -translate-y-1/2" />
                    {STAGES.map((s, idx) => (
                        <div key={s.id} className="relative z-10 flex flex-col items-center gap-2">
                            <div className={cn(
                                "w-2 h-2 rounded-full transition-all duration-500",
                                idx <= currentStage ? "bg-white scale-125 shadow-[0_0_15px_rgba(255,255,255,0.5)]" : "bg-white/10"
                            )} />
                            <span className={cn(
                                "text-[9px] font-bold uppercase tracking-widest transition-colors duration-500",
                                idx <= currentStage ? "text-white" : "text-white/20"
                            )}>
                                {s.title}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Form Area */}
                <div className="flex-1 flex flex-col items-center max-w-xl mx-auto w-full">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={stage.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="w-full space-y-8"
                        >
                            <div className="flex items-center gap-3 mb-8">
                                <div className="p-3 bg-white/5 rounded-2xl border border-white/10">
                                    <Icon className="w-6 h-6 text-white" />
                                </div>
                                <h2 className="text-xl font-medium tracking-wide">{stage.title}</h2>
                            </div>

                            {currentStage === 0 && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">First Name</Label>
                                            <Input
                                                value={formData.firstName}
                                                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                                placeholder="John"
                                                className="bg-white/5 border-white/10 focus:border-white/20 h-12 rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Last Name</Label>
                                            <Input
                                                value={formData.lastName}
                                                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                                placeholder="Doe"
                                                className="bg-white/5 border-white/10 focus:border-white/20 h-12 rounded-xl"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Work Email</Label>
                                        <div className="relative">
                                            <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                            <Input
                                                value={user.email || ''}
                                                disabled
                                                className="bg-white/5 border-white/10 h-12 rounded-xl pl-12 text-white/40"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {currentStage === 1 && (
                                <div className="space-y-8">
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex items-center justify-between"
                                    >
                                        <p className="text-sm text-white/60 leading-relaxed max-w-[280px]">
                                            Select your role and digital avatar. You can also upload a custom photo.
                                        </p>
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2 group"
                                        >
                                            <Camera className="w-4 h-4 text-white/40 group-hover:text-white" />
                                            Upload Photo
                                        </button>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept="image/*"
                                            onChange={handleFileChange}
                                        />
                                    </motion.div>

                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        {AVATAR_OPTIONS.map((opt) => (
                                            <button
                                                key={opt.role}
                                                onClick={() => setFormData({ ...formData, avatarUrl: opt.url, role: opt.role })}
                                                className={cn(
                                                    "relative rounded-2xl overflow-hidden border-2 transition-all group flex flex-col",
                                                    formData.role === opt.role && formData.avatarUrl === opt.url ? "border-white bg-white/5" : "border-white/5 hover:border-white/20 bg-white/[0.02]"
                                                )}
                                            >
                                                <div className="relative aspect-square w-full">
                                                    <Image fill src={opt.url} alt={opt.label} className="object-cover transition-transform group-hover:scale-110" />
                                                    {formData.role === opt.role && formData.avatarUrl === opt.url && (
                                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                                            <CheckCircle2 className="w-6 h-6 text-white" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="p-3 text-center">
                                                    <span className={cn(
                                                        "text-[10px] font-bold uppercase tracking-widest",
                                                        formData.role === opt.role ? "text-white" : "text-white/40"
                                                    )}>
                                                        {opt.label}
                                                    </span>
                                                </div>
                                            </button>
                                        ))}

                                        {/* Custom Photo Preview if exists and not one of the defaults */}
                                        {!AVATAR_OPTIONS.some(opt => opt.url === formData.avatarUrl) && (
                                            <button
                                                onClick={() => { }}
                                                className="relative rounded-2xl overflow-hidden border-2 border-white bg-white/5 transition-all group flex flex-col scale-105"
                                            >
                                                <div className="relative aspect-square w-full">
                                                    <img src={formData.avatarUrl} alt="Custom" className="w-full h-full object-cover" />
                                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                                        <CheckCircle2 className="w-6 h-6 text-white" />
                                                    </div>
                                                </div>
                                                <div className="p-3 text-center">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-white">
                                                        Custom Photo
                                                    </span>
                                                </div>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {currentStage === 2 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="space-y-6"
                                >
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Professional Bio</Label>
                                        <motion.textarea
                                            whileFocus={{ scale: 1.01 }}
                                            value={formData.bio}
                                            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                            placeholder="Tell us about yourself and your role..."
                                            className="w-full bg-white/5 border border-white/10 focus:border-white/30 focus:bg-white/10 h-40 rounded-xl p-4 text-sm text-white placeholder:text-white/40 outline-none resize-none transition-all"
                                        />
                                        <p className="text-[10px] text-white/40">Briefly describe your expertise and focus areas.</p>
                                    </div>
                                </motion.div>
                            )}

                            {currentStage === 3 && (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Interests & Tags</Label>
                                        <TagSelector
                                            selectedTags={formData.interests}
                                            onChange={(tags) => setFormData({ ...formData, interests: tags })}
                                            suggestions={SUGGESTED_INTERESTS}
                                        />
                                        <p className="text-[10px] text-white/20 mt-2">These tags help us connect you with relevant community groups and projects.</p>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    {error && (
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-red-400 text-xs mt-4"
                        >
                            {error}
                        </motion.p>
                    )}

                    {/* Footer Actions */}
                    <div className="w-full flex items-center justify-between mt-12 pt-8 border-t border-white/5">
                        <Button
                            variant="ghost"
                            onClick={handleBack}
                            disabled={currentStage === 0 || isSubmitting}
                            className="text-white/40 hover:text-white"
                        >
                            <ChevronLeft className="w-4 h-4 mr-2" />
                            Back
                        </Button>
                        <Button
                            onClick={handleNext}
                            disabled={isSubmitting || (currentStage === 0 && (!formData.firstName || !formData.lastName))}
                            className="bg-white text-black hover:bg-white/90 px-8 rounded-full h-12 font-bold transition-all hover:scale-105 active:scale-95"
                        >
                            {currentStage === STAGES.length - 1 ? (isSubmitting ? 'Finalizing...' : 'Complete Entry') : 'Next Stage'}
                            {currentStage !== STAGES.length - 1 && <ChevronRight className="w-4 h-4 ml-2" />}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
