"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { supabase } from "@/lib/supabase-client";
import Image from "next/image";
import {
    User, Mail, Shield, Camera, Key, Check, AlertCircle,
    Loader2, Bell, Clock, Briefcase
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Development mode mock data
const DEV_SLACK_ID = "dev-test-user";

interface EmployeeData {
    first_name: string;
    last_name: string;
    email: string;
    user_image: string | null;
    slack_user_id: string;
    role: string;
}

interface UserSettings {
    custom_avatar_url: string | null;
    custom_name: string | null;
    theme_preference: string;
    notification_preferences: Record<string, boolean>;
}

export function SettingsView() {
    const { user, profile, refreshProfile } = useAuth();
    const [isResettingPassword, setIsResettingPassword] = useState(false);
    const [resetStatus, setResetStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [resetMessage, setResetMessage] = useState('');
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [avatarStatus, setAvatarStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [avatarMessage, setAvatarMessage] = useState('');
    const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null);
    const [employeeData, setEmployeeData] = useState<EmployeeData | null>(null);
    const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Name editing state
    const [editableName, setEditableName] = useState('');
    const [isEditingName, setIsEditingName] = useState(false);
    const [isSavingName, setIsSavingName] = useState(false);
    const [nameStatus, setNameStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [nameMessage, setNameMessage] = useState('');

    // Get slack_user_id from profile or use dev fallback
    const slackUserId = profile?.slack_user_id || employeeData?.slack_user_id || DEV_SLACK_ID;
    const isDevelopmentMode = !user;

    // Fetch employee data and user settings
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Get user's email to find their employee record
                const userEmail = profile?.email || user?.email;
                let effectiveSlackId = DEV_SLACK_ID;

                if (userEmail) {
                    // Fetch employee data from employee_directory
                    const { data: empData, error: empError } = await supabase
                        .from('employee_directory')
                        .select('first_name, last_name, email, user_image, slack_user_id, role')
                        .eq('email', userEmail)
                        .single();

                    if (empData && !empError) {
                        setEmployeeData(empData);
                        effectiveSlackId = empData.slack_user_id;
                        // Initialize editable name from employee data
                        setEditableName(`${empData.first_name} ${empData.last_name || ''}`.trim());
                    } else {
                        // No employee data, set default editable name
                        setEditableName('User');
                    }
                } else {
                    // Dev mode default
                    setEditableName('User');
                }

                // Fetch user settings using effectiveSlackId (either from employee or dev default)
                const { data: settingsData } = await supabase
                    .from('user_settings')
                    .select('custom_avatar_url, custom_name, theme_preference, notification_preferences')
                    .eq('slack_user_id', effectiveSlackId)
                    .single();

                if (settingsData) {
                    setUserSettings(settingsData);
                    if (settingsData.custom_avatar_url) {
                        setLocalAvatarUrl(settingsData.custom_avatar_url);
                    }
                    if (settingsData.custom_name) {
                        setEditableName(settingsData.custom_name);
                    }
                }

            } catch (error) {
                console.error('Error fetching settings data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [profile, user]);

    const handlePasswordReset = async () => {
        if (!user?.email) {
            setResetStatus('error');
            setResetMessage('Not available in development mode');
            return;
        }

        setIsResettingPassword(true);
        setResetStatus('idle');

        try {
            await sendPasswordResetEmail(auth, user.email);
            setResetStatus('success');
            setResetMessage(`Password reset email sent to ${user.email}`);
        } catch (error: any) {
            setResetStatus('error');
            setResetMessage(error.message || 'Failed to send reset email');
        } finally {
            setIsResettingPassword(false);
        }
    };

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        console.log('Avatar upload triggered');
        const file = e.target.files?.[0];

        if (!file) {
            console.log('No file selected');
            return;
        }

        console.log('File selected:', file.name, file.type, file.size);

        // Validate file type
        if (!file.type.startsWith('image/')) {
            setAvatarStatus('error');
            setAvatarMessage('Please select an image file');
            return;
        }

        // Validate file size (max 2MB for base64)
        if (file.size > 2 * 1024 * 1024) {
            setAvatarStatus('error');
            setAvatarMessage('Image must be less than 2MB');
            return;
        }

        setIsUploadingAvatar(true);
        setAvatarStatus('idle');
        setAvatarMessage('');

        try {
            // Convert to base64 for immediate display
            const reader = new FileReader();

            reader.onload = async (event) => {
                const base64Data = event.target?.result as string;
                console.log('File converted to base64');

                // Show immediately for instant feedback
                setLocalAvatarUrl(base64Data);

                try {
                    const effectiveSlackId = employeeData?.slack_user_id || slackUserId;

                    // Check if user_settings record exists
                    const { data: existingSettings } = await supabase
                        .from('user_settings')
                        .select('id')
                        .eq('slack_user_id', effectiveSlackId)
                        .single();

                    if (existingSettings) {
                        // Update existing settings
                        const { error: updateError } = await supabase
                            .from('user_settings')
                            .update({
                                custom_avatar_url: base64Data,
                                updated_at: new Date().toISOString()
                            })
                            .eq('slack_user_id', effectiveSlackId);

                        if (updateError) {
                            console.error('Supabase update error:', updateError);
                            throw new Error(updateError.message);
                        }
                    } else {
                        // Create new settings record
                        const { error: insertError } = await supabase
                            .from('user_settings')
                            .insert({
                                slack_user_id: effectiveSlackId,
                                custom_avatar_url: base64Data
                            });

                        if (insertError) {
                            console.error('Supabase insert error:', insertError);
                            throw new Error(insertError.message);
                        }
                    }

                    console.log('User settings updated successfully');
                    setAvatarStatus('success');
                    setAvatarMessage('Profile photo updated!');

                    // Clear success message after 3 seconds
                    setTimeout(() => {
                        setAvatarStatus('idle');
                        setAvatarMessage('');
                    }, 3000);

                } catch (uploadError: any) {
                    console.error('Upload error:', uploadError);
                    setAvatarStatus('error');
                    setAvatarMessage(uploadError.message || 'Failed to save photo');
                } finally {
                    setIsUploadingAvatar(false);
                }
            };

            reader.onerror = () => {
                console.error('FileReader error');
                setAvatarStatus('error');
                setAvatarMessage('Failed to read image file');
                setIsUploadingAvatar(false);
            };

            reader.readAsDataURL(file);

        } catch (error: any) {
            console.error('Avatar upload error:', error);
            setAvatarStatus('error');
            setAvatarMessage(error.message || 'Failed to upload photo');
            setIsUploadingAvatar(false);
        }
    };

    const handleNameSave = async () => {
        if (!editableName.trim()) {
            setNameStatus('error');
            setNameMessage('Name cannot be empty');
            return;
        }

        setIsSavingName(true);
        setNameStatus('idle');
        setNameMessage('');

        try {
            const effectiveSlackId = employeeData?.slack_user_id || slackUserId;

            // Check if user_settings record exists
            const { data: existingSettings } = await supabase
                .from('user_settings')
                .select('id')
                .eq('slack_user_id', effectiveSlackId)
                .single();

            if (existingSettings) {
                // Update existing settings
                const { error: updateError } = await supabase
                    .from('user_settings')
                    .update({
                        custom_name: editableName,
                        updated_at: new Date().toISOString()
                    })
                    .eq('slack_user_id', effectiveSlackId);

                if (updateError) throw updateError;
            } else {
                // Create new settings record
                const { error: insertError } = await supabase
                    .from('user_settings')
                    .insert({
                        slack_user_id: effectiveSlackId,
                        custom_name: editableName
                    });

                if (insertError) throw insertError;
            }

            // Update local state
            setUserSettings(prev => prev ? { ...prev, custom_name: editableName } : {
                custom_avatar_url: null,
                custom_name: editableName,
                theme_preference: 'dark',
                notification_preferences: {}
            });

            setNameStatus('success');
            setNameMessage('Name updated!');
            setIsEditingName(false);

            // Clear success message
            setTimeout(() => {
                setNameStatus('idle');
                setNameMessage('');
            }, 3000);

            // Trigger profile refresh to update other components if needed
            if (user) await refreshProfile();

        } catch (error: any) {
            console.error('Error saving name:', error);
            setNameStatus('error');
            setNameMessage(error.message || 'Failed to update name');
        } finally {
            setIsSavingName(false);
        }
    };

    // Display priority: custom avatar > Slack image > profile image > fallback
    const displayName = employeeData
        ? `${employeeData.first_name} ${employeeData.last_name || ''}`
        : profile?.first_name
            ? `${profile.first_name} ${profile.last_name || ''}`
            : user?.displayName || 'User';

    const displayEmail = employeeData?.email || profile?.email || user?.email || 'test@example.com';

    // Avatar priority: local preview > custom settings > Slack image > default
    const currentAvatarUrl = localAvatarUrl
        || userSettings?.custom_avatar_url
        || employeeData?.user_image
        || profile?.avatar_url
        || profile?.user_image;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 size={32} className="text-indigo-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-bold tracking-tight text-white">
                    Settings
                </h2>
                <p className="text-white/60 text-sm">
                    Manage your profile and account preferences
                </p>
                {isDevelopmentMode && (
                    <p className="text-amber-400/80 text-xs bg-amber-500/10 px-3 py-1.5 rounded-lg inline-flex items-center gap-2 w-fit">
                        <AlertCircle size={12} />
                        Development Mode - Using mock user
                    </p>
                )}
            </div>

            {/* Profile Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-2xl border border-white/10 overflow-hidden"
            >
                <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-indigo-500/20">
                            <User size={18} className="text-indigo-400" />
                        </div>
                        <h3 className="text-lg font-bold text-white tracking-tight">Profile Information</h3>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* Avatar Section */}
                    <div className="flex items-center gap-6">
                        <div className="relative group">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleAvatarUpload}
                                disabled={isUploadingAvatar}
                            />

                            <div
                                onClick={handleAvatarClick}
                                className="cursor-pointer"
                            >
                                {currentAvatarUrl ? (
                                    <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl">
                                        <Image
                                            src={currentAvatarUrl}
                                            alt="Profile"
                                            width={96}
                                            height={96}
                                            className="object-cover w-full h-full"
                                            unoptimized
                                        />
                                    </div>
                                ) : (
                                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold text-3xl shadow-2xl border-2 border-white/10">
                                        {displayName[0]?.toUpperCase()}
                                    </div>
                                )}

                                {/* Upload overlay */}
                                <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                                    {isUploadingAvatar ? (
                                        <Loader2 size={24} className="text-white animate-spin" />
                                    ) : (
                                        <Camera size={24} className="text-white" />
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex-1">
                            <p className="text-xs text-white/50 uppercase tracking-widest font-bold mb-1">Profile Photo</p>
                            <p className="text-white/70 text-sm mb-2">
                                Click to upload a custom profile picture
                            </p>
                            {employeeData?.user_image && !userSettings?.custom_avatar_url && !localAvatarUrl && (
                                <p className="text-xs text-white/40">
                                    Currently showing your Slack photo
                                </p>
                            )}

                            {/* Avatar upload status */}
                            <AnimatePresence>
                                {avatarStatus !== 'idle' && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -5 }}
                                        className={`flex items-center gap-2 text-sm ${avatarStatus === 'success' ? 'text-emerald-400' : 'text-rose-400'
                                            }`}
                                    >
                                        {avatarStatus === 'success' ? (
                                            <Check size={14} />
                                        ) : (
                                            <AlertCircle size={14} />
                                        )}
                                        <span>{avatarMessage}</span>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Full Name Field (Read-only) */}
                    <div className="space-y-2">
                        <label className="text-xs text-white/50 uppercase tracking-widest font-bold flex items-center gap-2">
                            <User size={12} />
                            Full Name
                            <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/40">From Directory</span>
                        </label>
                        <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70">
                            {employeeData ? `${employeeData.first_name} ${employeeData.last_name || ''}` : displayName}
                        </div>
                    </div>

                    {/* Nickname Field (Editable) */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-white/50 uppercase tracking-widest font-bold flex items-center gap-2">
                                <User size={12} />
                                Nickname (Display Name)
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${userSettings?.custom_name
                                    ? 'bg-indigo-500/20 text-indigo-300'
                                    : 'bg-white/10 text-white/40'
                                    }`}>
                                    {userSettings?.custom_name ? 'Custom' : 'Optional'}
                                </span>
                            </label>

                            {!isEditingName && (
                                <button
                                    onClick={() => setIsEditingName(true)}
                                    className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-4"
                                >
                                    Edit
                                </button>
                            )}
                        </div>

                        {isEditingName ? (
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={editableName}
                                    onChange={(e) => setEditableName(e.target.value)}
                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-white/20"
                                    placeholder="Enter nickname"
                                    autoFocus
                                />
                                <button
                                    onClick={handleNameSave}
                                    disabled={isSavingName || !editableName.trim()}
                                    className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-all flex items-center gap-2"
                                >
                                    {isSavingName ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
                                </button>
                                <button
                                    onClick={() => {
                                        setIsEditingName(false);
                                        setEditableName(userSettings?.custom_name || displayName);
                                    }}
                                    className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-white font-medium transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 flex justify-between items-center group">
                                {userSettings?.custom_name || (
                                    <span className="text-white/30 italic">Not set (using full name)</span>
                                )}
                                {nameStatus === 'success' && (
                                    <span className="text-emerald-400 text-xs flex items-center gap-1 animate-in fade-in slide-in-from-right-4">
                                        <Check size={12} /> Saved
                                    </span>
                                )}
                            </div>
                        )}
                        {nameStatus === 'error' && (
                            <p className="text-rose-400 text-xs flex items-center gap-1">
                                <AlertCircle size={12} /> {nameMessage}
                            </p>
                        )}
                    </div>

                    {/* Role Field (Read-only) */}
                    <div className="space-y-2">
                        <label className="text-xs text-white/50 uppercase tracking-widest font-bold flex items-center gap-2">
                            <Briefcase size={12} />
                            Role
                            <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/40">From Directory</span>
                        </label>
                        <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70">
                            {employeeData?.role || profile?.role || 'User'}
                        </div>
                    </div>

                    {/* Email Field (Read-only) */}
                    <div className="space-y-2">
                        <label className="text-xs text-white/50 uppercase tracking-widest font-bold flex items-center gap-2">
                            <Mail size={12} />
                            Email Address
                            <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/40">From Directory</span>
                        </label>
                        <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70">
                            {displayEmail}
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Security Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card rounded-2xl border border-white/10 overflow-hidden"
            >
                <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-emerald-500/20">
                            <Shield size={18} className="text-emerald-400" />
                        </div>
                        <h3 className="text-lg font-bold text-white tracking-tight">Security</h3>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    {/* Password Reset */}
                    <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl border border-white/5">
                        <div className="flex items-center gap-4">
                            <div className="p-2.5 rounded-xl bg-white/5">
                                <Key size={18} className="text-white/60" />
                            </div>
                            <div>
                                <p className="text-white font-medium">Password</p>
                                <p className="text-white/50 text-sm">
                                    {isDevelopmentMode ? 'Requires login' : 'Reset your password via email'}
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={handlePasswordReset}
                            disabled={isResettingPassword || isDevelopmentMode}
                            className="px-4 py-2 bg-white/10 hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white text-sm font-medium transition-all flex items-center gap-2"
                        >
                            {isResettingPassword ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                'Reset Password'
                            )}
                        </button>
                    </div>

                    {/* Reset Status Message */}
                    <AnimatePresence>
                        {resetStatus !== 'idle' && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl ${resetStatus === 'success'
                                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                                    : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                                    }`}
                            >
                                {resetStatus === 'success' ? (
                                    <Check size={16} />
                                ) : (
                                    <AlertCircle size={16} />
                                )}
                                <span className="text-sm font-medium">{resetMessage}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Last Login Info */}
                    {user?.metadata?.lastSignInTime && (
                        <div className="flex items-center gap-3 px-4 py-3 bg-white/[0.02] rounded-xl border border-white/5">
                            <Clock size={14} className="text-white/40" />
                            <span className="text-white/50 text-sm">
                                Last login: {new Date(user.metadata.lastSignInTime).toLocaleString()}
                            </span>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Preferences Section (Placeholder for future) */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card rounded-2xl border border-white/10 overflow-hidden opacity-60"
            >
                <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-purple-500/20">
                            <Bell size={18} className="text-purple-400" />
                        </div>
                        <h3 className="text-lg font-bold text-white tracking-tight">Preferences</h3>
                        <span className="ml-auto text-[10px] text-white/40 uppercase tracking-widest bg-white/5 px-2 py-1 rounded-md">
                            Coming Soon
                        </span>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between opacity-50">
                        <div className="flex items-center gap-3">
                            <Bell size={16} className="text-white/40" />
                            <span className="text-white/60">Email Notifications</span>
                        </div>
                        <div className="w-12 h-6 bg-white/10 rounded-full" />
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
