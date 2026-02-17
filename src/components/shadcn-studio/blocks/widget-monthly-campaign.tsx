import type { ComponentType } from 'react'

import { EllipsisVerticalIcon } from '@/lib/ez-icons'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

import { cn } from '@/lib/utils'

const listItems = ['Share', 'Update', 'Refresh']

type Props = {
  title: string
  subTitle: string
  campaignData: {
    icon: ComponentType
    title: string
    value: string
    percentage: string
    avatarClassName?: string
  }[]
  className?: string
}

const MonthlyCampaignCard = ({ title, subTitle, campaignData, className }: Props) => {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className='flex justify-between'>
        <div className='flex flex-col gap-1'>
          <span className='text-lg font-semibold'>{title}</span>
          <span className='text-muted-foreground text-sm'>{subTitle}</span>
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
      <CardContent className='flex flex-1 flex-col justify-between gap-4'>
        {campaignData.map((campaign, index) => (
          <div key={index} className='flex items-center justify-between gap-2'>
            <div className='flex items-center justify-between gap-2'>
              <Avatar className='size-8 rounded-sm'>
                <AvatarFallback
                  className={cn('bg-primary/10 text-primary shrink-0 rounded-sm *:size-4', campaign.avatarClassName)}
                >
                  <campaign.icon />
                </AvatarFallback>
              </Avatar>
              <span className='font-medium'>{campaign.title}</span>
            </div>
            <div className='flex items-center justify-between gap-2 text-sm'>
              <span className='text-muted-foreground'>{campaign.value}</span>
              <span>{campaign.percentage}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default MonthlyCampaignCard
