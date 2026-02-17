'use client'

import { Bar, BarChart } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

import { cn } from '@/lib/utils'

// Revenue chart data
const revenueChartData = [
  { month: 'January', desktop: 120, mobile: 80 },
  { month: 'February', desktop: 164, mobile: 120 },
  { month: 'March', desktop: 99, mobile: 138 },
  { month: 'April', desktop: 48, mobile: 80 },
  { month: 'May', desktop: 160, mobile: 141 }
]

const revenueChartConfig = {
  desktop: {
    label: 'Desktop',
    color: 'var(--chart-2)'
  },
  mobile: {
    label: 'Mobile',
    color: 'color-mix(in oklab, var(--chart-2) 20%, transparent)'
  }
} satisfies ChartConfig

const StatisticsCardData = {
  title: '$42.5k',
  description: 'Total Revenue',
  children: (
    <>
      <ChartContainer config={revenueChartConfig} className='h-31 w-full'>
        <BarChart
          accessibilityLayer
          data={revenueChartData}
          barSize={12}
          margin={{
            left: 0,
            right: 0
          }}
          barGap={0}
        >
          <Bar dataKey='desktop' fill='var(--color-desktop)' radius={[12, 12, 0, 0]} />
          <Bar dataKey='mobile' fill='var(--color-mobile)' radius={[12, 12, 0, 0]} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        </BarChart>
      </ChartContainer>
    </>
  ),
  changePercentage: '-22%'
}

const StatisticsTotalRevenueCard = ({ className }: { className?: string }) => {
  return (
    <Card className={cn('justify-between gap-4', className)}>
      <CardHeader className='gap-1'>
        <div className='flex items-center gap-2'>
          <CardTitle className='text-lg font-semibold'>{StatisticsCardData.title}</CardTitle>
          <span>{StatisticsCardData.changePercentage}</span>
        </div>
        <CardDescription className='text-muted-foreground text-base'>{StatisticsCardData.description}</CardDescription>
      </CardHeader>
      <CardContent>{StatisticsCardData.children}</CardContent>
    </Card>
  )
}

export default StatisticsTotalRevenueCard
