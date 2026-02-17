import { CartesianGrid, Line, LineChart } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

import { cn } from '@/lib/utils'

// Session chart data
const sessionChartData = [
  { month: 'January', sessions: 10 },
  { month: 'February', sessions: 55 },
  { month: 'March', sessions: 30 },
  { month: 'April', sessions: 80 },
  { month: 'May', sessions: 70 },
  { month: 'June', sessions: 110 }
]

const sessionChartConfig = {
  sessions: {
    label: 'Sessions'
  }
} satisfies ChartConfig

// Custom dot for chart
// @ts-ignore
const CustomDot = props => {
  const { cx, cy, index } = props

  if (index !== sessionChartData.length - 1) {
    return null
  }

  return (
    <svg
      x={cx - 10}
      y={cy - 8}
      width='16'
      height='16'
      viewBox='0 0 18 18'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
    >
      <g filter='url(#filter0_d_16482_113925)'>
        <path
          d='M2.3335 9C2.3335 4.58172 5.91522 1 10.3335 1C14.7518 1 18.3335 4.58172 18.3335 9C18.3335 13.4183 14.7518 17 10.3335 17C5.91522 17 2.3335 13.4183 2.3335 9Z'
          fill='var(--card)'
          shapeRendering='crispEdges'
        />
        <path
          d='M10.3335 1.5C14.4756 1.5 17.8335 4.85786 17.8335 9C17.8335 13.1421 14.4756 16.5 10.3335 16.5C6.19136 16.5 2.8335 13.1421 2.8335 9C2.8335 4.85786 6.19136 1.5 10.3335 1.5Z'
          stroke='var(--chart-4)'
          shapeRendering='crispEdges'
        />
        <circle cx='10.3335' cy='9' r='4' fill='var(--chart-4)' />
      </g>
      <defs>
        <filter
          id='filter0_d_16482_113925'
          x='0.333496'
          y='0'
          width='20'
          height='20'
          filterUnits='userSpaceOnUse'
          colorInterpolationFilters='sRGB'
        >
          <feFlood floodOpacity='0' result='BackgroundImageFix' />
          <feColorMatrix
            in='SourceAlpha'
            type='matrix'
            values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0'
            result='hardAlpha'
          />
          <feOffset dy='1' />
          <feGaussianBlur stdDeviation='1' />
          <feComposite in2='hardAlpha' operator='out' />
          <feColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.05 0' />
          <feBlend mode='normal' in2='BackgroundImageFix' result='effect1_dropShadow_16482_113925' />
          <feBlend mode='normal' in='SourceGraphic' in2='effect1_dropShadow_16482_113925' result='shape' />
        </filter>
      </defs>
    </svg>
  )
}

// Custom active dot for chart
// @ts-ignore
const CustomActiveDot = props => {
  const { cx, cy, index } = props

  if (index !== sessionChartData.length - 1) {
    return (
      <svg
        x={cx - 6}
        y={cy - 5}
        width='11'
        height='10'
        viewBox='0 0 11 10'
        fill='none'
        xmlns='http://www.w3.org/2000/svg'
      >
        <circle cx='5.84033' cy='5' r='4' fill='var(--chart-4)' />
      </svg>
    )
  }

  return (
    <svg
      x={cx - 6}
      y={cy - 6}
      width='11'
      height='10'
      viewBox='0 0 11 10'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
    >
      <circle cx='5.84033' cy='5' r='2' fill='var(--chart-4)' />
    </svg>
  )
}

const StatisticsCardData = {
  title: '$38.5k',
  description: 'Sessions',
  children: (
    <>
      <ChartContainer config={sessionChartConfig} className='h-31 w-full'>
        <LineChart
          accessibilityLayer
          data={sessionChartData}
          margin={{
            left: 8,
            right: 6
          }}
        >
          <CartesianGrid horizontal={false} strokeDasharray='4' stroke='var(--border)' />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Line
            dataKey='sessions'
            type='linear'
            dot={<CustomDot />}
            stroke='var(--chart-4)'
            strokeWidth={3}
            activeDot={<CustomActiveDot />}
          />
        </LineChart>
      </ChartContainer>
    </>
  ),
  changePercentage: '+62%'
}

const StatisticsSessionsCard = ({ className }: { className?: string }) => {
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

export default StatisticsSessionsCard
