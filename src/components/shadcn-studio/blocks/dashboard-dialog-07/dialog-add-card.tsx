import { useState, type ReactNode } from 'react'

import { CreditCardIcon } from '@/lib/ez-icons'

import { usePaymentInputs } from 'react-payment-inputs'
import images, { type CardImages } from 'react-payment-inputs/images'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

import { cn } from '@/lib/utils'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  className?: string
}

const AddCardDialog = ({ defaultOpen = false, trigger, className }: Props) => {
  const [open, setOpen] = useState(defaultOpen)

  const { meta, getCardNumberProps, getCardImageProps, getExpiryDateProps, getCVCProps } = usePaymentInputs()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild onClick={() => setOpen(true)}>
        {trigger}
      </DialogTrigger>
      <DialogContent className={cn('sm:max-w-145 [&>[data-slot=dialog-close]>svg]:size-5', className)}>
        <DialogHeader className='items-center'>
          <DialogTitle className='leading-7'>Add New Card</DialogTitle>
          <DialogDescription>Add new card to complete payment</DialogDescription>
        </DialogHeader>

        <div className='grid grid-cols-4 gap-4'>
          <div className='col-span-4 space-y-1'>
            <Label htmlFor='card-number'>Card number</Label>
            <div className='relative'>
              <Input {...getCardNumberProps()} id='card-number' className='peer pl-10' />
              <div className='text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center justify-center pr-3 peer-disabled:opacity-50'>
                {meta.cardType ? (
                  <svg
                    className='w-6 overflow-hidden'
                    {...getCardImageProps({
                      images: images as unknown as CardImages
                    })}
                  />
                ) : (
                  <CreditCardIcon className='size-4' />
                )}
                <span className='sr-only'>Card Provider</span>
              </div>
            </div>
          </div>

          <div className='col-span-4 space-y-1 sm:col-span-2'>
            <Label htmlFor='username'>Name</Label>
            <Input id='username' type='text' placeholder='John Doe' />
          </div>

          <div className='space-y-1 max-sm:col-span-2'>
            <Label htmlFor='expiry-date'>Expiry date</Label>
            <Input {...getExpiryDateProps()} id='expiry-date' />
          </div>

          <div className='space-y-1 max-sm:col-span-2'>
            <Label htmlFor='cvc'>CVC code</Label>
            <Input {...getCVCProps()} id='cvc' />
          </div>
        </div>

        <div className='flex items-center gap-2'>
          <Switch id='save-card' />
          <Label htmlFor='save-card'>Save card for future billing?</Label>
        </div>

        <DialogFooter className='flex-row !justify-center gap-4'>
          <Button size='lg'>Submit</Button>
          <Button variant='outline' size='lg'>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AddCardDialog
