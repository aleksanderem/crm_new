import type { ReactNode } from 'react'

import { ChevronDownIcon, ChevronUpIcon, EllipsisVerticalIcon } from '@/lib/ez-icons'

import { Bar, BarChart, XAxis } from 'recharts'

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
  subTitle: string
  statData: {
    icon: ReactNode
    title: string
    department: string
    value: string
    trend: string
    percentage: number
    iconClassName?: string
  }[]
  chartData?: {
    day: string
    earning: number
    fill: string
  }[]
  className?: string
  blurred?: boolean
}

const earningReportChartConfig = {
  earning: {
    label: 'Earning'
  }
} satisfies ChartConfig

const defaultEarningChartData = [
  { day: 'Monday', earning: 120, fill: 'var(--chart-2)' },
  { day: 'Tuesday', earning: 285, fill: 'var(--chart-2)' },
  { day: 'Wednesday', earning: 190, fill: 'var(--chart-2)' },
  { day: 'Thursday', earning: 175, fill: 'var(--chart-2)' },
  { day: 'Friday', earning: 315, fill: 'var(--chart-2)' },
  { day: 'Saturday', earning: 200, fill: 'var(--chart-2)' },
  { day: 'Sunday', earning: 220, fill: 'var(--chart-2)' },
]

const EarningReportCard = ({ title, subTitle, statData, chartData = defaultEarningChartData, className, blurred = false }: Props) => {
  return (
    <Card className={className}>
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
      <CardContent className='flex flex-1 flex-col justify-between gap-6'>
        {statData.map((earning, index) => (
          <div key={index} className='flex items-center justify-between gap-2'>
            <div className='flex items-center justify-between gap-2'>
              <Avatar className='size-10 rounded-sm'>
                <AvatarFallback
                  className={cn('bg-primary/10 text-primary shrink-0 rounded-sm *:size-5', earning.iconClassName)}
                >
                  {earning.icon}
                </AvatarFallback>
              </Avatar>
              <div className='flex flex-col gap-0.5'>
                <span className='font-medium'>{earning.title}</span>
                <span className='text-muted-foreground text-sm'>{earning.department}</span>
              </div>
            </div>
            <div className='flex items-center justify-between gap-2'>
              <span className='text-muted-foreground'>{earning.value}</span>
              <div className='flex items-center gap-1'>
                {earning.trend === 'up' ? <ChevronUpIcon className='size-4' /> : <ChevronDownIcon className='size-4' />}
                <span className='text-sm'>{earning.percentage}%</span>
              </div>
            </div>
          </div>
        ))}
        <div className='relative'>
          <ChartContainer config={earningReportChartConfig} className='h-45 w-full'>
            <BarChart
              accessibilityLayer
              data={chartData}
              barSize={36}
              margin={{
                top: 7,
                left: -4,
                right: -4
              }}
            >
              <XAxis
                dataKey='day'
                tickLine={false}
                tickMargin={5.5}
                axisLine={false}
                tickFormatter={value => value.slice(0, 2)}
                className='text-sm uppercase'
              />
              {!blurred && <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />}
              <Bar dataKey='earning' radius={8} />
            </BarChart>
          </ChartContainer>
          {blurred && (
            <div className='absolute inset-0 backdrop-blur-[3px] bg-card/40' />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default EarningReportCard
