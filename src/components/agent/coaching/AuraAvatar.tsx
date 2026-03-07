"use client";

import { useState } from "react";
import Image from "next/image";

export default function AuraAvatar({ size = 32 }: { size?: number }) {
    const [imgError, setImgError] = useState(false);
    const fontSize = Math.max(12, Math.round(size * 0.4));

    return (
        <div
            className="relative shrink-0 rounded-full shadow-lg shadow-purple-500/20 overflow-hidden"
            style={{ width: size, height: size }}
        >
            {!imgError ? (
                <Image
                    src="/images/aura-avatar.png"
                    alt="Aura"
                    width={size}
                    height={size}
                    className="object-cover w-full h-full"
                    unoptimized
                    onError={() => setImgError(true)}
                />
            ) : (
                <div className="w-full h-full bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center">
                    <span
                        className="font-bold text-white/90 select-none"
                        style={{ fontSize }}
                    >
                        A
                    </span>
                </div>
            )}
            <div className="absolute inset-0 rounded-full animate-pulse bg-purple-500/10 pointer-events-none" />
        </div>
    );
}
