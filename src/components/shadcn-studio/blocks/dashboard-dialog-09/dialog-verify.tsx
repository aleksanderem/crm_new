'use client'

import { useState, type ReactNode } from 'react'

import { MessageSquareTextIcon, SettingsIcon } from '@/lib/ez-icons'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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

import { cn } from '@/lib/utils'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  className?: string
}

// Main VerifyDialog component
const VerifyDialog = ({ defaultOpen = false, trigger, className }: Props) => {
  const [open, setOpen] = useState(defaultOpen)
  const [authType, setAuthType] = useState<string>('authenticator-app')
  const [showAuthDialog, setShowAuthDialog] = useState<boolean>(false)

  const handleClose = () => {
    setOpen(false)

    if (authType !== 'authenticator-app') {
      setAuthType('authenticator-app')
    }
  }

  const handleAuthDialogClose = () => {
    setShowAuthDialog(false)

    if (authType !== 'authenticator-app') {
      setTimeout(() => {
        setAuthType('authenticator-app')
      }, 250)
    }
  }

  const handleContinue = () => {
    setOpen(false)
    setShowAuthDialog(true)
  }

  // SMS Dialog Component
  const SMSDialog = () => (
    <DialogContent className='flex flex-col gap-0 p-0 max-sm:max-h-[min(650px,80vh)] sm:max-w-145 [&>[data-slot=dialog-close]>svg]:size-5'>
      <ScrollArea className='flex max-h-full flex-col overflow-hidden'>
        <div className='flex flex-col gap-4 p-6'>
          <DialogHeader className='items-center text-center'>
            <DialogTitle className='leading-7'>Enable One Time Password</DialogTitle>
            <DialogDescription>Verify Your mobile number for SMS</DialogDescription>
          </DialogHeader>

          <div className='flex flex-col gap-4'>
            <p className='text-muted-foreground'>
              Enter your mobile phone number with country code and we will send you a verification code.
            </p>
            <div className='space-y-1'>
              <Label htmlFor='phone'>Phone Number</Label>
              <Input id='phone' type='tel' placeholder='202 555 0111' maxLength={10} />
            </div>
          </div>

          <DialogFooter className='gap-4'>
            <Button size='lg' onClick={handleAuthDialogClose}>
              Send OTP
            </Button>
            <DialogClose asChild>
              <Button
                size='lg'
                className='bg-primary/10 text-primary hover:bg-primary/20'
                onClick={handleAuthDialogClose}
              >
                Cancel
              </Button>
            </DialogClose>
          </DialogFooter>
        </div>
      </ScrollArea>
    </DialogContent>
  )

  // Authenticator App Dialog Component
  const AppDialog = () => (
    <DialogContent className='flex flex-col gap-0 p-0 max-sm:max-h-[min(650px,80vh)] sm:max-w-185 [&>[data-slot=dialog-close]>svg]:size-5'>
      <ScrollArea className='flex max-h-full flex-col overflow-hidden'>
        <div className='flex flex-col gap-6 p-6'>
          <DialogHeader className='items-center text-center'>
            <DialogTitle className='leading-7'>Add Authenticator App</DialogTitle>
          </DialogHeader>

          <div className='flex flex-col gap-6'>
            <div className='space-y-2'>
              <h3 className='text-lg font-medium'>Authenticator Apps</h3>
              <p className='text-muted-foreground text-sm'>
                Using an authenticator app like Google Authenticator, Microsoft Authenticator, Authy, or 1Password, scan
                the QR code. It will generate a 6-digit code for you to enter below.
              </p>
            </div>

            <img
              src='https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dashboard-dialog/image-7.png'
              alt='QR Code'
              className='mx-auto w-37.5'
            />

            <Alert className='border-none bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400'>
              <AlertTitle>ASDLKNASDA9AHS678dGhASD78AB</AlertTitle>
              <AlertDescription className='text-amber-600/80 dark:text-amber-400/80'>
                If you&apos;re having trouble using the QR code, select manual entry on your app
              </AlertDescription>
            </Alert>

            <div className='space-y-1'>
              <Label htmlFor='auth-code'>Enter Authentication Code</Label>
              <Input id='auth-code' placeholder='123 456' className='text-base' />
            </div>
          </div>

          <DialogFooter className='gap-4'>
            <DialogClose asChild>
              <Button
                size='lg'
                className='bg-primary/10 text-primary hover:bg-primary/20'
                onClick={handleAuthDialogClose}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button size='lg' onClick={handleAuthDialogClose}>
              Submit
            </Button>
          </DialogFooter>
        </div>
      </ScrollArea>
    </DialogContent>
  )

  // Main Return
  return (
    <>
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
              <DialogHeader className='items-center text-center'>
                <DialogTitle className='leading-7'>Select Authentication Method</DialogTitle>
                <DialogDescription>
                  You also need to select a method by which the proxy authenticates to the directory server.
                </DialogDescription>
              </DialogHeader>

              <div className='flex flex-col gap-6'>
                <RadioGroup
                  className='gap-6'
                  value={authType}
                  onValueChange={setAuthType}
                  defaultValue='authenticator-app'
                >
                  <div className='border-input has-data-[state=checked]:border-primary/50 relative flex w-full gap-2 rounded-lg border p-3 outline-none'>
                    <RadioGroupItem
                      value='authenticator-app'
                      id='authenticator-app'
                      aria-label='authenticator-app-radio'
                      className='after:absolute after:inset-0'
                    />
                    <div className='grid grow gap-2'>
                      <Label htmlFor='authenticator-app' className='gap-4 text-base'>
                        <SettingsIcon className='size-5' />
                        Authenticator Apps
                      </Label>
                      <p className='text-muted-foreground text-sm'>
                        Get code from an app like Google Authenticator and Microsoft Authenticator.
                      </p>
                    </div>
                  </div>

                  <div className='border-input has-data-[state=checked]:border-primary/50 relative flex w-full gap-2 rounded-lg border p-3 outline-none'>
                    <RadioGroupItem
                      value='sms'
                      id='sms'
                      aria-label='sms-radio'
                      className='after:absolute after:inset-0'
                    />
                    <div className='grid grow gap-2'>
                      <Label htmlFor='sms' className='gap-4 text-base'>
                        <MessageSquareTextIcon className='size-5' />
                        SMS
                      </Label>
                      <p className='text-muted-foreground text-sm'>
                        We will send a code via SMS if you need to use your backup login method.
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <DialogFooter className='justify-center gap-4'>
                <Button size='lg' onClick={handleContinue}>
                  Continue
                </Button>
                <DialogClose asChild>
                  <Button size='lg' className='bg-primary/10 text-primary hover:bg-primary/20' onClick={handleClose}>
                    Cancel
                  </Button>
                </DialogClose>
              </DialogFooter>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        {authType === 'sms' ? <SMSDialog /> : <AppDialog />}
      </Dialog>
    </>
  )
}

export default VerifyDialog
