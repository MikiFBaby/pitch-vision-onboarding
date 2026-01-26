"use client";

import React from "react";

interface AuraVoiceIconProps {
    size?: number;
    className?: string;
}

// Clean, modern Aura Voice Icon - Futuristic Orb / Digital Core
// Minimalist design for AI feel
export const AuraVoiceIcon: React.FC<AuraVoiceIconProps> = ({
    size = 24,
    className = ""
}) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Core Neural Node */}
            <circle
                cx="12"
                cy="12"
                r="3.5"
                fill="currentColor"
            />

            {/* Spinning/Processing Ring Inner */}
            <circle
                cx="12"
                cy="12"
                r="6.5"
                stroke="currentColor"
                strokeWidth="1.2"
                opacity="0.6"
            />

            {/* Outer Digital Field - Dashed/Tech */}
            <path
                d="M12 2.5C17.2467 2.5 21.5 6.75329 21.5 12C21.5 17.2467 17.2467 21.5 12 21.5C6.75329 21.5 2.5 17.2467 2.5 12C2.5 6.75329 6.75329 2.5 12 2.5Z"
                stroke="currentColor"
                strokeWidth="0.8"
                strokeDasharray="3 4"
                strokeLinecap="round"
                opacity="0.4"
            />

            {/* Subtle Glint/Spark */}
            <circle cx="14.5" cy="9.5" r="1" fill="white" fillOpacity="0.4" />
        </svg>
    );
};

// Orb icon - Minimalist AI orb with subtle waves
export const AuraOrbIcon: React.FC<AuraVoiceIconProps> = ({
    size = 24,
    className = ""
}) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Central glowing orb */}
            <circle
                cx="12"
                cy="12"
                r="5"
                fill="currentColor"
            />

            {/* Inner ring */}
            <circle
                cx="12"
                cy="12"
                r="8"
                stroke="currentColor"
                strokeWidth="1"
                opacity="0.4"
            />

            {/* Outer dashed ring - AI/tech feel */}
            <circle
                cx="12"
                cy="12"
                r="10.5"
                stroke="currentColor"
                strokeWidth="0.75"
                opacity="0.25"
                strokeDasharray="3 2"
            />
        </svg>
    );
};

// Waveform mic - Modern mic with sound waves
export const AuraWaveIcon: React.FC<AuraVoiceIconProps> = ({
    size = 24,
    className = ""
}) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Left wave */}
            <path
                d="M4 10C5.5 8 5.5 16 4 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.5"
            />
            <path
                d="M7 8C9 5.5 9 18.5 7 16"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.7"
            />

            {/* Center mic circle */}
            <circle
                cx="12"
                cy="12"
                r="4"
                fill="currentColor"
            />

            {/* Right wave */}
            <path
                d="M17 8C15 5.5 15 18.5 17 16"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.7"
            />
            <path
                d="M20 10C18.5 8 18.5 16 20 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.5"
            />
        </svg>
    );
};
