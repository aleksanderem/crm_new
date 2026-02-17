'use client'

import { useState, type ReactNode } from 'react'

import { ExternalLinkIcon, GiftIcon, SendIcon } from '@/lib/ez-icons'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

import { cn } from '@/lib/utils'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  className?: string
}

const ReferAndEarnDialog = ({ defaultOpen = false, trigger, className }: Props) => {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild onClick={() => setOpen(true)}>
        {trigger}
      </DialogTrigger>
      <DialogContent
        className={cn(
          'flex flex-col gap-0 p-0 max-sm:max-h-[min(650px,80vh)] sm:max-w-162.5 [&>[data-slot=dialog-close]>svg]:size-5',
          className
        )}
      >
        <ScrollArea className='flex max-h-full flex-col overflow-hidden'>
          <div className='flex flex-col gap-4 p-6'>
            <DialogHeader className='mb-6 items-center'>
              <DialogTitle className='leading-7'>Refer & Earn</DialogTitle>
              <DialogDescription>
                Invite a friend to shadcn/studio and you&apos;ll both get 30 days free!
              </DialogDescription>
            </DialogHeader>

            <div className='grid gap-6 sm:grid-cols-3'>
              <div className='flex flex-col items-center gap-2.5'>
                <Avatar className='size-11 rounded-sm'>
                  <AvatarFallback className='bg-primary/10 text-primary shrink-0 rounded-sm'>
                    <SendIcon className='size-6' />
                  </AvatarFallback>
                </Avatar>

                <div className='flex flex-col items-center gap-1.5 text-center'>
                  <span className='text-lg font-medium'>Send Invitation</span>
                  <p className='text-muted-foreground'>Send your referral link to your friend</p>
                </div>
              </div>

              <div className='flex flex-col items-center gap-2.5'>
                <Avatar className='size-11 rounded-sm'>
                  <AvatarFallback className='bg-primary/10 text-primary shrink-0 rounded-sm'>
                    <ExternalLinkIcon className='size-6' />
                  </AvatarFallback>
                </Avatar>

                <div className='flex flex-col items-center gap-1.5 text-center'>
                  <span className='text-lg font-medium'>Registration</span>
                  <p className='text-muted-foreground'>Let them register to our services</p>
                </div>
              </div>

              <div className='flex flex-col items-center gap-2.5'>
                <Avatar className='size-11 rounded-sm'>
                  <AvatarFallback className='bg-primary/10 text-primary shrink-0 rounded-sm'>
                    <GiftIcon className='size-6' />
                  </AvatarFallback>
                </Avatar>

                <div className='flex flex-col items-center gap-1.5 text-center'>
                  <span className='text-lg font-medium'>Free Trial</span>
                  <p className='text-muted-foreground'>Your friend will get 30 days free trial</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className='flex flex-col gap-4'>
              <span className='col-span-4 text-lg font-medium'>Invite your friends</span>
              <div className='space-y-1'>
                <Label htmlFor='invite-email' className='leading-5'>
                  Enter your friend&apos;s email address and invite them to join ShadcnStudio 😍
                </Label>
                <div className='flex justify-between gap-4'>
                  <Input id='invite-email' type='email' placeholder='Example@gmail.com' className='h-10 w-full' />
                  <Button size='lg' className='sm:w-33'>
                    Send
                  </Button>
                </div>
              </div>
            </div>

            <div className='flex flex-col gap-4'>
              <span className='text-lg font-medium'>Share the referral link</span>
              <div className='space-y-1'>
                <Label htmlFor='share-link' className='leading-5'>
                  You can also copy and send it or share it on your social media. 🚀
                </Label>
                <div className='flex gap-4'>
                  <Input
                    id='share-link'
                    type='url'
                    placeholder='URL'
                    value='https://themeselection.com'
                    readOnly
                    className='truncate'
                  />
                  <div className='flex shrink-0 flex-wrap gap-3'>
                    <Button variant='outline' size='icon'>
                      <img
                        src='https://cdn.shadcnstudio.com/ss-assets/brand-logo/twitter-icon.png?width=20&height=20&format=auto'
                        alt='X Icon'
                        className='dark:invert'
                      />
                    </Button>
                    <Button variant='outline' size='icon'>
                      <img
                        src='https://cdn.shadcnstudio.com/ss-assets/brand-logo/facebook-icon.png?width=20&height=20&format=auto'
                        alt='Facebook Icon'
                      />
                    </Button>
                    <Button variant='outline' size='icon'>
                      <img
                        src='https://cdn.shadcnstudio.com/ss-assets/brand-logo/github-icon.png?width=20&height=20&format=auto'
                        alt='GitHub Icon'
                        className='dark:invert'
                      />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export default ReferAndEarnDialog
