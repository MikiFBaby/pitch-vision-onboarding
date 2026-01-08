"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FeedItem {
    id: string;
    agent_name: string;
    date: string;
    campaign: string;
    location: string;
    type: 'hire' | 'fire';
    reason?: string;
    created_at: string;
}

export default function HRLiveFeed() {
    const [feedItems, setFeedItems] = useState<FeedItem[]>([]);

    const fetchFeedData = async () => {
        // Fetch recent hires
        const { data: hires, error: hiresError } = await supabase
            .from('HR Hired')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);

        console.log('Hires data:', hires);
        console.log('Hires error:', hiresError);

        // Fetch recent fires
        const { data: fires, error: firesError } = await supabase
            .from('HR Fired')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);

        console.log('Fires data:', fires);
        console.log('Fires error:', firesError);

        // Combine and format with correct column names
        const combinedFeed: FeedItem[] = [
            ...(hires || []).map(h => ({
                id: h['Agent Name'] + h.created_at, // Use Agent Name + timestamp as unique id
                agent_name: h['Agent Name'],
                date: h['Hire Date'],
                campaign: h['Campaign'],
                location: h['Canadian/American'],
                type: 'hire' as const,
                created_at: h.created_at
            })),
            ...(fires || []).map(f => ({
                id: f['ID'], // Use the ID column
                agent_name: f['Agent Name'],
                date: f['Termination Date'],
                campaign: f['Campaign'],
                location: f['Canadian/American'],
                type: 'fire' as const,
                reason: f['Reason for Termination'],
                created_at: f.created_at
            }))
        ];

        console.log('Combined feed:', combinedFeed);

        // Sort by created_at
        combinedFeed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setFeedItems(combinedFeed.slice(0, 15));
    };

    useEffect(() => {
        fetchFeedData();

        // Real-time subscription for hires
        const hiresChannel = supabase
            .channel('live-hires')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'HR Hired' },
                () => fetchFeedData()
            )
            .subscribe();

        // Real-time subscription for fires
        const firesChannel = supabase
            .channel('live-fires')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'HR Fired' },
                () => fetchFeedData()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(hiresChannel);
            supabase.removeChannel(firesChannel);
        };
    }, []);

    return (
        <div className="bg-gradient-to-br from-white to-gray-50 p-8 rounded-2xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 uppercase tracking-wider">Live Activity Feed</h3>
                    <p className="text-xs text-gray-500 mt-1">Real-time employee changes</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-gray-600 font-semibold">Live</span>
                </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
                <AnimatePresence>
                    {feedItems.map((item, index) => (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ delay: index * 0.05 }}
                            className={`p-4 rounded-xl border-l-4 transition-all hover:shadow-md ${item.type === 'hire'
                                ? 'bg-green-50 border-green-500'
                                : 'bg-red-50 border-red-500'
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1">
                                    <div className={`p-2 rounded-lg ${item.type === 'hire' ? 'bg-green-100' : 'bg-red-100'
                                        }`}>
                                        {item.type === 'hire' ? (
                                            <TrendingUp className="w-5 h-5 text-green-600" />
                                        ) : (
                                            <TrendingDown className="w-5 h-5 text-red-600" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-gray-900">{item.agent_name}</span>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${item.type === 'hire'
                                                ? 'bg-green-200 text-green-800'
                                                : 'bg-red-200 text-red-800'
                                                }`}>
                                                {item.type === 'hire' ? 'Hired' : 'Terminated'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                                            <span className="font-semibold">{item.campaign}</span>
                                            <span>•</span>
                                            <span>{item.location}</span>
                                            <span>•</span>
                                            <span>{new Date(item.date).toLocaleDateString()}</span>
                                        </div>
                                        {item.reason && (
                                            <p className="text-xs text-gray-500 mt-1 italic">Reason: {item.reason}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {feedItems.length === 0 && (
                    <div className="text-center py-12 text-gray-400">
                        <p className="text-sm">No activity yet</p>
                    </div>
                )}
            </div>
        </div>
    );
}
