import { Area, AreaChart } from 'recharts'

import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

import { cn } from '@/lib/utils'

const defaultChartData = [
  { date: '2024-06-14', sales: 280 },
  { date: '2024-06-15', sales: 270 },
  { date: '2024-06-16', sales: 350 },
  { date: '2024-06-17', sales: 290 },
  { date: '2024-06-18', sales: 400 },
  { date: '2024-06-19', sales: 570 },
  { date: '2024-06-20', sales: 500 },
  { date: '2024-06-22', sales: 380 },
  { date: '2024-06-21', sales: 480 },
  { date: '2024-06-23', sales: 470 },
  { date: '2024-06-24', sales: 420 },
  { date: '2024-06-25', sales: 380 }
]

const salesGrowthChartConfig = {
  sales: {
    label: 'Sales'
  }
} satisfies ChartConfig

interface StatisticsSalesGrowthCardProps {
  className?: string
  title?: string
  description?: string
  value?: string
  changePercentage?: string
  chartData?: { date: string; sales: number }[]
  gradientId?: string
  blurred?: boolean
}

const StatisticsSalesGrowthCard = ({
  className,
  title = 'Sales Growth',
  description = 'Last 12 Days',
  value = '$12K',
  changePercentage = '-18%',
  chartData = defaultChartData,
  gradientId = 'fillSales',
  blurred = false,
}: StatisticsSalesGrowthCardProps) => {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className='gap-0'>
        <CardTitle className='text-lg font-semibold'>{title}</CardTitle>
        <CardDescription className='text-muted-foreground text-base'>{description}</CardDescription>
      </CardHeader>
      <div className='relative'>
        <ChartContainer config={salesGrowthChartConfig} className='h-21 w-full'>
          <AreaChart
            data={chartData}
            margin={{ left: 0, right: 0 }}
            className='stroke-2'
          >
            <defs>
              <linearGradient id={gradientId} x1='0' y1='0' x2='0' y2='1'>
                <stop offset='10%' stopColor='var(--chart-4)' stopOpacity={0.4} />
                <stop offset='90%' stopColor='var(--chart-4)' stopOpacity={0} />
              </linearGradient>
            </defs>
            {!blurred && <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />}
            <Area dataKey='sales' type='natural' fill={`url(#${gradientId})`} stroke='var(--chart-4)' stackId='a' />
          </AreaChart>
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

export default StatisticsSalesGrowthCard
