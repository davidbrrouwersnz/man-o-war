import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  getAriaValueText,
  ...props
}) {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max]

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}>
      <SliderPrimitive.Control
        className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-muted select-none data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1">
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-[var(--brand)] select-none data-horizontal:h-full data-vertical:w-full" />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            /* Base UI hangs this on the Thumb, not the Root, so it has to be threaded through.
               Without it the scrubber announces a raw number of seconds — "134" — which tells a
               screen-reader user nothing. It is the one string in the app a blind visitor depends
               on to scrub, so it is passed explicitly rather than left to the spread. */
            getAriaValueText={getAriaValueText}
            /* Three edits to what shadcn ships, all about this being a scrubber on a phone.

               size-4 not size-3: a 12px dot is hard to see against a track while it moves.

               after:-inset-3.5 not -inset-2: the ::after is the touch target, and at -inset-2 it
               came to 28px against WCAG 2.5.8's 44. Grabbing a small dot on a moving bar with a
               thumb is precisely what that rule is for. 16 + 14 + 14 = 44. This cannot be fixed
               from styles.css — Tailwind utilities sit in the last cascade layer, so the component
               is the only place the value can be changed.

               bg-white becomes the brand red, which is what accent-color painted on the native
               range this replaces. bg-white was the one hard-coded colour in the file, outside the
               palette scripts/contrast.mjs asserts. */
            className="relative block size-4 shrink-0 rounded-full border border-[var(--brand)] bg-[var(--brand)] ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-3.5 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50" />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider }
