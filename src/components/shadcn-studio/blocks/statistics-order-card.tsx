import { Bar, BarChart } from 'recharts'

import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

import { cn } from '@/lib/utils'

const defaultChartData = [
  { day: 'Monday', orders: 120 },
  { day: 'Tuesday', orders: 285 },
  { day: 'Wednesday', orders: 190 },
  { day: 'Thursday', orders: 190 },
  { day: 'Friday', orders: 315 },
  { day: 'Saturday', orders: 190 },
  { day: 'Sunday', orders: 220 }
]

const orderChartConfig = {
  orders: {
    label: 'Orders',
    color: 'var(--chart-1)'
  }
} satisfies ChartConfig

interface StatisticsOrderCardProps {
  className?: string
  title?: string
  description?: string
  value?: string
  changePercentage?: string
  chartData?: { day: string; orders: number }[]
  blurred?: boolean
}

const StatisticsOrderCard = ({
  className,
  title = 'Order',
  description = 'Last week',
  value = '124K',
  changePercentage = '+12.6%',
  chartData = defaultChartData,
  blurred = false,
}: StatisticsOrderCardProps) => {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className='gap-0'>
        <CardTitle className='text-lg font-semibold'>{title}</CardTitle>
        <CardDescription className='text-muted-foreground text-base'>{description}</CardDescription>
      </CardHeader>
      <div className='relative'>
        <ChartContainer config={orderChartConfig} className='h-21 w-full px-2.75'>
          <BarChart
            accessibilityLayer
            data={chartData}
            barSize={12}
            margin={{ left: 0, right: 0 }}
          >
            <Bar
              dataKey='orders'
              fill='var(--color-orders)'
              background={{ fill: 'color-mix(in oklab, var(--primary) 10%, transparent)', radius: 12 }}
              radius={12}
            />
            {!blurred && <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />}
          </BarChart>
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

export default StatisticsOrderCard
