import { SparklesIcon } from '@/lib/ez-icons'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'

import { cn } from '@/lib/utils'

type Props = {
  title: string
  value: string
  changePercentage: number
  salesData: {
    title: string
    value: number
    color: string
  }[]
  className?: string
}

const SalesPerformanceCard = ({ title, value, changePercentage, salesData, className }: Props) => {
  const getBadgeContent = (value: number): string => {
    if (value >= 90) return 'Excellent'
    if (value >= 70) return 'Good'
    if (value >= 50) return 'Average'
    if (value >= 30) return 'Bad'

    return 'Poor'
  }

  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className='flex flex-col'>
        <div className='flex w-full items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <Avatar className='size-8 rounded-sm'>
              <AvatarFallback className='bg-primary/10 text-primary shrink-0 rounded-sm'>
                <SparklesIcon className='size-4' />
              </AvatarFallback>
            </Avatar>
            <span>{title}</span>
          </div>
          <Button variant='outline' className='h-7 px-2 py-1 text-xs'>
            Details
          </Button>
        </div>

        <div className='flex items-center gap-2'>
          <span className='text-2xl font-semibold'>{value}</span>
          <Badge className='bg-primary/10 [a&]:hover:bg-primary/5 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40 text-primary rounded-sm focus-visible:outline-none'>
            {changePercentage > 0 && '+'}
            {changePercentage}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col gap-4'>
        <Separator />
        <div className='grid flex-1 grid-cols-2'>
          {salesData.map((item, index) => {
            const totalBars = 10
            const filledBars = Math.round((item.value / 100) * totalBars)

            return (
              <div key={index} className='flex flex-1 flex-col gap-2.5 p-2'>
                <div className='flex flex-col gap-1'>
                  <span className='text-muted-foreground text-sm'>{item.title}</span>
                  <div className='flex items-center gap-2'>
                    <span className='text-2xl font-medium'>{item.value}</span>
                    <Badge className='bg-primary/10 [a&]:hover:bg-primary/5 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40 text-primary rounded-sm px-3 py-0.5 focus-visible:outline-none'>
                      {getBadgeContent(item.value)}
                    </Badge>
                  </div>
                </div>
                <div className='flex flex-1 flex-col justify-between gap-1.5'>
                  {Array.from({ length: totalBars }, (_, index) => (
                    <Progress
                      key={index}
                      value={index >= totalBars - filledBars ? 100 : 0}
                      className={cn('h-2 rounded-xs', item.color)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export default SalesPerformanceCard
