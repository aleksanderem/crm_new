import { CartesianGrid, Line, LineChart } from 'recharts'

import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

import { cn } from '@/lib/utils'

const defaultChartData = [
  { month: 'January', profit: 10 },
  { month: 'February', profit: 75 },
  { month: 'March', profit: 40 },
  { month: 'April', profit: 100 },
  { month: 'May', profit: 70 },
  { month: 'June', profit: 110 }
]

const profitChartConfig = {
  profit: {
    label: 'Profit'
  }
} satisfies ChartConfig

interface StatisticsProfitCardProps {
  className?: string
  title?: string
  description?: string
  value?: string
  changePercentage?: string
  chartData?: { month: string; profit: number }[]
  blurred?: boolean
}

const StatisticsProfitCard = ({
  className,
  title = 'Profit',
  description = 'Last Month',
  value = '624K',
  changePercentage = '+12.6%',
  chartData = defaultChartData,
  blurred = false,
}: StatisticsProfitCardProps) => {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className='gap-0'>
        <CardTitle className='text-lg font-semibold'>{title}</CardTitle>
        <CardDescription className='text-muted-foreground text-base'>{description}</CardDescription>
      </CardHeader>
      <div className='relative'>
        <ChartContainer config={profitChartConfig} className='h-21 w-full px-4.5'>
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{ left: 6, right: 6 }}
          >
            <CartesianGrid horizontal={false} strokeDasharray='4' stroke='var(--border)' />
            {!blurred && <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />}
            <Line
              dataKey='profit'
              type='linear'
              dot={{ r: 3.5, fill: 'var(--chart-2)' }}
              stroke='var(--chart-2)'
              strokeWidth={3}
              activeDot={{ r: 3, fill: 'var(--primary-foreground)' }}
            />
          </LineChart>
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

export default StatisticsProfitCard
