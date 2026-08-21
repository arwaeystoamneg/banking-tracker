import { type InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`h-12 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground outline-none focus:border-neutral-500 ${className}`}
      {...props}
    />
  ),
);
Input.displayName = "Input";
