import React from 'react'
import { cn } from '@/lib/utils'
import { VariantProps, cva } from "class-variance-authority";

const buttonVariants = cva(
    "relative group border text-foreground mx-auto text-center rounded-full transition-all duration-300 ease-out overflow-hidden",
    {
        variants: {
            variant: {
                default: "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 text-white backdrop-blur-md shadow-[0_0_20px_-5px_rgba(168,85,247,0.3)]",
                solid: "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-white/10 hover:border-white/20 shadow-lg shadow-purple-900/40",
                ghost: "border-transparent bg-transparent hover:border-purple-500/30 hover:bg-white/5 text-purple-200 hover:text-white",
            },
            size: {
                default: "px-7 py-3",
                sm: "px-4 py-1.5 text-xs",
                lg: "px-10 py-4 text-lg font-bold",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "solid" | "ghost" | null;
    size?: "default" | "sm" | "lg" | null;
    neon?: boolean;
}

const NeonButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, neon = true, size, variant, children, ...props }, ref) => {
        return (
            <button
                className={cn(buttonVariants({ variant, size }), className)}
                ref={ref}
                {...props}
            >
                {/* Glassy Top Highlight for Solid Buttons */}
                {variant === 'solid' && (
                    <div className="absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-white/20 to-transparent opacity-100 pointer-events-none" />
                )}

                {/* Animated Border Gradient */}
                <span className={cn("absolute h-px opacity-0 group-hover:opacity-100 transition-all duration-500 ease-in-out inset-x-0 inset-y-0 bg-gradient-to-r w-3/4 mx-auto from-transparent via-purple-300 to-transparent hidden", neon && "block")} />

                <div className="relative z-10 flex items-center justify-center gap-2.5">
                    {children}
                </div>

                {/* Bottom Border Gradient */}
                <span className={cn("absolute group-hover:opacity-60 transition-all duration-500 ease-in-out inset-x-0 h-px -bottom-px bg-gradient-to-r w-3/4 mx-auto from-transparent via-purple-300 to-transparent hidden", neon && "block")} />

                {/* Internal Glow for Extra Depth */}
                {variant === 'default' && (
                    <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 bg-purple-500/10 blur-xl transition-opacity duration-500 -z-10" />
                )}
            </button>
        );
    }
)

NeonButton.displayName = 'NeonButton';

export { NeonButton, buttonVariants };