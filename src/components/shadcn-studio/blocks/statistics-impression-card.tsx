import { Line, LineChart } from 'recharts'

import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

import { cn } from '@/lib/utils'

const defaultChartData = [
  { month: 'January', impression: 20 },
  { month: 'February', impression: 20 },
  { month: 'March', impression: 50 },
  { month: 'April', impression: 50 },
  { month: 'May', impression: 30 },
  { month: 'June', impression: 30 },
  { month: 'July', impression: 5 },
  { month: 'August', impression: 5 },
  { month: 'September', impression: 50 },
  { month: 'October', impression: 50 },
  { month: 'November', impression: 105 },
  { month: 'December', impression: 105 }
]

const impressionChartConfig = {
  impression: {
    label: 'Impressions',
    color: 'var(--chart-5)'
  }
} satisfies ChartConfig

interface StatisticsImpressionCardProps {
  className?: string
  title?: string
  description?: string
  value?: string
  changePercentage?: string
  chartData?: { month: string; impression: number }[]
  blurred?: boolean
}

const StatisticsImpressionCard = ({
  className,
  title = 'Impression',
  description = 'Last year',
  value = '175K',
  changePercentage = '+24%',
  chartData = defaultChartData,
  blurred = false,
}: StatisticsImpressionCardProps) => {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className='gap-0'>
        <CardTitle className='text-lg font-semibold'>{title}</CardTitle>
        <CardDescription className='text-muted-foreground text-base'>{description}</CardDescription>
      </CardHeader>
      <div className='relative'>
        <ChartContainer config={impressionChartConfig} className='h-21 w-full px-4.5'>
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{ left: 6, right: 6 }}
          >
            {!blurred && <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />}
            <Line dataKey='impression' type='linear' dot={false} stroke='var(--color-impression)' strokeWidth={3} />
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

export default StatisticsImpressionCard
