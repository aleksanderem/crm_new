import type { ComponentType } from 'react'

import { EllipsisVerticalIcon } from '@/lib/ez-icons'

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
  vehicleData: {
    status: string
    percentage: number
    time: string
    icon: ComponentType
    width: string
    colors: string
  }[]
  className?: string
}

const VehicleOverviewCard = ({ title, vehicleData, className }: Props) => {
  return (
    <Card className={className}>
      <CardHeader className='flex justify-between border-b'>
        <span className='text-lg font-semibold'>{title}</span>
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
      <CardContent className='space-y-6'>
        <div className='text-muted-foreground flex text-sm'>
          {vehicleData.map((item, index) => (
            <div key={index} className={cn('flex flex-col gap-1', item.width)}>
              <span>{item.status}</span>
              <div className='bg-muted-foreground h-2.5 w-0.5 rounded-full'></div>
            </div>
          ))}
        </div>

        <div className='flex overflow-hidden rounded-md'>
          {vehicleData.map((item, index) => (
            <div key={index} className={cn('p-3', item.colors, item.width)}>
              <span>{item.percentage}%</span>
            </div>
          ))}
        </div>

        <div>
          {vehicleData.map((item, index) => (
            <div
              key={index}
              className={cn(
                'flex items-center justify-between gap-4 px-2 py-3',
                index !== vehicleData.length - 1 && 'border-b'
              )}
            >
              <div className='text-muted-foreground flex items-center gap-4 [&>svg]:size-4'>
                <item.icon />
                <span>{item.status}</span>
              </div>
              <div className='flex items-center gap-4'>
                <span className='font-medium'>{item.time}</span>
                <span className='text-muted-foreground text-sm'>{item.percentage}%</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default VehicleOverviewCard
