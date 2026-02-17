import { EllipsisVerticalIcon, PlusIcon } from '@/lib/ez-icons'

import { Line, LineChart, XAxis } from 'recharts'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Rating } from '@/components/ui/rating'

const listItems = ['Share', 'Update', 'Refresh']

const chartData = [
  { month: 'January', online: 0.5, offline: 1 },
  { month: 'February', online: 2, offline: 3.5 },
  { month: 'March', online: 1, offline: 1.5 },
  { month: 'April', online: 4.5, offline: 4 },
  { month: 'May', online: 3, offline: 0.5 },
  { month: 'June', online: 1.5, offline: 1 },
  { month: 'July', online: 5, offline: 0.5 }
]

const chartConfig = {
  online: {
    label: 'Online',
    color: 'var(--chart-2)'
  },
  offline: {
    label: 'Offline',
    color: 'color-mix(in oklab, var(--primary) 10%, transparent)'
  }
} satisfies ChartConfig

// @ts-ignore
const CustomDot = props => {
  const { cx, cy, index } = props

  if (index !== chartData.length - 1) {
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
          stroke='var(--chart-2)'
          shapeRendering='crispEdges'
        />
        <circle cx='10.3335' cy='9' r='4' fill='var(--chart-2)' />
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

// @ts-ignore
const CustomActiveDot = props => {
  const { cx, cy } = props

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
          stroke='var(--chart-2)'
          shapeRendering='crispEdges'
        />
        <circle cx='10.3335' cy='9' r='4' fill='var(--chart-2)' />
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

const CustomerRatingsCard = ({ className }: { className?: string }) => {
  return (
    <Card className={className}>
      <CardHeader className='flex justify-between'>
        <span className='text-lg font-semibold'>Customer Ratings</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='icon' className='text-muted-foreground size-6 rounded-full'>
              <EllipsisVerticalIcon />
              <span className='sr-only'>Menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuGroup>
              {listItems.map((item, index) => (
                <DropdownMenuItem key={index}>{item}</DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-2'>
          <div className='flex items-center gap-6'>
            <span className='text-3xl font-semibold'>4.5</span>
            <Rating readOnly variant='yellow' size={24} value={4.5} precision={0.5} />
          </div>
          <div className='flex items-center gap-6'>
            <Badge className='bg-primary/10 [a&]:hover:bg-primary/5 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40 text-primary rounded-sm border focus-visible:outline-none'>
              <PlusIcon className='size-3' />
              5.0
            </Badge>
            <span className='text-muted-foreground text-sm'>Points from last month</span>
          </div>
        </div>

        <ChartContainer config={chartConfig} className='min-h-47.5 w-full flex-1'>
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 7,
              top: -75
            }}
          >
            <XAxis
              dataKey='month'
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={value => value.slice(0, 3)}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Line
              dataKey='online'
              type='bump'
              stroke='var(--color-online)'
              dot={<CustomDot />}
              activeDot={<CustomActiveDot />}
              strokeWidth={5}
            />
            <Line
              dataKey='offline'
              type='monotone'
              stroke='var(--color-offline)'
              strokeWidth={3}
              dot={false}
              activeDot={{ fill: 'color-mix(in oklab, var(--primary) 50%, transparent)', r: 5 }}
              strokeDasharray='12 12'
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export default CustomerRatingsCard
