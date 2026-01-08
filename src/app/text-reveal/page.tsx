"use client";

import { RevealText } from "@/components/ui/reveal-text";

export default function DemoPage() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-4">
            <RevealText
                text="STUNNING"
                textColor="text-white"
                overlayColor="text-red-500"
                fontSize="text-[60px] md:text-[125px]"
                letterDelay={0.08}
                overlayDelay={0.05}
                overlayDuration={0.4}
                springDuration={600}
            />
            <p className="mt-8 font-mono text-white/40 tracking-widest uppercase text-sm">Hover over the text</p>
        </div>
    );
}
