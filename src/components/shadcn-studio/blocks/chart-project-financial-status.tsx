import { CircleDollarSignIcon, EllipsisVerticalIcon } from '@/lib/ez-icons'

import { Area, AreaChart } from 'recharts'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
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
  totalEarning: string
  trend: 'up' | 'down'
  percentageChange: number
  chartData: {
    index: number
    spend: number
  }[]
  financialData: {
    transaction: string
    value: string
    trend: string
    percentageChange: number
  }[]
  className?: string
}

const financialChartConfig = {
  spend: {
    label: 'Spend'
  }
} satisfies ChartConfig

const ProjectFinancialStatusCard = ({
  title,
  totalEarning,
  trend,
  percentageChange,
  chartData,
  financialData,
  className
}: Props) => {
  return (
    <Card className={cn('gap-7', className)}>
      <CardHeader className='flex justify-between'>
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
      <CardContent className='flex flex-1 flex-col gap-4'>
        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center justify-between gap-2'>
            <Avatar className='size-12 rounded-sm'>
              <AvatarFallback className='bg-primary/10 text-primary shrink-0 rounded-sm'>
                <CircleDollarSignIcon className='size-7 stroke-[1.5]' />
              </AvatarFallback>
            </Avatar>
            <div className='flex flex-col gap-1'>
              <span className='text-xl font-semibold'>{totalEarning}</span>
              <span className='text-muted-foreground text-sm'>Your earnings</span>
            </div>
          </div>
          <span className='text-sm'>
            {trend === 'up' ? '+' : '-'}
            {percentageChange}%
          </span>
        </div>
        <ChartContainer config={financialChartConfig} className='min-h-37 w-full flex-1'>
          <AreaChart
            data={chartData}
            margin={{
              top: 2,
              left: 4,
              right: 4
            }}
            className='stroke-2'
          >
            <defs>
              <linearGradient id='fillSales' x1='0' y1='0' x2='0' y2='1'>
                <stop offset='10%' stopColor='var(--primary)' stopOpacity={1} />
                <stop offset='90%' stopColor='var(--primary)' stopOpacity={0} />
              </linearGradient>
            </defs>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={value => [`$${((value as number) / 1000).toFixed(1)}k`, ' ', 'Spend']}
                />
              }
            />
            <Area
              dataKey='spend'
              type='linear'
              fill='url(#fillSales)'
              stroke='var(--primary)'
              strokeWidth={3}
              stackId='a'
            />
          </AreaChart>
        </ChartContainer>

        {financialData.map((item, index) => (
          <div key={index} className='flex items-center justify-between gap-3.5'>
            <span>{item.transaction}</span>
            <div className='flex items-center justify-between gap-3.5'>
              <span className='text-muted-foreground'>{item.value}</span>
              <span className='text-sm'>
                {item.trend === 'up' ? '+' : '-'}
                {item.percentageChange}%
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default ProjectFinancialStatusCard
