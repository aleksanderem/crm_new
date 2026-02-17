import { ChevronDownIcon, ChevronUpIcon, EllipsisVerticalIcon, WalletIcon } from '@/lib/ez-icons'

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
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'

import { cn } from '@/lib/utils'

const listItems = ['Share', 'Update', 'Refresh']

export type Stats = {
  className: string
  label: string
  value: string
  change: number
  changeType: string
}

type Props = {
  title: string
  amount: string
  period: string
  progressLabel: string
  progressValue: number
  stats: Stats[]
  className?: string
}

const GeneralFinanceReviewsCard = ({
  title,
  amount,
  period,
  progressLabel,
  progressValue,
  stats,
  className
}: Props) => {
  return (
    <Card className={className}>
      <CardHeader className='flex items-center justify-between'>
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
      <CardContent className='flex flex-1 flex-col justify-between gap-4'>
        <div className='flex items-center gap-3'>
          <Avatar className='size-13 rounded-sm'>
            <AvatarFallback className='bg-primary/10 text-primary shrink-0 rounded-sm'>
              <WalletIcon className='size-6' />
            </AvatarFallback>
          </Avatar>
          <div className='flex flex-col gap-1'>
            <span className='text-2xl font-semibold'>{amount}</span>
            <span className='text-muted-foreground text-sm'>{period}</span>
          </div>
        </div>
        <div className='space-y-2'>
          <p className='text-muted-foreground text-sm'>{progressLabel}</p>
          <Progress value={progressValue} className='h-1.5' />
        </div>
        {stats.map((stat, index) => (
          <div key={index} className='space-y-4'>
            {index !== 0 && <Separator />}
            <div className='flex items-center justify-between gap-4'>
              <div className='flex items-center gap-4'>
                <span className={cn('size-2.5 rounded-full', stat.className)}></span>
                <span>{stat.label}</span>
              </div>
              <div className='flex items-center gap-4'>
                <span className='text-lg font-medium'>{stat.value}</span>
                <span className='flex items-center gap-1'>
                  <span className='text-xs'>
                    {stat.changeType === 'increase' ? '+' : '-'}
                    {stat.change}%
                  </span>
                  {stat.changeType === 'increase' ? (
                    <ChevronUpIcon className='size-4' />
                  ) : stat.changeType === 'decrease' ? (
                    <ChevronDownIcon className='size-4' />
                  ) : null}
                </span>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default GeneralFinanceReviewsCard
