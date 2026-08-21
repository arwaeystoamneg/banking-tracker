import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-emerald-600 text-white shadow-sm shadow-emerald-950/40 active:bg-emerald-700 disabled:opacity-50",
  secondary: "bg-surface-raised text-foreground border border-border active:bg-neutral-800 disabled:opacity-50",
  ghost: "bg-transparent text-foreground active:bg-white/5 disabled:opacity-50",
  danger: "bg-red-600/90 text-white active:bg-red-700 disabled:opacity-50",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }>(
  ({ className = "", variant = "primary", ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition-colors active:scale-[0.98] ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  ),
);
Button.displayName = "Button";
