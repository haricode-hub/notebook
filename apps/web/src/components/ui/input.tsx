import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, Search } from "lucide-react";
import { Icon } from "@/components/icons/Icon";
import { cn } from "@/lib/cn";
const fieldClass = "focus-ring h-8 w-full rounded-sm border border-border bg-raised px-3 text-body text-fg transition-colors duration-fast placeholder:text-fg-tertiary hover:border-border-strong focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:text-fg-disabled";
export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => <input type={type} className={cn(fieldClass, className)} ref={ref} {...props} />);
Input.displayName = "Input";
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(({ className, ...props }, ref) => <textarea className={cn(fieldClass, "min-h-20 resize-y py-2", className)} ref={ref} {...props} />);
Textarea.displayName = "Textarea";
type SelectProps = Omit<React.ComponentProps<"select">, "onChange" | "children" | "value" | "defaultValue" | "ref"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
};
export function Select({ className, children, value, defaultValue, onValueChange, disabled, id, name, required, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy }: SelectProps) {
  const options = React.Children.toArray(children).filter(React.isValidElement).map((child) => child as React.ReactElement<{ value?: string; disabled?: boolean; children?: React.ReactNode }>);
  const emptyOption = options.find((option) => option.props.value === "");
  const placeholder = emptyOption?.props.children;
  return <SelectPrimitive.Root value={value || undefined} defaultValue={defaultValue || undefined} onValueChange={onValueChange} disabled={disabled} name={name} required={required}>
    <SelectPrimitive.Trigger id={id} aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} disabled={disabled} className={cn("focus-ring flex h-8 w-full items-center justify-between rounded-sm border border-border bg-raised px-3 text-left text-body text-fg transition-colors duration-fast hover:border-border-strong focus:border-accent disabled:cursor-not-allowed disabled:text-fg-disabled", className)}>
      <SelectPrimitive.Value className="min-w-0 flex-1 truncate whitespace-nowrap" placeholder={placeholder} />
      <SelectPrimitive.Icon asChild><Icon icon={ChevronDown} size={14} className="text-fg-tertiary" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal><SelectPrimitive.Content position="popper" sideOffset={4} onEscapeKeyDown={(event) => event.stopPropagation()} className="ui-select-content z-50 max-h-64 overflow-hidden rounded-md border border-border bg-raised shadow-md"><SelectPrimitive.Viewport className="max-h-64 overflow-y-auto p-1">{options.filter((option) => option.props.value !== "").map((option, index) => {
      const optionValue = option.props.value ?? (typeof option.props.children === "string" ? option.props.children : String(index));
      return <SelectPrimitive.Item key={optionValue} value={optionValue} disabled={option.props.disabled} className="relative flex h-8 cursor-pointer select-none items-center rounded-sm py-1 pl-8 pr-2.5 text-body text-fg outline-none data-[highlighted]:bg-hover data-[state=checked]:bg-accent-soft data-[state=checked]:text-accent-soft-fg data-[disabled]:pointer-events-none data-[disabled]:text-fg-disabled"><span className="absolute left-2 inline-flex size-4 items-center justify-center"><SelectPrimitive.ItemIndicator><Icon icon={Check} size={14} /></SelectPrimitive.ItemIndicator></span><SelectPrimitive.ItemText>{option.props.children}</SelectPrimitive.ItemText></SelectPrimitive.Item>;
    })}</SelectPrimitive.Viewport></SelectPrimitive.Content></SelectPrimitive.Portal>
  </SelectPrimitive.Root>;
}
export const SearchInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, ...props }, ref) => <span className="ui-input-icon relative block"><Icon icon={Search} className="pointer-events-none absolute left-3 top-2 text-fg-tertiary" /><Input ref={ref} type="search" className={cn("pl-10", className)} {...props} /></span>);
SearchInput.displayName = "SearchInput";
