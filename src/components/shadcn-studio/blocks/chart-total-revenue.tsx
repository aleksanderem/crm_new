'use client'

import { CircleDollarSignIcon, EllipsisVerticalIcon, WalletIcon } from '@/lib/ez-icons'

import { Bar, BarChart, CartesianGrid, Label, Pie, PieChart, XAxis, YAxis } from 'recharts'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

import { cn } from '@/lib/utils'

const listItems = ['Share', 'Update', 'Refresh']

const totalEarningChartData = [
  {
    name: 'January',
    uv: -13,
    pv: 21,
    amt: 2210
  },
  {
    name: 'February',
    uv: -16,
    pv: 10,
    amt: 2290
  },
  {
    name: 'March',
    uv: -14,
    pv: 13,
    amt: 2210
  },
  {
    name: 'April',
    uv: -10,
    pv: 12,
    amt: 2500
  },
  {
    name: 'May',
    uv: -17,
    pv: 20,
    amt: 2100
  },
  {
    name: 'June',
    uv: -13,
    pv: 12,
    amt: 2100
  },
  {
    name: 'July',
    uv: -12,
    pv: 15,
    amt: 2100
  }
]

const totalEarningChartConfig = {
  uv: {
    label: '2023',
    color: 'color-mix(in oklab, var(--primary) 20%, var(--background))'
  },
  pv: {
    label: '2024',
    color: 'var(--primary)'
  }
} satisfies ChartConfig

const growthChartData = [
  { date: '2023-11-30', revenue: 20, fill: 'var(--primary)' },
  { date: '2023-12-12', revenue: 20, fill: 'var(--primary)' },
  { date: '2023-11-20', revenue: 20, fill: 'var(--primary)' },
  { date: '2023-12-12', revenue: 20, fill: 'var(--primary)' },
  { date: '2023-12-12', revenue: 20, fill: 'var(--primary)' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 90%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 90%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 80%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 80%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 70%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 70%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 60%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 60%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 50%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 50%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 40%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 40%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 30%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 30%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 20%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 20%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 10%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 10%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 5%, var(--background))' },
  { date: '2023-12-12', revenue: 20, fill: 'color-mix(in oklab, var(--primary) 5%, var(--background))' }
]

const growthChartConfig = {
  revenue: {
    label: 'Revenue'
  }
} satisfies ChartConfig

const data = [
  {
    icon: <CircleDollarSignIcon className='size-5' />,
    year: '2024',
    amount: '$32.5K'
  },
  {
    icon: <WalletIcon className='size-5' />,
    year: '2023',
    amount: '$41.2K'
  }
]

const TotalRevenueCard = ({ className }: { className?: string }) => {
  return (
    <Card className={cn('grid lg:grid-cols-5', className)}>
      <div className='flex flex-col gap-4 max-lg:border-b max-lg:pb-6 lg:col-span-3 lg:border-r'>
        <CardHeader className='flex justify-between'>
          <span className='text-lg font-semibold'>Total Revenue</span>
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
        <CardContent className='flex-1 max-[475px]:mx-auto lg:pr-10'>
          <ChartContainer
            config={totalEarningChartConfig}
            className='h-full min-h-55 w-full max-[475px]:max-w-73 lg:min-h-75'
          >
            <BarChart
              data={totalEarningChartData}
              stackOffset='sign'
              margin={{
                left: -25
              }}
              barSize={12}
            >
              <CartesianGrid vertical={false} strokeDasharray='6' stroke='var(--border)' />
              <XAxis
                dataKey='name'
                axisLine={false}
                tickLine={false}
                tickMargin={10}
                tickFormatter={value => value.slice(0, 3)}
                tick={{ fill: 'var(--card-foreground)', fontSize: '14' }}
              />
              <YAxis
                domain={[-20, 30]}
                ticks={[-20, -10, 0, 10, 20, 30]}
                tickFormatter={value => value}
                tickLine={false}
                tickMargin={8}
                axisLine={false}
              />
              <ChartLegend
                verticalAlign='top'
                className='text-muted-foreground justify-start px-6 pb-6 [&_div>div]:rounded-full'
                content={<ChartLegendContent />}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey='pv' fill='var(--color-pv)' stackId='stack' radius={[12, 12, 0, 0]} />
              <Bar dataKey='uv' fill='var(--color-uv)' stackId='stack' radius={[12, 12, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </div>
      <div className='flex flex-col justify-between gap-8 lg:col-span-2'>
        <CardHeader className='flex justify-center'>
          <Select>
            <SelectTrigger size='sm' className='w-35 [&>svg]:opacity-100'>
              <SelectValue placeholder='Report' />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value='apple'>Revenue</SelectItem>
                <SelectItem value='banana'>Expenses</SelectItem>
                <SelectItem value='blueberry'>Profit</SelectItem>
                <SelectItem value='grapes'>Loss</SelectItem>
                <SelectItem value='pineapple'>Net Income</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className='space-y-8 lg:pl-0'>
          <div className='space-y-8 pt-6 text-center'>
            <ChartContainer config={growthChartConfig} className='h-40 w-full sm:h-45'>
              <PieChart margin={{ top: 0, bottom: -20 }}>
                <Pie
                  data={growthChartData}
                  dataKey='revenue'
                  startAngle={0}
                  endAngle={220}
                  nameKey='date'
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={5}
                >
                  <Label
                    content={({ viewBox }) => {
                      if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                        return (
                          <text x={viewBox.cx} y={viewBox.cy} textAnchor='middle' dominantBaseline='middle'>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) - 7}
                              className='fill-card-foreground text-2xl font-semibold'
                            >
                              78%
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) + 14}
                              className='fill-muted-foreground mt-3 text-sm'
                            >
                              Growth
                            </tspan>
                          </text>
                        )
                      }
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>

            <span className='text-muted-foreground text-sm'>62% Company Growth</span>
          </div>

          <div className='flex items-center justify-between gap-4 md:max-lg:gap-0'>
            {data.map((item, index) => (
              <div key={index} className='flex items-center gap-2 p-2'>
                <Avatar className='size-10 rounded-sm'>
                  <AvatarFallback className='bg-primary/10 text-primary shrink-0 rounded-sm'>
                    {item.icon}
                  </AvatarFallback>
                </Avatar>
                <div className='flex flex-col gap-0.5'>
                  <span className='text-muted-foreground text-sm'>{item.year}</span>
                  <span className='font-medium'>{item.amount}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </div>
    </Card>
  )
}

export default TotalRevenueCard
