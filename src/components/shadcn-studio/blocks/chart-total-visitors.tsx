import { ArrowDownLeftIcon, ArrowUpRightIcon, UsersRoundIcon } from '@/lib/ez-icons'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

import { cn } from '@/lib/utils'

type Props = {
  title: string
  totalVisitors: string
  percentage: number
  visitorData: {
    product: string
    percentage: number
    amount: number
    trend: string
    heightClass: string
    color: string
  }[]
  className?: string
}

const TotalVisitorsCard = ({ title, totalVisitors, percentage, visitorData, className }: Props) => {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className='flex flex-col'>
        <div className='flex w-full items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <Avatar className='size-8 rounded-sm'>
              <AvatarFallback className='bg-primary/10 text-primary shrink-0 rounded-sm'>
                <UsersRoundIcon className='size-4' />
              </AvatarFallback>
            </Avatar>
            <span>{title}</span>
          </div>
          <Button variant='outline' className='h-7 px-2 py-1 text-xs'>
            Details
          </Button>
        </div>

        <div className='flex items-center gap-2'>
          <span className='text-2xl font-semibold'>{totalVisitors}</span>
          <Badge className='bg-primary/10 [a&]:hover:bg-primary/5 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40 text-primary rounded-sm focus-visible:outline-none'>
            {percentage > 0 && '+'}
            {percentage}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col gap-4'>
        <Separator />
        <div className='flex flex-1'>
          {visitorData.map((item, index) => (
            <div key={index} className='flex grow flex-col gap-2.5 border-dashed p-2 not-last:border-r'>
              <span className='text-muted-foreground text-sm'>{item.product}</span>

              <div className='text-2xl font-medium'>{item.percentage}%</div>
              <div className='flex min-h-35 flex-1 items-end'>
                <div className={cn('bg-primary grow rounded-xl', item.heightClass, item.color)}></div>
              </div>
              <div className='flex items-center justify-between gap-2'>
                <span className='text-muted-foreground text-sm'>{item.amount}</span>
                {item.trend === 'up' ? (
                  <ArrowUpRightIcon className='size-4' />
                ) : (
                  <ArrowDownLeftIcon className='size-4' />
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default TotalVisitorsCard
