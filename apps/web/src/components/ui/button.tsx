import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/icons/Icon";

const buttonVariants = cva("ui-button pressable focus-ring inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition-colors duration-fast ease-out disabled:pointer-events-none disabled:text-fg-disabled disabled:opacity-60", { variants: { variant: {
  default: "bg-accent text-fg-on-accent hover:bg-accent-hover active:bg-accent-active",
  primary: "bg-accent text-fg-on-accent hover:bg-accent-hover active:bg-accent-active",
  outline: "border border-border bg-raised text-fg hover:border-border-strong hover:bg-hover active:bg-active",
  secondary: "border border-border bg-raised text-fg hover:border-border-strong hover:bg-hover active:bg-active",
  ghost: "bg-transparent text-fg-secondary hover:bg-hover hover:text-fg active:bg-active",
  destructive: "bg-danger text-fg-on-accent hover:opacity-90",
  danger: "bg-danger text-fg-on-accent hover:opacity-90",
  link: "bg-transparent p-0 text-accent underline-offset-4 hover:underline",
}, size: { default: "h-8 px-3 text-body", sm: "h-7 px-2.5 text-small", lg: "h-10 px-4 text-body", icon: "ui-icon-button size-8 p-0", "icon-sm": "ui-icon-button size-7 p-0", "icon-lg": "ui-icon-button size-9 p-0" } }, defaultVariants: { variant: "default", size: "default" } });

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean; loading?: boolean; }
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
  const classes = cn(buttonVariants({ variant, size, className }));
  if (asChild) return <Slot className={classes} ref={ref} aria-busy={loading || undefined} {...props}>{children}</Slot>;
  return <button className={classes} ref={ref} aria-busy={loading || undefined} disabled={disabled || loading} {...props}>{loading ? <Icon icon={LoaderCircle} className="animate-spin" /> : null}{children}</button>;
});
Button.displayName = "Button";
export { Button, buttonVariants };
