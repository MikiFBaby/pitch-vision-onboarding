"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase-client";
import {
    MessageSquare, X, Send, Paperclip, Mic, Image as ImageIcon,
    File as FileIcon, Users, Hash, ChevronDown, Monitor, Minimize2,
    Plus, ArrowLeft, MoreVertical, Search, Zap, Smile, Edit2, Trash2, MoreHorizontal, Link as LinkIcon
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// --- Types ---

interface Message {
    id: string;
    content: string;
    created_at: string;
    user_id: string;
    attachment_url?: string;
    attachment_type?: 'text' | 'image' | 'file' | 'audio';
    attachment_name?: string;
    reactions: Record<string, string[]>; // emoji -> array of user_ids
    is_edited: boolean;
    updated_at: string | null;
    user?: {
        first_name: string;
        last_name: string;
        user_image: string | null;
    };
}

interface Channel {
    id: string;
    name: string;
    created_at: string;
}

interface DirectoryUser {
    id: string;
    first_name: string;
    last_name: string;
    user_image: string | null;
    role: string;
    email: string;
}

// --- Component ---

export function ChatWidget() {
    const { user, profile } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'channels' | 'chat' | 'directory'>('channels');

    // Chat State
    const [channels, setChannels] = useState<Channel[]>([]);
    const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [newChannelName, setNewChannelName] = useState("");
    const [isCreatingChannel, setIsCreatingChannel] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");

    // Realtime State
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
    const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Directory State
    const [directory, setDirectory] = useState<DirectoryUser[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const channelSubscriptionRef = useRef<any>(null); // For typing/broadcasts

    // Derived State
    const departments = useMemo(() => {
        return Array.from(new Set(directory.map(u => u.role).filter(Boolean))).sort();
    }, [directory]);

    const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

    const quickReplies = [
        "👍 Sounds good!",
        "👋 Hi there!",
        "❓ Can you help?",
        "📅 Meeting?",
        "✅ Approved"
    ];

    const reactionEmojis = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

    // --- Init ---
    useEffect(() => {
        if (isOpen) {
            fetchChannels();
            fetchDirectory();
        }

        // Presence Subscription
        const presenceChannel = supabase.channel('global_presence');
        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const newState = presenceChannel.presenceState();
                const userIds = new Set<string>();
                for (const key in newState) {
                    // @ts-ignore
                    newState[key].forEach((presence: any) => {
                        if (presence.user_id) userIds.add(presence.user_id);
                    });
                }
                setOnlineUsers(userIds);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await presenceChannel.track({ user_id: profile?.id || user?.uid, online_at: new Date().toISOString() });
                }
            });

        return () => { presenceChannel.unsubscribe(); };
    }, [isOpen, profile?.id, user?.uid]);

    useEffect(() => {
        if (activeChannel) {
            // Mark channel as read
            setUnreadCounts(prev => ({ ...prev, [activeChannel.id]: 0 }));

            fetchMessages(activeChannel.id);
            const subscription = subscribeToMessages(activeChannel.id);

            // Subscribe to Typing Indicators
            channelSubscriptionRef.current = supabase.channel(`room:${activeChannel.id}`);
            channelSubscriptionRef.current
                .on('broadcast', { event: 'typing' }, (payload: any) => {
                    if (payload.payload.user_id !== (profile?.id || user?.uid)) {
                        setTypingUsers(prev => {
                            const next = new Set(prev);
                            next.add(payload.payload.user_id);
                            return next;
                        });
                        // Auto clear after 3s
                        setTimeout(() => {
                            setTypingUsers(prev => {
                                const next = new Set(prev);
                                next.delete(payload.payload.user_id);
                                return next;
                            });
                        }, 3000);
                    }
                })
                .subscribe();

            return () => {
                subscription.unsubscribe();
                channelSubscriptionRef.current?.unsubscribe();
            };
        }
    }, [activeChannel]);

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen, activeTab, typingUsers]);

    // --- Data Fetching ---

    const fetchChannels = async () => {
        const { data } = await supabase.from("chat_channels").select("*").order("name");
        if (data) {
            setChannels(data);
        }
    };

    const createChannel = async () => {
        if (!newChannelName.trim()) return;
        const { data, error } = await supabase.from("chat_channels").insert({
            name: newChannelName.trim()
        }).select().single();

        if (data) {
            setChannels(prev => [...prev, data]);
            setNewChannelName("");
            setIsCreatingChannel(false);
            setActiveChannel(data);
            setActiveTab('chat');
        }
    };

    const fetchDirectory = async () => {
        const { data } = await supabase
            .from("employee_directory")
            .select("id, first_name, last_name, user_image, role, email")
            .order("first_name");
        if (data) setDirectory(data as any);
    };

    const fetchMessages = async (channelId: string) => {
        setIsLoading(true);
        const { data } = await supabase
            .from("chat_messages")
            .select(`
                *,
                user:employee_directory(first_name, last_name, user_image)
            `)
            .eq("channel_id", channelId)
            .order("created_at", { ascending: true });
        if (data) setMessages(data as any);
        setIsLoading(false);
    };

    const subscribeToMessages = (channelId: string) => {
        return supabase
            .channel(`chat_sub:${channelId}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` }, async (payload) => {
                if (payload.eventType === 'INSERT') {
                    const { data } = await supabase
                        .from("chat_messages")
                        .select(`*, user:employee_directory(first_name, last_name, user_image)`)
                        .eq("id", payload.new.id)
                        .single();
                    if (data) {
                        setMessages(prev => [...prev, data as any]);
                        if (activeChannel?.id !== channelId) {
                            setUnreadCounts(prev => ({ ...prev, [channelId]: (prev[channelId] || 0) + 1 }));
                        }
                        scrollToBottom();
                    }
                } else if (payload.eventType === 'UPDATE') {
                    setMessages(prev => prev.map(msg => msg.id === payload.new.id ? { ...msg, ...payload.new } : msg));
                } else if (payload.eventType === 'DELETE') {
                    setMessages(prev => prev.filter(msg => msg.id !== payload.old.id));
                }
            })
            .subscribe();
    };

    // --- Actions ---

    const scrollToBottom = () => {
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    };

    const broadcastTyping = () => {
        if (channelSubscriptionRef.current) {
            channelSubscriptionRef.current.send({
                type: 'broadcast',
                event: 'typing',
                payload: { user_id: profile?.id || user?.uid }
            });
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setNewMessage(e.target.value);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(broadcastTyping, 500); // Debounce typing event
    };

    const sendMessage = async (content: string, type: 'text' | 'image' | 'file' | 'audio' = 'text', url?: string, name?: string) => {
        if (!user || !activeChannel || !profile?.id) {
            console.error("Missing user profile or active channel");
            return;
        }

        const { error } = await supabase.from("chat_messages").insert({
            channel_id: activeChannel.id,
            user_id: profile.id, // Strictly use profile.id (UUID)
            content: content,
            attachment_type: type,
            attachment_url: url,
            attachment_name: name,
            reactions: {}
        });

        if (error) {
            console.error("Error sending message:", error);
            alert("Failed to send message. Please try again.");
        } else {
            setNewMessage("");
        }
    };

    const handleEditMessage = async () => {
        if (!editingMessageId || !editContent.trim()) return;
        await supabase.from("chat_messages").update({
            content: editContent,
            is_edited: true,
            updated_at: new Date().toISOString()
        }).eq("id", editingMessageId);
        setEditingMessageId(null);
        setEditContent("");
    };

    const handleDeleteMessage = async (id: string) => {
        if (confirm("Are you sure you want to delete this message?")) {
            await supabase.from("chat_messages").delete().eq("id", id);
        }
    };

    const handleReaction = async (msg: Message, emoji: string) => {
        const userId = profile?.id;
        if (!userId) return;

        const currentReactions = msg.reactions || {};
        const userList = currentReactions[emoji] || [];

        let newReactions;
        if (userList.includes(userId)) {
            // Remove reaction
            const newList = userList.filter(id => id !== userId);
            if (newList.length === 0) {
                const { [emoji]: _, ...rest } = currentReactions;
                newReactions = rest;
            } else {
                newReactions = { ...currentReactions, [emoji]: newList };
            }
        } else {
            // Add reaction
            newReactions = { ...currentReactions, [emoji]: [...userList, userId] };
        }

        await supabase.from("chat_messages").update({
            reactions: newReactions
        }).eq("id", msg.id);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(filePath, file);
        if (uploadError) return;

        const { data: publicUrl } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);

        const type = file.type.startsWith('image/') ? 'image' : 'file';
        await sendMessage(type === 'image' ? 'Image shared' : 'File shared', type, publicUrl.publicUrl, file.name);
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const fileName = `voice-${Date.now()}.webm`;
                const { error } = await supabase.storage.from('chat-attachments').upload(fileName, audioBlob);
                if (!error) {
                    const { data } = supabase.storage.from('chat-attachments').getPublicUrl(fileName);
                    await sendMessage("Voice message", 'audio', data.publicUrl, fileName);
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Error accessing microphone:", err);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
    };

    // --- Helpers ---

    const formatDate = (date: Date) => {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) return "Today";
        if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
        return date.toLocaleDateString();
    };

    const shouldShowDateSeparator = (curr: Message, prev?: Message) => {
        if (!prev) return true;
        const currDate = new Date(curr.created_at).toDateString();
        const prevDate = new Date(prev.created_at).toDateString();
        return currDate !== prevDate;
    };

    const renderMessageContent = (msg: Message) => {
        if (msg.attachment_type === 'text') {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const parts = msg.content.split(urlRegex);
            return (
                <div>
                    {parts.map((part, i) => {
                        if (part.match(urlRegex)) {
                            return (
                                <a
                                    key={i}
                                    href={part}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-indigo-300 underline hover:text-indigo-200 mt-1 mb-1 p-2 bg-black/20 rounded-lg"
                                >
                                    <LinkIcon className="w-3 h-3" />
                                    <span className="truncate max-w-[200px]">{part}</span>
                                </a>
                            );
                        }
                        return part;
                    })}
                </div>
            );
        }
        return msg.content;
    };

    // --- Renders ---

    return (
        <>
            {/* Toggle Button */}
            <AnimatePresence>
                {!isOpen && (
                    <motion.button
                        initial={{ scale: 0, rotate: 180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, rotate: -180 }}
                        whileHover={{ scale: 1.1, boxShadow: "0 0 30px rgba(99, 102, 241, 0.6)" }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setIsOpen(true)}
                        className="fixed bottom-6 left-6 z-50 w-16 h-16 bg-black text-white rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.4)] flex items-center justify-center border border-white/10 overflow-hidden group"
                    >
                        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <MessageSquare className="w-7 h-7 relative z-10" />
                        {totalUnread > 0 && (
                            <span className="absolute top-3 right-3 w-3 h-3 bg-red-500 border-2 border-black rounded-full z-20" />
                        )}
                        <span className="absolute top-4 right-4 w-2.5 h-2.5 bg-green-500 border border-black rounded-full" />
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Main Window */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 50, scale: 0.95 }}
                        className="fixed bottom-6 left-6 z-50 w-[400px] h-[650px] bg-[#0A0A0A] rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-white/10 flex flex-col overflow-hidden backdrop-blur-3xl"
                    >
                        {/* Header */}
                        <div className="h-16 px-6 flex items-center justify-between border-b border-white/5 bg-white/5 backdrop-blur-md">
                            <div className="flex items-center gap-4">
                                {activeTab === 'chat' && (
                                    <button
                                        onClick={() => setActiveTab('channels')}
                                        className="p-1 -ml-2 text-white/50 hover:text-white transition-colors"
                                    >
                                        <ArrowLeft className="w-5 h-5" />
                                    </button>
                                )}

                                {activeTab === 'chat' && activeChannel ? (
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                                            <Hash className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h2 className="font-bold text-white text-sm tracking-wide">{activeChannel.name}</h2>
                                            <p className="text-[10px] text-green-400 flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                Active Now
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white font-bold text-sm border border-white/10 ring-1 ring-white/5 overflow-hidden">
                                            {(profile?.avatar_url || profile?.user_image || user?.photoURL) ? (
                                                <img
                                                    src={profile?.avatar_url || profile?.user_image || user?.photoURL || ""}
                                                    className="w-full h-full rounded-full object-cover"
                                                    alt="User"
                                                />
                                            ) : (
                                                <span className="text-white/90">{profile?.first_name?.[0] || user?.displayName?.[0] || "U"}</span>
                                            )}
                                        </div>
                                        <div>
                                            <h2 className="font-bold text-white text-sm tracking-wide leading-tight">Messages</h2>
                                            <p className="text-[10px] text-indigo-200/60 font-medium">Pitch Vision</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setActiveTab(activeTab === 'directory' ? 'channels' : 'directory')}
                                    className={`p-2 rounded-full transition-all ${activeTab === 'directory' ? 'bg-indigo-500 text-white' : 'text-white/40 hover:bg-white/10 hover:text-white'
                                        }`}
                                    title="Directory"
                                >
                                    <Users className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-2 text-white/40 hover:bg-white/10 hover:text-white rounded-full transition-colors"
                                >
                                    <Minimize2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-hidden relative bg-[#050505]">

                            {/* --- CHANNELS LIST --- */}
                            {activeTab === 'channels' && (
                                <div className="h-full flex flex-col p-4">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest pl-2">Group Chats</h3>
                                        <button
                                            onClick={() => setIsCreatingChannel(true)}
                                            className="p-1.5 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500 hover:text-white rounded-lg transition-all"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {isCreatingChannel && (
                                        <div className="mb-4 p-3 bg-white/5 rounded-xl border border-white/10">
                                            <input
                                                autoFocus
                                                type="text"
                                                placeholder="Channel Name..."
                                                value={newChannelName}
                                                onChange={(e) => setNewChannelName(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && createChannel()}
                                                className="w-full bg-transparent border-none text-white text-sm placeholder:text-white/30 mb-3 focus:ring-0 px-0"
                                            />
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => setIsCreatingChannel(false)}
                                                    className="px-3 py-1.5 text-xs text-white/50 hover:text-white transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={createChannel}
                                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors"
                                                >
                                                    Create
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar">
                                        {channels.map(channel => (
                                            <button
                                                key={channel.id}
                                                onClick={() => {
                                                    setActiveChannel(channel);
                                                    setActiveTab('chat');
                                                }}
                                                className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-white/5 transition-all group border border-transparent hover:border-white/5 text-left relative"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 group-hover:bg-indigo-500/20 group-hover:text-indigo-400 transition-colors">
                                                    <Hash className="w-5 h-5" />
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="text-white text-sm font-medium group-hover:text-indigo-300 transition-colors">{channel.name}</h4>
                                                    <p className="text-[10px] text-white/30 truncate">Tap to join conversation</p>
                                                </div>
                                                {unreadCounts[channel.id] > 0 && (
                                                    <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-bold text-white shadow-lg">
                                                        {unreadCounts[channel.id]}
                                                    </div>
                                                )}
                                                <div className="w-2 h-2 rounded-full bg-white/10 group-hover:bg-indigo-500 transition-colors" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* --- CHAT VIEW --- */}
                            {activeTab === 'chat' && (
                                <div className="h-full flex flex-col">
                                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                                        {messages.map((msg, i) => {
                                            const isMe = msg.user_id === (profile?.id || user?.uid);
                                            const showDate = shouldShowDateSeparator(msg, messages[i - 1]);

                                            // Handle Reaction stats
                                            const reactionCounts = msg.reactions ? Object.entries(msg.reactions).map(([emoji, users]) => ({ emoji, count: users.length, hasReacted: users.includes(profile?.id || user?.uid || "") })).filter(r => r.count > 0) : [];

                                            return (
                                                <div key={msg.id}>
                                                    {showDate && (
                                                        <div className="flex justify-center mb-6">
                                                            <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-medium text-white/40 border border-white/5">
                                                                {formatDate(new Date(msg.created_at))}
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div className={`flex gap-3 group/msg ${isMe ? "flex-row-reverse" : ""}`}>
                                                        <div className="flex-shrink-0 mt-auto">
                                                            {msg.user?.user_image ? (
                                                                <img src={msg.user.user_image} className="w-8 h-8 rounded-full object-cover ring-2 ring-black hover:ring-indigo-500 transition-all cursor-pointer" title={msg.user.first_name} />
                                                            ) : (
                                                                <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs ring-2 ring-black border border-white/10 hover:border-indigo-500/50 transition-all cursor-pointer" title={msg.user?.first_name}>
                                                                    {msg.user?.first_name[0]}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className={`flex flex-col gap-1 max-w-[75%] ${isMe ? "items-end" : "items-start"}`}>
                                                            {!isMe && (
                                                                <span className="text-[10px] text-white/40 ml-1 hover:text-white transition-colors cursor-default">
                                                                    {msg.user?.first_name} {typingUsers.has(msg.user_id) && <span className="text-indigo-400 animate-pulse">is typing...</span>}
                                                                </span>
                                                            )}

                                                            <div className={`relative p-3 rounded-2xl text-sm transition-all hover:scale-[1.01] ${isMe
                                                                ? "bg-indigo-600 text-white rounded-br-sm shadow-[0_4px_15px_rgba(79,70,229,0.3)]"
                                                                : "bg-white/10 text-white rounded-bl-sm border border-white/5 hover:bg-white/15"
                                                                }`}>

                                                                {/* Edit Mode */}
                                                                {editingMessageId === msg.id ? (
                                                                    <div className="min-w-[200px]">
                                                                        <input
                                                                            type="text"
                                                                            value={editContent}
                                                                            onChange={(e) => setEditContent(e.target.value)}
                                                                            className="w-full bg-black/20 text-white text-sm rounded p-1 mb-2 border border-white/10"
                                                                            autoFocus
                                                                        />
                                                                        <div className="flex justify-end gap-2">
                                                                            <button onClick={() => setEditingMessageId(null)} className="text-[10px] text-white/50 hover:text-white">Cancel</button>
                                                                            <button onClick={handleEditMessage} className="text-[10px] bg-white/20 px-2 py-0.5 rounded hover:bg-white/30">Save</button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        {renderMessageContent(msg)}

                                                                        {msg.attachment_type === 'image' && (
                                                                            <div className="space-y-2">
                                                                                <img src={msg.attachment_url} className="rounded-lg max-w-full" />
                                                                                <p className="opacity-80 text-xs">{msg.content}</p>
                                                                            </div>
                                                                        )}

                                                                        {msg.attachment_type === 'audio' && (
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="flex items-center gap-0.5 h-4">
                                                                                    {[1, 2, 3, 4, 5].map(i => (
                                                                                        <motion.div
                                                                                            key={i}
                                                                                            animate={{ height: [4, 12, 4] }}
                                                                                            transition={{ repeat: Infinity, duration: 1, delay: i * 0.1 }}
                                                                                            className="w-1 bg-white/60 rounded-full"
                                                                                        />
                                                                                    ))}
                                                                                </div>
                                                                                <audio controls src={msg.attachment_url} className="h-8 w-40 opacity-80" />
                                                                            </div>
                                                                        )}

                                                                        {msg.attachment_type === 'file' && (
                                                                            <a
                                                                                href={msg.attachment_url}
                                                                                target="_blank"
                                                                                className={`flex items-center gap-2 p-2 rounded-lg ${isMe ? 'bg-black/20' : 'bg-white/10'}`}
                                                                            >
                                                                                <FileIcon className="w-4 h-4" />
                                                                                <span className="underline truncate max-w-[150px]">{msg.attachment_name}</span>
                                                                            </a>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>

                                                            {/* Reactions, Time, & Actions Row */}
                                                            <div className="flex items-center gap-2 px-1">
                                                                <span className="text-[9px] text-white/20 transition-opacity">
                                                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                    {msg.is_edited && <span className="ml-1 text-white/20">(edited)</span>}
                                                                </span>

                                                                {/* Render Existing Reactions */}
                                                                {reactionCounts.length > 0 && (
                                                                    <div className="flex gap-1">
                                                                        {reactionCounts.map(r => (
                                                                            <button
                                                                                key={r.emoji}
                                                                                onClick={() => handleReaction(msg, r.emoji)}
                                                                                className={`text-[10px] px-1.5 py-0.5 rounded-full border flex items-center gap-0.5 transition-colors ${r.hasReacted ? "bg-indigo-500/30 border-indigo-500/50 text-white" : "bg-white/5 border-white/5 text-white/50 hover:bg-white/10"}`}
                                                                            >
                                                                                <span>{r.emoji}</span>
                                                                                <span>{r.count}</span>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {/* Hover Actions */}
                                                                <div className="opacity-0 group-hover/msg:opacity-100 flex items-center gap-1 transition-opacity">
                                                                    {/* Reaction Picker Button */}
                                                                    <div className="relative group/emojis">
                                                                        <button className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white">
                                                                            <Smile className="w-3 h-3" />
                                                                        </button>
                                                                        <div className="absolute bottom-6 left-0 flex gap-1 bg-[#1A1A1A] border border-white/10 p-1.5 rounded-full shadow-xl opacity-0 group-hover/emojis:opacity-100 transition-opacity pointer-events-none group-hover/emojis:pointer-events-auto z-10 w-max">
                                                                            {reactionEmojis.map(emoji => (
                                                                                <button
                                                                                    key={emoji}
                                                                                    onClick={() => handleReaction(msg, emoji)}
                                                                                    className="hover:scale-125 transition-transform text-sm p-0.5"
                                                                                >
                                                                                    {emoji}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>

                                                                    {isMe && (
                                                                        <>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setEditingMessageId(msg.id);
                                                                                    setEditContent(msg.content);
                                                                                }}
                                                                                className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white"
                                                                            >
                                                                                <Edit2 className="w-3 h-3" />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleDeleteMessage(msg.id)}
                                                                                className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-red-400"
                                                                            >
                                                                                <Trash2 className="w-3 h-3" />
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* Typing Indicator at bottom of list */}
                                        {typingUsers.size > 0 && (
                                            <div className="flex items-center gap-2 pl-2">
                                                <div className="flex gap-1">
                                                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></span>
                                                </div>
                                                <span className="text-xs text-indigo-400 font-medium ml-1">
                                                    Someone is typing...
                                                </span>
                                            </div>
                                        )}

                                        <div ref={messagesEndRef} />
                                    </div>

                                    {/* Input Area - Glassmorphism */}
                                    <div className="p-4 bg-white/5 border-t border-white/5 backdrop-blur-md">
                                        {/* Quick Replies */}
                                        {!newMessage && (
                                            <div className="flex gap-2 mb-3 overflow-x-auto pb-2 custom-scrollbar">
                                                {quickReplies.map((reply, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => sendMessage(reply)}
                                                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-full text-[10px] text-white/60 hover:text-white whitespace-nowrap transition-all"
                                                    >
                                                        {reply}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-full border border-white/10 pl-4">
                                            {/* File Upload */}
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                className="hidden"
                                                onChange={handleFileUpload}
                                            />
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="text-white/40 hover:text-indigo-400 transition-colors"
                                            >
                                                <Paperclip className="w-4 h-4" />
                                            </button>

                                            {/* Voice Record */}
                                            <button
                                                onClick={isRecording ? stopRecording : startRecording}
                                                className={`transition-colors ${isRecording
                                                    ? "text-red-500 animate-pulse"
                                                    : "text-white/40 hover:text-white"
                                                    }`}
                                            >
                                                <Mic className="w-4 h-4" />
                                            </button>

                                            <div className="w-px h-4 bg-white/10 mx-1" />

                                            <input
                                                type="text"
                                                value={newMessage}
                                                onChange={handleInputChange}
                                                onKeyDown={(e) => e.key === 'Enter' && sendMessage(newMessage)}
                                                placeholder={profile?.id ? "Type a message..." : "Loading profile..."}
                                                disabled={!profile?.id}
                                                className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-white placeholder:text-white/30 h-9 disabled:opacity-50"
                                            />

                                            <button
                                                onClick={() => sendMessage(newMessage)}
                                                disabled={!newMessage.trim() || !profile?.id}
                                                className="w-9 h-9 bg-indigo-600 rounded-full flex items-center justify-center text-white hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all shadow-[0_0_15px_rgba(79,70,229,0.4)]"
                                            >
                                                {newMessage.trim() ? <Send className="w-4 h-4 ml-0.5" /> : <div className="w-2 h-2 bg-white/50 rounded-full" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- DIRECTORY TAB --- */}
                            {activeTab === 'directory' && (
                                <div className="h-full flex flex-col p-4 overflow-hidden">
                                    {/* Department Shortcuts */}
                                    <div className="mb-4">
                                        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                            <button
                                                onClick={() => setSelectedDepartment(null)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${selectedDepartment === null
                                                    ? "bg-indigo-600 text-white shadow-lg"
                                                    : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"
                                                    }`}
                                            >
                                                All
                                            </button>
                                            {departments.map(dept => (
                                                <button
                                                    key={dept}
                                                    onClick={() => setSelectedDepartment(dept)}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${selectedDepartment === dept
                                                        ? "bg-indigo-600 text-white shadow-lg"
                                                        : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"
                                                        }`}
                                                >
                                                    {dept}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="relative mb-4">
                                        <Search className="absolute left-3 top-3 w-4 h-4 text-white/30" />
                                        <input
                                            type="text"
                                            placeholder="Search colleagues..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:ring-1 focus:ring-indigo-500/50 outline-none hover:bg-white/10 transition-colors"
                                        />
                                    </div>

                                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                        {directory
                                            .filter(u => {
                                                const matchesSearch = `${u.first_name} ${u.last_name}`.toLowerCase().includes(searchQuery.toLowerCase());
                                                // Strict matching for precision
                                                const matchesDept = selectedDepartment ? u.role === selectedDepartment : true;
                                                return matchesSearch && matchesDept;
                                            })
                                            .map(u => (
                                                <div key={u.id} className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-white/5 group relative overflow-hidden">
                                                    {/* Hover highlight effect */}
                                                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                                    <div className="relative z-10">
                                                        {u.user_image ? (
                                                            <img src={u.user_image} className="w-10 h-10 rounded-full object-cover ring-2 ring-transparent group-hover:ring-white/10 transition-all scale-100 group-hover:scale-105" />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-indigo-400 font-bold border border-white/5 group-hover:border-indigo-500/30 transition-colors">
                                                                {u.first_name[0]}
                                                            </div>
                                                        )}
                                                        {/* Online Status Dot */}
                                                        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-[#0A0A0A] rounded-full group-hover:scale-110 transition-transform ${onlineUsers.has(u.id) ? "bg-green-500" : "bg-white/20"}`}></div>
                                                    </div>
                                                    <div className="flex-1 min-w-0 z-10">
                                                        <h3 className="font-bold text-white text-sm truncate group-hover:text-indigo-300 transition-colors">{u.first_name} {u.last_name}</h3>
                                                        <p className="text-xs text-white/40 font-medium truncate group-hover:text-white/60 transition-colors">{u.role}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            const defaultChannel = channels.find(c => c.name === "General") || channels[0];
                                                            if (defaultChannel) {
                                                                setActiveChannel(defaultChannel);
                                                                setNewMessage(`@${u.first_name} `);
                                                                setActiveTab('chat');
                                                            } else {
                                                                // No channels exist
                                                                setActiveTab('channels');
                                                                setIsCreatingChannel(true);
                                                            }
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 p-2 bg-indigo-500/20 text-indigo-400 rounded-lg hover:bg-indigo-600 hover:text-white transition-all z-10 transform translate-x-2 group-hover:translate-x-0"
                                                    >
                                                        <MessageSquare className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}

                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
