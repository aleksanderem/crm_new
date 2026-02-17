import { useState, type ReactNode } from 'react'

import { ArrowRightIcon } from '@/lib/ez-icons'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

import { cn } from '@/lib/utils'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  className?: string
  maxSeats?: number
  perSeatsPrice?: number
}

const ChooseSeatsDialog = ({ defaultOpen = false, trigger, className, maxSeats = 24, perSeatsPrice = 19 }: Props) => {
  const [open, setOpen] = useState(defaultOpen)
  const [seats, setSeats] = useState<number>(12) // Default value for the slider

  const seatPrice = perSeatsPrice

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild onClick={() => setOpen(true)}>
        {trigger}
      </DialogTrigger>
      <DialogContent className={cn('sm:max-w-145 [&>[data-slot=dialog-close]>svg]:size-5', className)}>
        <DialogHeader>
          <DialogTitle className='leading-7'>Choose Seats</DialogTitle>
          <DialogDescription className='max-w-sm'>Select how many seats you need in your plan.</DialogDescription>
        </DialogHeader>

        <div className='flex flex-col items-center gap-6 py-6 text-center'>
          <span className='text-6xl font-semibold'>{seats}</span>
          <Slider
            value={[seats]}
            onValueChange={([val]) => setSeats(val)}
            max={maxSeats}
            step={1}
            className='[&>[data-slot=slider-track]]:h-2'
          />
        </div>

        <div className='space-y-4'>
          <div className='flex items-center justify-between gap-2'>
            <span className='text-muted-foreground'>Price per seat</span>
            <span className='font-semibold'>${seatPrice}</span>
          </div>
          <div className='flex items-center justify-between gap-2'>
            <span className='text-muted-foreground'>Total seats price</span>
            <span className='font-semibold'>${seatPrice * seats}</span>
          </div>
          <div className='flex items-center justify-between gap-2'>
            <span className='text-muted-foreground'>Total per month (annual pricing)</span>
            <span className='font-semibold'>${((seatPrice * seats * 12 * 0.8) / 12).toFixed(2)}</span>
          </div>
          <div className='flex items-center gap-2'>
            <Switch id='annual-pricing' />
            <Label htmlFor='annual-pricing' className='text-base font-normal'>
              Annual pricing
            </Label>
            <Badge className='bg-green-600/10 text-green-600 focus-visible:ring-green-600/20 focus-visible:outline-none dark:bg-green-400/10 dark:text-green-400 dark:focus-visible:ring-green-400/40 [a&]:hover:bg-green-600/5 dark:[a&]:hover:bg-green-400/5'>
              Save 20%
            </Badge>
          </div>
        </div>

        <DialogFooter className='gap-4'>
          <DialogClose asChild>
            <Button variant='outline' size='lg' className='sm:flex-1'>
              Back to Page
            </Button>
          </DialogClose>
          <Button size='lg' className='sm:flex-1'>
            Payment Details
            <ArrowRightIcon />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ChooseSeatsDialog
