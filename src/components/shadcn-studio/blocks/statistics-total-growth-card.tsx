'use client'

import { Label, Pie, PieChart } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

import { cn } from '@/lib/utils'

// Growth chart data
const growthChartData = [
  { month: 'january', sales: 340, fill: 'var(--color-january)' },
  { month: 'february', sales: 200, fill: 'var(--color-february)' },
  { month: 'march', sales: 200, fill: 'var(--color-march)' }
]

const growthChartConfig = {
  sales: {
    label: 'Sales'
  },
  january: {
    label: 'January',
    color: 'var(--chart-1)'
  },
  february: {
    label: 'February',
    color: 'var(--chart-4)'
  },
  march: {
    label: 'March',
    color: 'var(--chart-2)'
  }
} satisfies ChartConfig

const StatisticsCardData = {
  title: '$27.9k',
  description: 'Total Growth',
  children: (
    <>
      <ChartContainer config={growthChartConfig} className='h-31 w-full'>
        <PieChart margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Pie
            data={growthChartData}
            dataKey='sales'
            nameKey='month'
            innerRadius={40}
            strokeWidth={20}
            outerRadius={60}
            paddingAngle={3}
          >
            <Label
              content={({ viewBox }) => {
                if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor='middle' dominantBaseline='middle'>
                      <tspan x={viewBox.cx} y={viewBox.cy} className='fill-foreground text-xl font-medium'>
                        $23K
                      </tspan>
                    </text>
                  )
                }
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
    </>
  ),
  changePercentage: '+49%'
}

const StatisticsTotalGrowthCard = ({ className }: { className?: string }) => {
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

export default StatisticsTotalGrowthCard
