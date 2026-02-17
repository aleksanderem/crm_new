import { EllipsisVerticalIcon, MapPinIcon, UserCheckIcon } from '@/lib/ez-icons'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Timeline,
  TimelineContent,
  TimelineDot,
  TimelineHeading,
  TimelineItem,
  TimelineLine
} from '@/components/ui/timeline'

import { cn } from '@/lib/utils'

const listItems = ['Share', 'Update', 'Refresh']

const tabs = [
  {
    name: 'New',
    value: 'new',
    content: [
      {
        sender: 'Mytrle Ullrich',
        senderContent: '101 Boulder, California(CA), 959595',
        receiver: 'Barry Schowalter',
        receiverContent: '939 orange, California(CA), 92118'
      },
      {
        sender: 'Lucas Smith',
        senderContent: '203 Riverdale, New York(NY), 10001',
        receiver: 'Emma Johnson',
        receiverContent: '305 Maple Avenue, Austin, Texas(TX), 73301'
      }
    ]
  },
  {
    name: 'Pending',
    value: 'pending',
    content: [
      {
        sender: 'Ava Wilson',
        senderContent: 'Your package has been dispatched',
        receiver: 'Ryan Taylor',
        receiverContent: 'The package is out for delivery today'
      },
      {
        sender: 'Olivia Brown',
        senderContent: 'Your package has been dispatched',
        receiver: 'James Davis',
        receiverContent: 'The package was successfully delivered today at 12:30 PM'
      }
    ]
  },
  {
    name: 'Shipping',
    value: 'shipping',
    content: [
      {
        sender: 'Noah Parker',
        senderContent: 'Delivering in 2 days from now (July 13, 2025)',
        receiver: 'Grace Kim',
        receiverContent: '939 orange, California(CA), 92118'
      },
      {
        sender: 'Lily Wang',
        senderContent: 'July 11, 2025 (Delivered at 12:30 PM)',
        receiver: 'Maya Singh',
        receiverContent: 'July 11, 2025 (Delivered at 12:30 PM)'
      }
    ]
  }
]

const OrdersCard = ({ className }: { className?: string }) => {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className='flex justify-between'>
        <div className='flex flex-col gap-1'>
          <span className='text-lg font-semibold'>Orders</span>
          <span className='text-muted-foreground text-sm'>75 Deliveries in progress</span>
        </div>
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
      </CardHeader>
      <Tabs defaultValue='new' className='gap-4'>
        <TabsList className='bg-background w-full rounded-none border-b p-0'>
          {tabs.map(tab => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className='bg-background data-[state=active]:border-primary dark:data-[state=active]:border-primary h-full rounded-none border-0 border-b-2 border-transparent focus-visible:z-1 data-[state=active]:shadow-none'
            >
              {tab.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map(tab => (
          <TabsContent key={tab.value} value={tab.value} className='flex flex-col gap-4'>
            {tab.content?.map((item, index) => (
              <div key={index} className='flex flex-col gap-4 pr-6 pl-2'>
                <Timeline>
                  <TimelineItem status='done' className='gap-x-4'>
                    <TimelineDot status='custom' className='mb-1.25'>
                      <UserCheckIcon className='text-primary size-4' />
                    </TimelineDot>
                    <TimelineLine className='bg-[repeating-linear-gradient(0deg,var(--border),var(--border)_5px,var(--card)_6px,var(--card)_10px)]' />
                    <TimelineHeading className='text-sm font-normal'>Sender</TimelineHeading>
                    <TimelineContent className='flex flex-col gap-0.5 pb-2'>
                      <span className='font-medium'>{item.sender}</span>
                      <span className='text-muted-foreground text-sm'>{item.senderContent}</span>
                    </TimelineContent>
                  </TimelineItem>
                  <TimelineItem status='done' className='mt-2 gap-x-4'>
                    <TimelineDot status='custom'>
                      <MapPinIcon className='text-primary size-4' />
                    </TimelineDot>
                    <TimelineHeading className='text-sm font-normal'>Receiver</TimelineHeading>
                    <TimelineContent className='mt-0.5 flex flex-col gap-0.5 pb-0'>
                      <span className='font-medium'>{item.receiver}</span>
                      <span className='text-muted-foreground text-sm'>{item.receiverContent}</span>
                    </TimelineContent>
                  </TimelineItem>
                </Timeline>
                {index !== tab.content.length - 1 && (
                  <div className='pl-4'>
                    <Separator />
                  </div>
                )}
              </div>
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  )
}

export default OrdersCard
