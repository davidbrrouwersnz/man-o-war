import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
        /* ---------------------------------------------------------------- this app's own
           The three variants below are the museum's controls. They exist as variants rather than as
           rules in styles.css because a shadcn component styles itself with Tailwind utilities,
           which sit in the last cascade layer — anything styles.css says about them loses.

           Their colours come from --control-ink / --control-edge / --control-ground, which flip to
           the dark palette inside the collection header and back again at desktop. That keeps the
           §15 boundary decision in CSS, where it is documented and where scripts/contrast.mjs can
           still reach the values, instead of hard-coding a light-on-dark choice into a component
           that has no idea what it is sitting on.

           The focus ring is put back to the app's outline. shadcn's base sets outline-none and
           draws a box-shadow ring instead, which would have left these four controls with a focus
           style no other focusable thing in the app uses — and links are most of what is focusable
           here. --control-ring flips with the rest on the dark header.

           `data-playing` rather than aria-pressed: the playing state is already carried to a screen
           reader by the label, which switches between "Listen — <name>" and "Stop listening", and
           adding a pressed state on top would announce it twice. */
        quiet:
          "border-[var(--control-edge)] bg-transparent text-[var(--control-ink)] hover:border-[var(--control-ink)] data-[playing=true]:bg-[var(--control-ink)] data-[playing=true]:text-[var(--control-ground)] focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--control-ring)]",
        bare: "border-transparent bg-transparent text-[var(--control-ink)] hover:bg-muted focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--control-ring)]",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
        /* 44px, the floor WCAG 2.5.8 sets and §18 repeats. Every size shadcn ships is under it —
           the default is h-8, which is 32 — so a control built from those would have failed the
           target-size check the moment it was adopted. In rem, so it grows with the text-size
           setting like the rest of the app. Not a fixed height: min-, so a wrapped label still
           fits. */
        touch: "min-h-11 gap-2 rounded-full px-4 py-2 text-[length:var(--step-0)] [&_svg:not([class*='size-'])]:size-[1.15em]",
        "icon-touch": "min-h-11 min-w-11 rounded-full [&_svg:not([class*='size-'])]:size-[1.15em]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props} />
  );
}

export { Button, buttonVariants }
