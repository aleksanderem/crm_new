import { EllipsisVerticalIcon } from '@/lib/ez-icons'

import { Bar, CartesianGrid, ComposedChart, Line, YAxis } from 'recharts'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

import { cn } from '@/lib/utils'

const listItems = ['Share', 'Update', 'Refresh']

const data = [
  {
    name: 'Page A',
    uv: 46400,
    pv: 35000
  },
  {
    name: 'Page B',
    uv: 69230,
    pv: 62000
  },
  {
    name: 'Page C',
    uv: 49845,
    pv: 41000
  },
  {
    name: 'Page D',
    uv: 90000,
    pv: 80000,
    fill: 'var(--chart-2)'
  },
  {
    name: 'Page E',
    uv: 83100,
    pv: 64000
  },
  {
    name: 'Page F',
    uv: 74770,
    pv: 67000
  },
  {
    name: 'Page G',
    uv: 47770,
    pv: 40000
  },
  {
    name: 'Page H',
    uv: 30000,
    pv: 24000
  }
]

const totalEarningChartConfig = {
  uv: {
    label: 'Sales',
    color: 'color-mix(in oklab, var(--chart-2) 10%, background)'
  },
  pv: {
    label: 'Profit',
    color: 'var(--chart-2)'
  }
} satisfies ChartConfig

const WeeklyOverviewCard = ({ className }: { className?: string }) => {
  return (
    <Card className={cn('gap-8', className)}>
      <CardHeader className='flex justify-between'>
        <span className='text-lg font-semibold'>Weekly overview</span>
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
      <CardContent>
        <ChartContainer config={totalEarningChartConfig} className='min-h-35 w-full flex-1'>
          <ComposedChart data={data} margin={{ left: -22, bottom: 10 }}>
            <CartesianGrid strokeDasharray='4' stroke='var(--border)' vertical={false} />
            <YAxis
              domain={[() => 0, () => 90000]}
              type='number'
              allowDataOverflow={false}
              ticks={[0, 30000, 60000, 90000]}
              tickFormatter={value => `${value / 1000}k`}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              tickMargin={8}
              scale='linear'
              includeHidden={false}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey='uv' barSize={20} fill='var(--color-uv)' radius={12} />
            <Line type='linear' dataKey='pv' stroke='var(--color-pv)' strokeWidth={3} />
          </ComposedChart>
        </ChartContainer>
      </CardContent>

      <CardFooter className='flex-col items-stretch gap-4'>
        <div className='flex items-center gap-3'>
          <span className='text-2xl font-medium'>80%</span>
          <span className='text-muted-foreground text-sm'>
            Your sales performance is 60% Better compare to Last month
          </span>
        </div>

        <Button size='sm'>Details</Button>
      </CardFooter>
    </Card>
  )
}

export default WeeklyOverviewCard
