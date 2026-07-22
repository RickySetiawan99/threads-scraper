import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-zinc-100 text-zinc-900 shadow hover:bg-zinc-200",
        secondary:
          "border-transparent bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
        outline: "border-zinc-800 text-zinc-300",
        destructive:
          "border-rose-900/50 bg-rose-950/50 text-rose-300",
        emerald:
          "border-emerald-800/50 bg-emerald-950/50 text-emerald-300",
        indigo:
          "border-indigo-800/50 bg-indigo-950/50 text-indigo-300",
        amber:
          "border-amber-800/50 bg-amber-950/50 text-amber-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
