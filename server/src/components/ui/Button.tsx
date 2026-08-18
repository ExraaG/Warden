import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 select-none box-border leading-none",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--color-accent)] text-[#0d0e11] font-semibold hover:bg-[var(--color-accent-hover)] shadow-sm active:opacity-90",
        secondary:
          "bg-[var(--bg-card)] text-slate-100 border border-[var(--color-border)] hover:bg-[var(--bg-surface)] active:bg-[var(--bg-main)]",
        danger:
          "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm",
        outline:
          "border border-[var(--color-border)] bg-transparent text-slate-200 hover:bg-[var(--bg-card)] hover:border-[var(--color-accent)] active:bg-[var(--bg-surface)]",
        ghost:
          "hover:bg-[var(--bg-card)] text-slate-300 active:bg-[var(--bg-surface)]",
      },
      size: {
        xs: "h-6.5 px-2 text-[11px] gap-1",
        sm: "h-[29px] px-2.5 sm:px-3 text-xs gap-1.5",
        md: "h-9 px-4 text-sm gap-2",
        lg: "h-10 px-6 text-base gap-2.5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <span className="inline-block animate-spin text-current border-2 border-t-transparent rounded-full w-3.5 h-3.5 mr-1" />
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
