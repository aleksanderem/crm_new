'use client'

import { Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer } from '@/components/ui/chart'

import { cn } from '@/lib/utils'

// Overview chart data
const overviewChartData = [{ visitors: 75, fill: 'var(--color-visitors)' }]

const overviewChartConfig = {
  visitors: {
    label: 'Visitors',
    color: 'var(--chart-1)'
  }
} satisfies ChartConfig

const StatisticsCardData = {
  title: '$67.1k',
  description: 'Overview',
  children: (
    <>
      <ChartContainer config={overviewChartConfig} className='h-31 w-full'>
        <RadialBarChart data={overviewChartData} startAngle={90} endAngle={360} innerRadius={55} outerRadius={90}>
          <PolarGrid
            gridType='circle'
            radialLines={false}
            stroke='none'
            className='first:fill-primary/20 last:fill-card'
            polarRadius={[60, 50]}
          />
          <RadialBar dataKey='visitors' cornerRadius={10} />
          <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
            <Label
              content={({ viewBox }) => {
                if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor='middle' dominantBaseline='middle'>
                      <tspan x={viewBox.cx} y={viewBox.cy} className='fill-foreground text-xl font-semibold'>
                        {overviewChartData[0].visitors.toLocaleString()}%
                      </tspan>
                    </text>
                  )
                }
              }}
            />
          </PolarRadiusAxis>
        </RadialBarChart>
      </ChartContainer>
    </>
  ),
  changePercentage: '+32%'
}

const StatisticsOverviewCard = ({ className }: { className?: string }) => {
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

export default StatisticsOverviewCard
