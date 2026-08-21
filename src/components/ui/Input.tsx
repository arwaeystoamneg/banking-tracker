import { type InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`h-12 w-full rounded-xl border border-border bg-surface-inset px-3.5 text-base text-foreground outline-none transition-colors placeholder:text-muted/70 focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/20 ${className}`}
      {...props}
    />
  ),
);
Input.displayName = "Input";
