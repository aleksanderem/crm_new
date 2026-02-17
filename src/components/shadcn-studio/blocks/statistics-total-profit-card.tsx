import { Bar, BarChart } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

import { cn } from '@/lib/utils'

// Profit chart data
const profitChartData = [
  {
    name: 'Page A',
    cy: -2120,
    py: 2080,
    amt: 2210
  },
  {
    name: 'Page B',
    cy: -1720,
    py: 1560,
    amt: 2290
  },
  {
    name: 'Page C',
    cy: -2200,
    py: 2480,
    amt: 2181
  },
  {
    name: 'Page D',
    cy: -1200,
    py: 2700,
    amt: 2500
  },
  {
    name: 'Page E',
    cy: -2200,
    py: 960,
    amt: 2100
  }
]

const profitChartConfig = {
  cy: {
    label: 'Cy',
    color: 'var(--chart-4)'
  },
  py: {
    label: 'Py',
    color: 'var(--chart-2)'
  }
} satisfies ChartConfig

const StatisticsCardData = {
  title: '$88.5k',
  description: 'Total Profit',
  children: (
    <>
      <ChartContainer config={profitChartConfig} className='h-31 w-full'>
        <BarChart
          width={500}
          height={300}
          data={profitChartData}
          stackOffset='sign'
          margin={{
            right: -8,
            left: -7
          }}
          barSize={12}
        >
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey='py' fill='var(--color-py)' stackId='stack' radius={[12, 12, 0, 0]} />
          <Bar dataKey='cy' fill='var(--color-cy)' stackId='stack' radius={[12, 12, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </>
  ),
  changePercentage: '-18%'
}

const StatisticsTotalProfitCard = ({ className }: { className?: string }) => {
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

export default StatisticsTotalProfitCard
