'use client'

import { CreditCardIcon, EllipsisVerticalIcon, WalletIcon } from '@/lib/ez-icons'

import { usePaymentInputs } from 'react-payment-inputs'
import images, { type CardImages } from 'react-payment-inputs/images'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { cn } from '@/lib/utils'

const listItems = ['Share', 'Update', 'Refresh']

const UpgradeYourPlanCard = ({ className }: { className?: string }) => {
  const { meta, getCardNumberProps, getCardImageProps, getCVCProps } = usePaymentInputs()

  return (
    <Card className={cn('justify-between', className)}>
      <CardHeader>
        <div className='flex items-center justify-between gap-2'>
          <span className='text-lg font-semibold'>Upgrade your plan</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' className='text-muted-foreground size-6 rounded-full'>
                <EllipsisVerticalIcon />
                <span className='sr-only'>Menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuGroup>
                {listItems.map((item, index) => (
                  <DropdownMenuItem key={index}>{item}</DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className='text-muted-foreground text-sm'>
          To fully enjoy all the amazing features and benefits of our premium plan.
        </p>
      </CardHeader>
      <CardContent className='space-y-6'>
        <div className='bg-primary/10 flex items-center justify-between gap-2 rounded-md px-2 py-1.5'>
          <div className='flex items-center gap-2'>
            <Avatar className='size-9 rounded-sm'>
              <AvatarFallback className='bg-background text-primary shrink-0 rounded-sm'>
                <WalletIcon className='size-6' />
              </AvatarFallback>
            </Avatar>
            <div className='flex flex-col'>
              <span className='font-medium'>Platinum</span>
              <span className='text-muted-foreground text-sm'>Last 6 months</span>
            </div>
          </div>
          <div className='flex items-baseline'>
            <span className='text-xl font-medium'>$5,550</span>
            <span>/Year</span>
          </div>
        </div>

        <div className='flex flex-col gap-4'>
          <span className='font-semibold'>Payment details</span>
          <div className='flex flex-col gap-3'>
            <div className='flex items-center justify-between gap-2'>
              <div className='flex items-center gap-2'>
                <div className='bg-muted rounded-sm p-2'>
                  <img
                    src='https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/widgets/master-card.png'
                    alt='master-card'
                    className='w-8'
                  />
                </div>
                <div className='flex flex-col gap-0.5'>
                  <span className='text-sm font-medium'>Credit card</span>
                  <span className='text-muted-foreground text-xs'>5688 xxxx xxxx 2356</span>
                </div>
              </div>
              <Input {...getCVCProps()} className='h-8 max-w-16' />
            </div>
            <div className='flex items-center justify-between gap-2'>
              <div className='flex items-center gap-2'>
                <div className='bg-muted rounded-sm px-2 py-3'>
                  <img
                    src='https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/widgets/visa.png'
                    alt='visa'
                    className='w-8'
                  />
                </div>
                <div className='flex flex-col gap-0.5'>
                  <span className='text-sm font-medium'>Credit card</span>
                  <span className='text-muted-foreground text-xs'>5688 xxxx xxxx 2356</span>
                </div>
              </div>
              <Input {...getCVCProps()} className='h-8 max-w-16' />
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className='flex-col items-start gap-3'>
        <Label htmlFor='addCard' className='text-base font-semibold'>
          Add Payment method
        </Label>
        <div className='relative w-full'>
          <Input {...getCardNumberProps()} id='addCard' className='peer h-8 pr-11' />
          <div className='text-muted-foreground pointer-events-none absolute inset-y-0 right-0 flex items-center justify-center pr-3 peer-disabled:opacity-50'>
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
        <Button className='w-full'>Pay now</Button>
      </CardFooter>
    </Card>
  )
}

export default UpgradeYourPlanCard
