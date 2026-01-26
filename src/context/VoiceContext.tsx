"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface VoiceSessionData {
    qaContext?: string;
    userName?: string;
    conversationHistory?: Array<{ role: string; content: string }>;
}

interface VoiceContextType {
    isOpen: boolean;
    voiceData: VoiceSessionData;
    openVoice: (data?: VoiceSessionData) => void;
    closeVoice: () => void;
    toggleVoice: () => void;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

export const VoiceProvider = ({ children }: { children: ReactNode }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [voiceData, setVoiceData] = useState<VoiceSessionData>({});

    const openVoice = (data?: VoiceSessionData) => {
        if (data) setVoiceData(data);
        setIsOpen(true);
    };

    const closeVoice = () => setIsOpen(false);

    const toggleVoice = () => setIsOpen(prev => !prev);

    return (
        <VoiceContext.Provider value={{ isOpen, voiceData, openVoice, closeVoice, toggleVoice }}>
            {children}
        </VoiceContext.Provider>
    );
};

export const useVoice = () => {
    const context = useContext(VoiceContext);
    if (context === undefined) {
        throw new Error('useVoice must be used within a VoiceProvider');
    }
    return context;
};
