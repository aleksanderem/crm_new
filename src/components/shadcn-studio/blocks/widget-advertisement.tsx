import { EllipsisVerticalIcon, MessageSquareIcon, ThumbsUpIcon } from '@/lib/ez-icons'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { cn } from '@/lib/utils'

const listItems = ['Share', 'Update', 'Refresh']

const avatars = [
  {
    src: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png',
    fallback: 'OS',
    name: 'Olivia Sparks'
  },
  {
    src: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-6.png',
    fallback: 'HL',
    name: 'Howard Lloyd'
  },
  {
    src: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-5.png',
    fallback: 'HR',
    name: 'Hallie Richards'
  },
  {
    src: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-16.png',
    fallback: 'JW',
    name: 'Jenny Wilson'
  }
]

const AdvertisementCard = ({ className }: { className?: string }) => {
  return (
    <Card className={cn('justify-between', className)}>
      <CardHeader className='flex justify-between'>
        <div className='flex items-center gap-4'>
          <Avatar className='size-10.5 rounded-full'>
            <AvatarImage
              src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png'
              alt='Hallie Richards'
              className='rounded-full'
            />
            <AvatarFallback className='text-xs'>JW</AvatarFallback>
          </Avatar>
          <div className='flex flex-col gap-1'>
            <span className='text-lg font-medium'>Design strategy master class</span>
            <span className='text-muted-foreground text-sm'>07 Jun 2025 at 10:00 PM</span>
          </div>
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
      <div className='flex flex-col gap-9'>
        <div className='relative'>
          <img
            src='https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/widgets/image-6.png'
            alt='background image'
          />
          <div className='bg-card absolute -bottom-7 left-5.5 flex flex-col items-center rounded-md px-4 py-2 shadow-xl'>
            <span className='text-lg font-medium'>12</span>
            <span className='text-muted-foreground'>Dec</span>
          </div>
        </div>
        <CardContent className='space-y-2'>
          <p>How to improve you next design&apos;s strategy that works for user and business</p>
          <div className='flex items-center gap-2'>
            <Badge className='bg-primary/10 text-primary rounded-sm'>Technical</Badge>
            <Badge className='bg-primary/10 text-primary rounded-sm'>User research</Badge>
            <Badge className='bg-primary/10 text-primary rounded-sm'>Analytics</Badge>
          </div>
        </CardContent>
      </div>
      <CardFooter className='flex-col items-stretch gap-6'>
        <div className='flex items-center justify-between gap-2'>
          <div className='flex -space-x-5 hover:space-x-1'>
            {avatars.map((avatar, index) => (
              <Tooltip key={index}>
                <TooltipTrigger asChild>
                  <Avatar className='ring-background size-12 ring-2 transition-all duration-300 ease-in-out'>
                    <AvatarImage src={avatar.src} alt={avatar.name} />
                    <AvatarFallback className='text-xs'>{avatar.fallback}</AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent>{avatar.name}</TooltipContent>
              </Tooltip>
            ))}
          </div>
          <Button size='sm'>Join now</Button>
        </div>
        <div className='flex items-center gap-4'>
          <div className='flex items-center gap-1'>
            <ThumbsUpIcon className='size-4' />
            <span className='text-sm'>56k</span>
          </div>
          <div className='flex items-center gap-1'>
            <MessageSquareIcon className='size-4' />
            <span className='text-sm'>2k</span>
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}

export default AdvertisementCard
