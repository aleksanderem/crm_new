import { EllipsisVerticalIcon } from '@/lib/ez-icons'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'

const listItems = ['Share', 'Update', 'Refresh']

const plans = [
  {
    name: 'Branding',
    price: 60,
    checked: false
  },
  {
    name: 'Marketing',
    price: 120,
    checked: true
  },
  {
    name: 'Web Development',
    price: 250,
    checked: false
  },
  {
    name: 'App Development',
    price: 320,
    checked: false
  }
]

const ForBusinessSharkCard = ({ className }: { className?: string }) => {
  return (
    <Card className={className}>
      <CardHeader>
        <div className='flex items-center justify-between gap-2'>
          <span className='text-lg font-semibold'>For Business Shark</span>
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
          Here, I focus on a range of items and features that we use in life without them
        </p>
      </CardHeader>
      <CardContent className='space-y-6'>
        <div className='space-y-2'>
          <Label className='text-base font-medium'>Choose a plan to get started</Label>
          {plans.map((plan, index) => (
            <Label
              key={index}
              className='has-[[aria-checked=true]]:border-primary dark:has-[[aria-checked=true]]:border-primary flex items-center gap-3 rounded-md border px-4 py-2'
            >
              <Checkbox defaultChecked={plan.checked} />
              <div className='flex w-full items-center justify-between gap-2'>
                <p className='text-sm leading-none font-medium'>{plan.name}</p>
                <Badge className='bg-primary/10 text-primary rounded-sm'>${plan.price}</Badge>
              </div>
            </Label>
          ))}
        </div>
        <div className='flex flex-col gap-2'>
          <div className='flex items-center justify-between text-sm'>
            <span>Taxes</span>
            <span>$32</span>
          </div>
          <div className='flex items-center justify-between'>
            <span className='text-sm'>Total amount</span>
            <span className='text-lg font-medium'>$152</span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button className='w-full'>Pay now</Button>
      </CardFooter>
    </Card>
  )
}

export default ForBusinessSharkCard
