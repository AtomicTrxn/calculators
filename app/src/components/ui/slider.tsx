import * as SliderPrimitive from '@radix-ui/react-slider'
import { forwardRef } from 'react'

import { cn } from '@/lib/utils'

export const Slider = forwardRef<React.ComponentRef<typeof SliderPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>>(
  ({ className, ...props }, ref) => (
    <SliderPrimitive.Root ref={ref} className={cn('relative flex w-full touch-none select-none items-center', className)} {...props}>
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-line">
        <SliderPrimitive.Range className="absolute h-full bg-frost" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-frost bg-white shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-frost disabled:pointer-events-none disabled:opacity-50" />
    </SliderPrimitive.Root>
  ),
)
Slider.displayName = SliderPrimitive.Root.displayName
