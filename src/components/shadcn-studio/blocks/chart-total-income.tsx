import type { ReactNode } from 'react'

import { CircleDollarSignIcon, CreditCardIcon, EllipsisVerticalIcon, WalletIcon } from '@/lib/ez-icons'

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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

// Income chart data
const defaultChartData = [
  { day: 'Monday', incomes: 3100 },
  { day: 'Tuesday', incomes: 3100 },
  { day: 'Wednesday', incomes: 5000 },
  { day: 'Thursday', incomes: 5000 },
  { day: 'Friday', incomes: 4000 },
  { day: 'Saturday', incomes: 4000 },
  { day: 'Sunday', incomes: 6000 }
]

const totalIncomeChartConfig = {
  incomes: {
    label: 'Incomes'
  }
} satisfies ChartConfig

const defaultReportData: ReportItem[] = [
  {
    icons: <WalletIcon className='text-chart-2 size-6 stroke-[1.5]' />,
    title: 'Income',
    amount: '$5,550',
    change: '+2.34K'
  },
  {
    icons: <CreditCardIcon className='text-chart-1 size-6 stroke-[1.5]' />,
    title: 'Expense',
    amount: '$3,520',
    change: '-1.4K'
  },
  {
    icons: <CircleDollarSignIcon className='text-chart-5 size-6 stroke-[1.5]' />,
    title: 'Profit',
    amount: '$2,350',
    change: '+3.22K'
  }
]

type ReportItem = {
  icons: ReactNode
  title: string
  amount: string
  change: string
}

type TotalIncomeCardProps = {
  className?: string
  title?: string
  subtitle?: string
  reportTitle?: string
  reportSubtitle?: string
  chartData?: { day: string; incomes: number }[]
  reportData?: ReportItem[]
  blurred?: boolean
}

const TotalIncomeCard = ({
  className,
  title = 'Total Income',
  subtitle = 'Weekly report overview',
  reportTitle = 'Report',
  reportSubtitle = 'Weekly activity',
  chartData = defaultChartData,
  reportData = defaultReportData,
  blurred = false,
}: TotalIncomeCardProps) => {
  return (
    <Card className={cn('grid gap-6 py-0 lg:grid-cols-3', className)}>
      <div className='space-y-4 py-6 max-lg:border-b lg:col-span-2 lg:border-r'>
        <CardHeader className='flex justify-between'>
          <div className='flex flex-col gap-1'>
            <span className='text-lg font-semibold'>{title}</span>
            <span className='text-muted-foreground text-sm'>{subtitle}</span>
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
        <CardContent className='relative pb-0'>
          <ChartContainer config={totalIncomeChartConfig} className='max-h-80 min-h-48 w-full max-[400px]:max-w-73'>
            <AreaChart
              data={chartData}
              margin={{
                left: -18,
                right: 12,
                top: 12,
                bottom: 12
              }}
              className='stroke-2'
            >
              <defs>
                <linearGradient id='fillSales' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='20%' stopColor='var(--chart-2)' stopOpacity={1} />
                  <stop offset='80%' stopColor='var(--chart-2)' stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray='3' stroke='var(--border)' vertical={false} />
              <XAxis
                dataKey='day'
                tickLine={false}
                tickMargin={5.5}
                axisLine={false}
                tickFormatter={value => value.slice(0, 2)}
                className='text-card-foreground text-sm uppercase opacity-100'
              />
              <YAxis
                domain={[() => 1000, () => 6000]}
                type='number'
                allowDataOverflow={false}
                ticks={[1000, 2000, 3000, 4000, 5000, 6000]}
                tickFormatter={value => `$${value / 1000}k`}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                tickMargin={8}
                scale='linear'
                includeHidden={false}
              />
              {!blurred && <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={value => [`$${((value as number) / 1000).toFixed(1)}k`, ' Income']}
                  />
                }
              />}
              <Area dataKey='incomes' type='linear' fill='url(#fillSales)' stroke='var(--chart-2)' stackId='a' />
            </AreaChart>
          </ChartContainer>
          {blurred && (
            <div className='absolute inset-0 backdrop-blur-[3px] bg-card/40' />
          )}
        </CardContent>
      </div>
      <div className='flex flex-col gap-10 py-6'>
        <CardHeader className='flex justify-between'>
          <div className='flex flex-col gap-1'>
            <span className='text-lg font-semibold'>{reportTitle}</span>
            <span className='text-muted-foreground text-sm'>{reportSubtitle}</span>
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
        <CardContent className='grow lg:pl-0'>
          <div className='flex h-full flex-col gap-4'>
            {reportData.map((report, index) => (
              <div key={index} className='bg-muted flex grow items-center justify-between gap-4 rounded-md px-4 py-2'>
                <div className='flex items-center gap-4'>
                  <Avatar className='size-10 rounded-sm'>
                    <AvatarFallback className='bg-card text-primary shrink-0 rounded-sm'>{report.icons}</AvatarFallback>
                  </Avatar>
                  <div className='flex flex-col gap-0.5'>
                    <span className='text-muted-foreground font-medium'>{report.title}</span>
                    <span className='text-lg font-medium'>{report.amount}</span>
                  </div>
                </div>
                <span className='text-sm'>{report.change}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </div>
    </Card>
  )
}

export default TotalIncomeCard
