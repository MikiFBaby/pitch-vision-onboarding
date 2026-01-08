import React from "react";
import { Search, MessageCircle } from "lucide-react";

interface NavLink {
    href: string;
    label: string;
}

interface HeroSectionProps {
    backgroundImage: string;
    logoText?: string;
    logoImage?: string;
    navLinks?: NavLink[];
    versionText?: string;
    title?: string;
    subtitle?: string;
    ctaText?: string;
    onCtaClick?: () => void;
}

export default function HeroSection({
    backgroundImage,
    logoText = "Brand",
    logoImage,
    navLinks = [],
    versionText = "",
    title = "",
    subtitle = "",
    ctaText = "Click",
    onCtaClick,
}: HeroSectionProps) {
    return (
        <>
            <header className="absolute inset-x-0 top-0 p-6 md:p-8 z-10 text-white">
                <div className="container mx-auto flex justify-between items-center">
                    <div className="text-3xl font-bold">
                        {logoImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logoImage} alt={logoText} className="h-12 w-auto object-contain" />
                        ) : (
                            logoText
                        )}
                    </div>
                    <nav className="hidden md:flex space-x-8 text-sm">
                        {navLinks.map((link) => (
                            <a
                                key={link.href}
                                href={link.href}
                                className="hover:text-gray-300 transition-colors"
                                onClick={(e) => e.preventDefault()} // Prevent nav for demo
                            >
                                {link.label}
                            </a>
                        ))}
                    </nav>
                    <div className="flex items-center space-x-4">
                        <button
                            type="button"
                            aria-label="Search"
                            className="hover:text-gray-300"
                        >
                            <Search className="h-6 w-6" />
                        </button>
                        <button
                            onClick={onCtaClick}
                            className="border border-white rounded-full px-6 py-2 text-sm font-medium hover:bg-white hover:text-black transition-colors"
                        >
                            Join
                        </button>
                    </div>
                </div>
            </header>

            <main
                className="w-full bg-cover bg-center bg-no-repeat absolute inset-0 -z-10"
                style={{ backgroundImage: `url(${backgroundImage})`, height: '100vh' }}
            >
                <div className="absolute inset-0 bg-black/40" /> {/* Overlay for readability */}
                <div className="container mx-auto h-screen flex items-center px-6 md:px-8 relative z-0">
                    <div className="w-full md:w-1/2 lg:w-2/5 text-white">
                        <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-4">
                            {title}
                        </h1>
                        <p className="text-md text-gray-200 max-w-md mb-8">
                            {subtitle}
                        </p>
                        <button
                            onClick={onCtaClick}
                            className="bg-white text-black font-bold px-8 py-3 rounded-md hover:bg-gray-200 transition-colors"
                        >
                            {ctaText}
                        </button>
                    </div>
                </div>
            </main>

            <footer className="absolute inset-x-0 bottom-0 p-6 md:p-8 text-white z-10">
                <div className="container mx-auto flex justify-between items-center">
                    <div className="text-sm">{versionText}</div>
                    <button
                        type="button"
                        aria-label="Chat"
                        className="bg-white/10 backdrop-blur-sm rounded-full h-12 w-12 flex items-center justify-center hover:bg-white/20 transition-colors"
                    >
                        <MessageCircle className="h-6 w-6" />
                    </button>
                </div>
            </footer>
        </>
    );
}
