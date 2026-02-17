'use client'

import { useState, type ReactNode } from 'react'

import * as Stepperize from '@stepperize/react'
import {
  DatabaseIcon,
  LayoutPanelLeftIcon,
  CreditCardIcon,
  HouseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  FileTextIcon,
  ShoppingCartIcon,
  LaptopMinimalIcon,
  CheckIcon
} from '@/lib/ez-icons'
import { usePaymentInputs } from 'react-payment-inputs'
import images, { type CardImages } from 'react-payment-inputs/images'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { Switch } from '@/components/ui/switch'

import { cn } from '@/lib/utils'

import AngularSvg from '@/assets/svg/angular'
import AwsSvg from '@/assets/svg/aws'
import FirebaseSvg from '@/assets/svg/firebase'
import HtmlSvg from '@/assets/svg/html'
import ReactNativeSvg from '@/assets/svg/react-native'
import VueSvg from '@/assets/svg/vue'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  className?: string
}

// Define steps for the stepper
const { useStepper, utils } = Stepperize.defineStepper(
  { id: 'details', title: 'Details', description: 'Enter details', icon: HouseIcon },
  {
    id: 'frameworks',
    title: 'Frameworks',
    description: 'Select frameworks',
    icon: LayoutPanelLeftIcon
  },
  { id: 'database', title: 'Database', description: 'Select database', icon: DatabaseIcon },
  {
    id: 'billing',
    title: 'Billing',
    description: 'Payment details',
    icon: CreditCardIcon
  }
)

// Application categories
const applicationCategories = [
  {
    id: 'crm-app',
    name: 'CRM Application',
    description: 'Scales with any business',
    icon: FileTextIcon,
    avatarColor: 'bg-sky-600/10 text-sky-600 dark:bg-sky-400/10 dark:text-sky-400'
  },
  {
    id: 'ecommerce-platform',
    name: 'eCommerce Platforms',
    description: 'Grow your business with app',
    icon: ShoppingCartIcon,
    avatarColor: 'bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400'
  },
  {
    id: 'learning-platform',
    name: 'Online Learning Platform',
    description: 'Start learning today',
    icon: LaptopMinimalIcon,
    avatarColor: 'bg-destructive/10 text-destructive'
  }
]

// Details step component
const DetailsStep = () => (
  <div className='flex flex-col gap-6'>
    <div className='space-y-1'>
      <Label htmlFor='application-name'>Application Name</Label>
      <Input id='application-name' type='text' placeholder='Application Name' />
    </div>
    <fieldset className='space-y-4'>
      <legend className='text-muted-foreground text-lg font-medium'>Category</legend>
      <RadioGroup defaultValue='crm-app'>
        {applicationCategories.map(category => (
          <div key={category.id} className='relative flex items-center justify-between gap-2'>
            <div className='flex items-center gap-2'>
              <Avatar className='size-10 rounded-sm'>
                <AvatarFallback className={cn('rounded-[inherit]', category.avatarColor)}>
                  <category.icon className='size-6' />
                </AvatarFallback>
              </Avatar>
              <div className='grid flex-1 space-y-1'>
                <Label htmlFor={category.id} className='m-0 text-base'>
                  {category.name}
                </Label>
                <p className='text-muted-foreground text-sm'>{category.description}</p>
              </div>
            </div>
            <RadioGroupItem
              value={category.id}
              id={category.id}
              className='size-5 after:absolute after:inset-0 [&_svg]:size-3'
            />
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  </div>
)

// Database categories
const databaseCategories = [
  {
    id: 'firebase',
    name: 'Firebase',
    description: 'Cloud firestone',
    icon: <FirebaseSvg />,
    avatarColor: 'bg-destructive/10 text-destructive'
  },
  {
    id: 'aws',
    name: 'AWS',
    description: 'Amazon fast NoSQL database',
    icon: <AwsSvg />,
    avatarColor: 'bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400'
  },
  {
    id: 'my-sql',
    name: 'MySQL',
    description: 'Basic MySQL database',
    icon: <DatabaseIcon />,
    avatarColor: 'bg-sky-600/10 text-sky-600 dark:bg-sky-400/10 dark:text-sky-400'
  }
]

// Database step component
const DatabaseStep = () => (
  <div className='flex flex-col gap-6'>
    <div className='space-y-1'>
      <Label htmlFor='database-name'>Database Name</Label>
      <Input id='database-name' type='text' placeholder='Database Name' />
    </div>
    <fieldset className='space-y-4'>
      <legend className='text-muted-foreground text-lg font-medium'>Select Database Engine</legend>
      <RadioGroup defaultValue='aws'>
        {databaseCategories.map(category => (
          <div key={category.id} className='relative flex items-center justify-between gap-2'>
            <div className='flex items-center gap-2'>
              <Avatar className='size-10 rounded-sm'>
                <AvatarFallback className={cn('rounded-[inherit]', category.avatarColor)}>
                  {category.icon}
                </AvatarFallback>
              </Avatar>
              <div className='grid flex-1 space-y-1'>
                <Label htmlFor={category.id} className='m-0 text-base'>
                  {category.name}
                </Label>
                <p className='text-muted-foreground text-sm'>{category.description}</p>
              </div>
            </div>
            <RadioGroupItem
              value={category.id}
              id={category.id}
              className='size-5 after:absolute after:inset-0 [&_svg]:size-3'
            />
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  </div>
)

// Framework categories
const frameworkCategories = [
  {
    id: 'react-native',
    name: 'React Native',
    description: 'Create truly native apps',
    icon: <ReactNativeSvg />,
    avatarColor: 'bg-sky-600/10 text-sky-600 dark:bg-sky-400/10 dark:text-sky-400'
  },
  {
    id: 'vue',
    name: 'Vue',
    description: 'JS web frameworks',
    icon: <VueSvg />,
    avatarColor: 'bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400'
  },
  {
    id: 'angular',
    name: 'Angular',
    description: 'Most suited for your application',
    icon: <AngularSvg />,
    avatarColor: 'bg-destructive/10 text-destructive'
  },
  {
    id: 'html',
    name: 'HTML',
    description: 'Progressive Framework',
    icon: <HtmlSvg />,
    avatarColor: 'bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400'
  }
]

// Framework step component
const FrameworksStep = () => (
  <fieldset className='space-y-4'>
    <legend className='text-muted-foreground text-lg font-medium'>Select Framework</legend>
    <RadioGroup defaultValue='vue'>
      {frameworkCategories.map(category => (
        <div key={category.id} className='relative flex items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <Avatar className='size-10 rounded-sm'>
              <AvatarFallback className={cn('rounded-[inherit]', category.avatarColor)}>{category.icon}</AvatarFallback>
            </Avatar>
            <div className='grid flex-1 space-y-1'>
              <Label htmlFor={category.id} className='m-0 text-base'>
                {category.name}
              </Label>
              <p className='text-muted-foreground text-sm'>{category.description}</p>
            </div>
          </div>
          <RadioGroupItem
            value={category.id}
            id={category.id}
            className='size-5 after:absolute after:inset-0 [&_svg]:size-3'
          />
        </div>
      ))}
    </RadioGroup>
  </fieldset>
)

// Billing step component
const BillingStep = () => {
  const { meta, getCardNumberProps, getCardImageProps, getExpiryDateProps, getCVCProps } = usePaymentInputs()

  return (
    <fieldset className='space-y-4'>
      <legend className='text-muted-foreground text-lg font-medium'>Payment Details</legend>

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
    </fieldset>
  )
}

// Main CreateAppDialog component
const CreateAppDialog = ({ defaultOpen = false, trigger, className }: Props) => {
  const [open, setOpen] = useState(defaultOpen)

  const stepper = useStepper()
  const currentStep = utils.getIndex(stepper.current.id)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild onClick={() => setOpen(true)}>
        {trigger}
      </DialogTrigger>
      <DialogContent className={cn('md:max-w-188 [&>[data-slot=dialog-close]>svg]:size-5', className)}>
        <DialogHeader className='items-center'>
          <DialogTitle className='leading-7'>Create App</DialogTitle>
          <DialogDescription>Provide data with this form to create your app.</DialogDescription>
        </DialogHeader>

        <div className='flex gap-8 max-md:flex-col'>
          <nav aria-label='Multi Steps'>
            <ol className='flex flex-col justify-between gap-x-2 gap-y-4'>
              {stepper.all.map((step, index) => (
                <li key={step.id}>
                  <Button
                    variant='ghost'
                    className='h-auto w-full shrink-0 cursor-pointer justify-start gap-4 rounded !bg-transparent p-0.5'
                    onClick={() => stepper.goTo(step.id)}
                  >
                    <Avatar className='size-10 rounded-sm'>
                      <AvatarFallback
                        className={cn(
                          'text-muted-foreground rounded-[inherit] bg-transparent',
                          {
                            'bg-primary text-primary-foreground shadow-sm': index === currentStep
                          },
                          { 'bg-muted': index > currentStep }
                        )}
                      >
                        <step.icon className='size-6 stroke-[1.5]' />
                      </AvatarFallback>
                    </Avatar>
                    <div className='flex flex-col items-start gap-1'>
                      <span
                        className={cn('text-base font-medium uppercase', {
                          'text-muted-foreground': index < currentStep
                        })}
                      >
                        {step.title}
                      </span>
                      <span className='text-muted-foreground text-sm font-normal capitalize'>{step.description}</span>
                    </div>
                  </Button>
                </li>
              ))}
            </ol>
          </nav>
          <div className='flex-1 space-y-6'>
            {stepper.switch({
              details: () => <DetailsStep />,
              frameworks: () => <FrameworksStep />,
              database: () => <DatabaseStep />,
              billing: () => <BillingStep />
            })}
            <DialogFooter className='flex !justify-between'>
              <Button variant='secondary' size='lg' onClick={stepper.prev} disabled={stepper.isFirst}>
                <ArrowLeftIcon />
                Previous
              </Button>
              {stepper.isLast ? (
                <DialogClose asChild>
                  <Button
                    size='lg'
                    className='bg-green-600 text-white hover:bg-green-600/90 focus-visible:ring-green-600/20 dark:bg-green-400/60 dark:hover:bg-green-400/50 dark:focus-visible:ring-green-400/40'
                  >
                    Success
                    <CheckIcon />
                  </Button>
                </DialogClose>
              ) : (
                <Button size='lg' onClick={stepper.next}>
                  Next
                  <ArrowRightIcon />
                </Button>
              )}
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default CreateAppDialog
