import { Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from 'recharts'

import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer } from '@/components/ui/chart'

import { cn } from '@/lib/utils'

const userReachChartConfig = {
  visitors: {
    label: 'Visitors',
    color: 'var(--chart-5)'
  }
} satisfies ChartConfig

interface StatisticsUserReachCardProps {
  className?: string
  title?: string
  description?: string
  value?: string
  changePercentage?: string
  centerValue?: number
  centerLabel?: string
  blurred?: boolean
}

const StatisticsUserReachCard = ({
  className,
  title = 'User reach',
  description = 'Last week',
  value = '32K',
  changePercentage = '+12%',
  centerValue = 500,
  centerLabel = 'Visitors',
  blurred = false,
}: StatisticsUserReachCardProps) => {
  const chartData = [{ visitors: centerValue, fill: 'var(--color-visitors)' }]

  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className='gap-0'>
        <CardTitle className='text-lg font-semibold'>{title}</CardTitle>
        <CardDescription className='text-muted-foreground text-base'>{description}</CardDescription>
      </CardHeader>
      <div className='relative'>
        <ChartContainer config={userReachChartConfig} className='h-21 px-4.5'>
          <RadialBarChart data={chartData} startAngle={90} endAngle={250} innerRadius={47} outerRadius={27}>
            <PolarGrid
              gridType='circle'
              radialLines={false}
              stroke='none'
              className='first:fill-primary/10 last:fill-card'
              polarRadius={[42, 32]}
            />
            <RadialBar dataKey='visitors' />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                    return (
                      <text x={viewBox.cx} y={20} textAnchor='middle' dominantBaseline='middle'>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) - 8}
                          className='fill-foreground text-base font-semibold'
                        >
                          {centerValue.toLocaleString()}
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 15} className='fill-muted-foreground text-xs'>
                          {centerLabel}
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
        {blurred && (
          <div className='absolute inset-0 backdrop-blur-[3px] bg-card/40' />
        )}
      </div>
      <CardFooter className='justify-between'>
        <span className='text-xl font-semibold'>{value}</span>
        <span className='text-primary'>{changePercentage}</span>
      </CardFooter>
    </Card>
  )
}

export default StatisticsUserReachCard
