'use client'

import { useState, type ReactNode } from 'react'

import { BuildingIcon, HouseIcon } from '@/lib/ez-icons'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

import { cn } from '@/lib/utils'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  className?: string
}

const countries = [
  { value: 'india', label: 'India', flag: 'https://cdn.shadcnstudio.com/ss-assets/flags/india.png' },
  { value: 'china', label: 'China', flag: 'https://cdn.shadcnstudio.com/ss-assets/flags/china.png' },
  { value: 'monaco', label: 'Monaco', flag: 'https://cdn.shadcnstudio.com/ss-assets/flags/monaco.png' },
  { value: 'serbia', label: 'Serbia', flag: 'https://cdn.shadcnstudio.com/ss-assets/flags/serbia.png' },
  { value: 'romania', label: 'Romania', flag: 'https://cdn.shadcnstudio.com/ss-assets/flags/romania.png' },
  { value: 'mayotte', label: 'Mayotte', flag: 'https://cdn.shadcnstudio.com/ss-assets/flags/mayotte.png' },
  { value: 'iraq', label: 'Iraq', flag: 'https://cdn.shadcnstudio.com/ss-assets/flags/iraq.png' },
  { value: 'syria', label: 'Syria', flag: 'https://cdn.shadcnstudio.com/ss-assets/flags/syria.png' },
  { value: 'korea', label: 'Korea', flag: 'https://cdn.shadcnstudio.com/ss-assets/flags/korea.png' },
  { value: 'zimbabwe', label: 'Zimbabwe', flag: 'https://cdn.shadcnstudio.com/ss-assets/flags/zimbabwe.png' }
]

const AddAddressDialog = ({ defaultOpen = false, trigger, className }: Props) => {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild onClick={() => setOpen(true)}>
        {trigger}
      </DialogTrigger>
      <DialogContent
        className={cn(
          'flex flex-col gap-0 p-0 max-sm:max-h-[min(650px,80vh)] sm:max-w-145 [&>[data-slot=dialog-close]>svg]:size-5',
          className
        )}
      >
        <ScrollArea className='flex max-h-full flex-col overflow-hidden'>
          <div className='flex flex-col gap-4 p-6'>
            <DialogHeader className='items-center'>
              <DialogTitle className='leading-7'>Add New Address</DialogTitle>
              <DialogDescription>Add new address for express delivery</DialogDescription>
            </DialogHeader>

            <div className='grid gap-x-6 gap-y-4 md:grid-cols-2'>
              <RadioGroup className='gap-6 sm:grid-cols-2 md:col-span-2' defaultValue='home'>
                <div className='border-input has-data-[state=checked]:border-primary/50 relative flex w-full flex-col items-center gap-4 rounded-md border p-3 outline-none'>
                  <RadioGroupItem
                    value='home'
                    id='home-address'
                    className='order-1 after:absolute after:inset-0'
                    aria-label='plan-radio-basic'
                  />
                  <HouseIcon className='size-8 stroke-1' />
                  <div className='flex grow flex-col items-center gap-2 text-center'>
                    <Label htmlFor='home-address' className='text-base'>
                      Home
                    </Label>
                    <p className='text-muted-foreground text-sm'>Delivery time (9am - 9pm)</p>
                  </div>
                </div>
                <div className='border-input has-data-[state=checked]:border-primary/50 relative flex w-full flex-col items-center gap-4 rounded-md border p-3 outline-none'>
                  <RadioGroupItem
                    value='2'
                    id='office-address'
                    className='order-1 after:absolute after:inset-0'
                    aria-label='plan-radio-premium'
                  />
                  <BuildingIcon className='size-8 stroke-1' />
                  <div className='flex grow flex-col items-center gap-2 text-center'>
                    <Label htmlFor='office-address' className='text-base'>
                      Office
                    </Label>
                    <p className='text-muted-foreground text-sm'>Delivery time (9am - 9pm)</p>
                  </div>
                </div>
              </RadioGroup>

              <div className='space-y-1'>
                <Label htmlFor='first-name'>First Name</Label>
                <Input id='first-name' type='text' placeholder='John' />
              </div>

              <div className='space-y-1'>
                <Label htmlFor='last-name'>Last Name</Label>
                <Input id='last-name' type='text' placeholder='Doe' />
              </div>

              <div className='space-y-1 md:col-span-2'>
                <Label htmlFor='country'>Country</Label>
                <Select>
                  <SelectTrigger
                    id='country'
                    className='[&>span_svg]:text-muted-foreground/80 w-full [&>span]:flex [&>span]:items-center [&>span]:gap-2 [&>span_svg]:shrink-0'
                  >
                    <SelectValue placeholder='Select country' />
                  </SelectTrigger>
                  <SelectContent className='[&_*[role=option]>span>svg]:text-muted-foreground/80 max-h-100 [&_*[role=option]]:pr-8 [&_*[role=option]]:pl-2 [&_*[role=option]>span]:right-2 [&_*[role=option]>span]:left-auto [&_*[role=option]>span]:flex [&_*[role=option]>span]:items-center [&_*[role=option]>span]:gap-2 [&_*[role=option]>span>svg]:shrink-0'>
                    {countries.map(country => (
                      <SelectItem key={country.value} value={country.value}>
                        <img src={country.flag} alt={`${country.label} flag`} className='h-4 w-5' />{' '}
                        <span className='truncate'>{country.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1 md:col-span-2'>
                <Label htmlFor='address-line-1'>Address Line 1</Label>
                <Input id='address-line-1' type='text' placeholder='123 Main St' />
              </div>

              <div className='space-y-1 md:col-span-2'>
                <Label htmlFor='address-line-2'>Address Line 2</Label>
                <Input id='address-line-2' type='text' placeholder='Apt 4B' />
              </div>

              <div className='space-y-1'>
                <Label htmlFor='landmark'>Landmark</Label>
                <Input id='landmark' type='text' placeholder='Near Central Park' />
              </div>

              <div className='space-y-1'>
                <Label htmlFor='city'>City</Label>
                <Input id='city' type='text' placeholder='Los Angeles' />
              </div>

              <div className='space-y-1'>
                <Label htmlFor='state'>State</Label>
                <Input id='state' type='text' placeholder='California' />
              </div>

              <div className='space-y-1'>
                <Label htmlFor='zip-code'>Zip Code</Label>
                <Input id='zip-code' type='number' placeholder='90001' />
              </div>

              <div className='flex items-center gap-2'>
                <Switch id='billing-address' />
                <Label htmlFor='billing-address'>Use as a billing address?</Label>
              </div>
            </div>

            <DialogFooter className='flex-row !justify-center gap-4'>
              <Button size='lg'>Submit</Button>
              <DialogClose asChild>
                <Button size='lg' className='bg-primary/10 text-primary hover:bg-primary/20'>
                  Cancel
                </Button>
              </DialogClose>
            </DialogFooter>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export default AddAddressDialog
