import { useState, type ReactNode } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'

import { cn } from '@/lib/utils'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  className?: string
  paymentMethods: {
    name: string
    image: string
    value: string
    cardType: string
  }[]
}

const PaymentMethodDialog = ({ defaultOpen = false, trigger, paymentMethods, className }: Props) => {
  const [open, setOpen] = useState(defaultOpen)

  const [selected, setSelected] = useState<string>('american-express')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild onClick={() => setOpen(true)}>
        {trigger}
      </DialogTrigger>
      <DialogContent className={cn('sm:max-w-145 [&>[data-slot=dialog-close]>svg]:size-5', className)}>
        <DialogHeader className='my-6 items-center'>
          <DialogTitle className='leading-7'>Select payment methods</DialogTitle>
          <DialogDescription>Supported Payment method</DialogDescription>
        </DialogHeader>
        <RadioGroup defaultValue={selected} className='gap-3' onValueChange={setSelected}>
          {paymentMethods.map((method, index) => (
            <div key={method.value} className='flex flex-col gap-3'>
              <div className='has-data-[state=checked]:bg-accent hover:bg-accent relative flex items-center gap-6 rounded-lg px-3 py-2'>
                <div className='flex flex-1 items-center gap-6'>
                  <img src={method.image} alt={method.name} className='w-15 rounded-sm' />
                  <Label htmlFor={method.value} className='text-base'>
                    {method.name}
                  </Label>
                  <span className='text-muted-foreground flex-1 text-end text-sm capitalize'>{method.cardType}</span>
                </div>
                <RadioGroupItem value={method.value} id={method.value} className='after:absolute after:inset-0' />
              </div>
              {index !== paymentMethods.length - 1 && <Separator />}
            </div>
          ))}
        </RadioGroup>
      </DialogContent>
    </Dialog>
  )
}

export default PaymentMethodDialog
