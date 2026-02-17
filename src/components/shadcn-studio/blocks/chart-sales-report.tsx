import { ArrowUpIcon, CalendarClockIcon, CalendarDaysIcon, EllipsisVerticalIcon } from '@/lib/ez-icons'

import { Area, AreaChart, CartesianGrid, YAxis } from 'recharts'

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

import { cn } from '@/lib/utils'

const listItems = ['Share', 'Update', 'Refresh']

const salesReportChartData = [
  { index: 1, sales: 315 },
  { index: 2, sales: 300 },
  { index: 3, sales: 380 },
  { index: 4, sales: 300 },
  { index: 5, sales: 390 },
  { index: 6, sales: 370 },
  { index: 7, sales: 590 },
  { index: 8, sales: 450 },
  { index: 9, sales: 470 },
  { index: 10, sales: 300 },
  { index: 11, sales: 400 }
]

const salesReportChartConfig = {
  sales: {
    label: 'Sales'
  }
} satisfies ChartConfig

const SalesReportCard = ({ className }: { className?: string }) => {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className='flex justify-between'>
        <div className='flex flex-col gap-1'>
          <span className='text-lg font-semibold'>Sales report</span>
          <span className='text-muted-foreground text-sm'>Until your daily purchase target</span>
        </div>
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
      <CardContent className='flex flex-1 flex-col gap-4'>
        <ChartContainer config={salesReportChartConfig} className='min-h-65.5 w-full flex-1'>
          <AreaChart
            data={salesReportChartData}
            margin={{
              top: 2,
              left: -18,
              right: 4,
              bottom: 10
            }}
          >
            <defs>
              <linearGradient id='fillSales' x1='0' y1='0' x2='0' y2='1'>
                <stop stopColor='var(--primary)' stopOpacity={1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray='3' stroke='var(--border)' vertical={false} />
            <YAxis
              domain={[100, 700]}
              type='number'
              allowDataOverflow={false}
              ticks={[100, 200, 300, 400, 500, 600, 700]}
              tickFormatter={value => `${value}`}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              tickMargin={12}
              includeHidden={false}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Area
              dataKey='sales'
              type='bump'
              fill='url(#fillSales)'
              stroke='var(--primary)'
              strokeWidth={3}
              fillOpacity={0.3}
            />
          </AreaChart>
        </ChartContainer>

        <div className='flex justify-between'>
          <div className='flex flex-col gap-3'>
            <div className='flex items-center gap-2'>
              <CalendarDaysIcon className='size-4' />
              <span>Monthly</span>
            </div>
            <span className='text-xl font-semibold'>$4,698</span>
            <div className='flex items-center gap-2'>
              <div className='flex items-center gap-0.5'>
                <ArrowUpIcon className='size-4' />
                <span className='text-sm'>25.6%</span>
              </div>
              <span className='text-muted-foreground text-sm'>77 USD</span>
            </div>
          </div>
          <div className='flex flex-col items-end gap-3'>
            <div className='flex items-center gap-2'>
              <CalendarClockIcon className='size-4' />
              <span>Yearly</span>
            </div>
            <span className='text-xl font-semibold'>$14,698</span>
            <div className='flex items-center gap-2'>
              <div className='flex items-center gap-0.5'>
                <ArrowUpIcon className='size-4' />
                <span className='text-sm'>5.6%</span>
              </div>
              <span className='text-muted-foreground text-sm'>77 USD</span>
            </div>
          </div>
        </div>

        <div className='space-y-3'>
          <div className='flex items-center justify-between gap-4 border-b px-2 py-3'>
            <span className='text-muted-foreground'>Los Angeles</span>
            <span className='font-medium'>201, 168</span>
          </div>
          <div className='flex items-center justify-between gap-4 border-b px-2 py-3'>
            <span className='text-muted-foreground'>New York</span>
            <span className='font-medium'>478, 365</span>
          </div>
          <div className='flex items-center justify-between gap-4 px-2 py-3'>
            <span className='text-muted-foreground'>Canada</span>
            <span className='font-medium'>487, 214</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default SalesReportCard
