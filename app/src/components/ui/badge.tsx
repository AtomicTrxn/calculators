import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'border-good/40 bg-good/10 text-good',
      // bg-paper, not bg-sand: this badge often sits directly on the page
      // background (e.g. the header toolbar), which IS sand — a sand-on-sand
      // badge would be invisible but for its border.
      neutral: 'border-line bg-paper text-muted',
      warn: 'border-warn/40 bg-warn/10 text-warn',
      bad: 'border-coral/40 bg-coral/10 text-coral',
    },
  },
  defaultVariants: { variant: 'default' },
})

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />
}
