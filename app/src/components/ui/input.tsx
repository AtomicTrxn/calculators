import { forwardRef } from 'react'

import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      'flex h-10 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-navy placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-frost disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    ref={ref}
    {...props}
  />
))
Input.displayName = 'Input'
