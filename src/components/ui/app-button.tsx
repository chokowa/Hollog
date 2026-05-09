import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type AppButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    block?: boolean;
  }
>;

const variantClassNames: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(3,2,19,0.16)] hover:bg-primary/90",
  secondary:
    "bg-[var(--secondary-soft)] text-[var(--secondary)] hover:bg-[#cddcff]",
  ghost:
    "bg-card/70 text-[var(--foreground)] hover:bg-card",
  danger:
    "bg-[var(--danger)] text-white shadow-[0_12px_24px_rgba(211,81,81,0.22)] hover:brightness-95",
};

export function AppButton({
  children,
  className = "",
  variant = "primary",
  block = false,
  ...props
}: AppButtonProps) {
  return (
    <button
      className={[
        "inline-flex h-11 items-center justify-center rounded-2xl px-4 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-55",
        variantClassNames[variant],
        block ? "w-full" : "",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
