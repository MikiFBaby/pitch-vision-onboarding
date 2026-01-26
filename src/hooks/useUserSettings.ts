"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase-client";

export function useUserSettings() {
    const { user, profile } = useAuth();
    const [customAvatar, setCustomAvatar] = useState<string | null>(null);
    const [customName, setCustomName] = useState<string | null>(null);
    const [directoryImage, setDirectoryImage] = useState<string | null>(null);
    const [slackId, setSlackId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Dev Mode Constants (For functional testing without full auth flow)
    const DEV_SLACK_ID = "U_MIKI_CTO"; // Matches employee_directory slack_user_id
    const DEV_EMAIL = "miki@pitchperfectsolutions.net";

    // 1. Resolve Slack ID & Directory Image
    useEffect(() => {
        const resolveUser = async () => {
            const userEmail = profile?.email || user?.email || DEV_EMAIL;
            let resolvedId = null;

            if (userEmail) {
                try {
                    // Try to find via employee directory first
                    const { data: empData } = await supabase
                        .from('employee_directory')
                        .select('slack_user_id, user_image, first_name, last_name')
                        .eq('email', userEmail)
                        .maybeSingle();

                    if (empData) {
                        if (empData.slack_user_id) resolvedId = empData.slack_user_id;
                        if (empData.user_image) setDirectoryImage(empData.user_image);
                        // Set display name if we found a person
                        if (empData.first_name) setCustomName(`${empData.first_name} ${empData.last_name || ''}`.trim());
                    }

                    // Fallback to profile slack ID if directory didn't have it
                    if (!resolvedId && profile?.slack_user_id) {
                        resolvedId = profile.slack_user_id;
                    }
                } catch (e) {
                    // console.error("Error resolving user", e);
                }
            }
            // Fallback for dev/demo if needed
            setSlackId(resolvedId || DEV_SLACK_ID);
        };

        resolveUser();
    }, [profile, user]);

    // 2. Fetch Settings & Realtime
    useEffect(() => {
        if (!slackId) {
            // Wait until slackId is resolved to stop loading? 
            // Or if slackId is null (rare given fallback), we stop loading.
            // But initial slackId is null, so we shouldn't set loading false yet? 
            // Actually resolveUser runs fast.
            return;
        }

        let channel: any = null;

        const fetchInitSettings = async () => {
            try {
                const { data: settings } = await supabase
                    .from('user_settings')
                    .select('custom_avatar_url, custom_name')
                    .eq('slack_user_id', slackId)
                    .maybeSingle();

                if (settings) {
                    setCustomAvatar(settings.custom_avatar_url);
                    setCustomName(settings.custom_name);
                }
            } catch (error) {
                // Silently fail
            } finally {
                setLoading(false);
            }
        };

        const subscribeToRealtime = () => {
            channel = supabase
                .channel(`user-settings-${slackId}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'user_settings',
                        filter: `slack_user_id=eq.${slackId}`
                    },
                    (payload) => {
                        const newRecord = payload.new as any;
                        if (newRecord) {
                            setCustomAvatar(newRecord.custom_avatar_url);
                            setCustomName(newRecord.custom_name);
                        }
                    }
                )
                .subscribe();
        };

        fetchInitSettings();
        subscribeToRealtime();

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [slackId]);


    // Helper to get the best available avatar
    // Priority: Custom > Directory Image > Profile > Google/Firebase
    const avatarUrl = customAvatar || directoryImage || profile?.avatar_url || profile?.user_image || user?.photoURL || null;

    // Helper to get the best available display name
    const displayName = customName || (profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : user?.displayName || (user?.email?.split('@')[0]) || "User");

    // Helper for email - ALWAYS use work email for Aura communications, not Google login email
    const email = DEV_EMAIL; // Use work email: miki@pitchperfectsolutions.net

    return {
        customAvatar,
        customName,
        avatarUrl,
        displayName,
        email,
        loading,
        slackId
    };
}
