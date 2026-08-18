import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  status?: string
}

function Badge({ className, variant, status, ...props }: BadgeProps) {
  if (status) {
    const isOnline = status === 'online'
    const isStarting = status === 'starting'
    const isError = status === 'error'

    return (
      <span
        className={cn(
          "px-2 py-0.5 rounded-full text-[10px] uppercase font-mono font-bold flex items-center justify-center shadow-sm border",
          isOnline
            ? "bg-emerald-950/60 text-[var(--color-accent)] border-emerald-500"
            : isStarting
            ? "bg-amber-950/60 text-amber-400 border-amber-500/50"
            : isError
            ? "bg-red-950/60 text-red-400 border-red-500/50"
            : "bg-slate-800/60 text-slate-400 border-slate-700/60",
          className
        )}
        {...props}
      >
        {status}
      </span>
    )
  }

  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
