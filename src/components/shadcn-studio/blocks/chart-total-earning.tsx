import { ChevronUpIcon, DollarSignIcon, EllipsisVerticalIcon, ShoppingCartIcon } from '@/lib/ez-icons'

import { Bar, BarChart } from 'recharts'

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

// Earning chart data
const totalEarningChartData = [
  {
    name: 'January',
    uv: -2120,
    pv: 2080,
    amt: 2210
  },
  {
    name: 'February',
    uv: -1720,
    pv: 1560,
    amt: 2290
  },
  {
    name: 'March',
    uv: -2841,
    pv: 2320,
    amt: 2210
  },
  {
    name: 'April',
    uv: -1720,
    pv: 2080,
    amt: 2500
  },
  {
    name: 'May',
    uv: -2200,
    pv: 1160,
    amt: 2100
  },
  {
    name: 'June',
    uv: -2200,
    pv: 2480,
    amt: 2100
  },
  {
    name: 'July',
    uv: -1200,
    pv: 2682,
    amt: 2100
  },
  {
    name: 'August',
    uv: -2200,
    pv: 960,
    amt: 2100
  }
]

const totalEarningChartConfig = {
  pv: {
    label: '2025',
    color: 'var(--chart-5)'
  },
  uv: {
    label: '2024',
    color: 'var(--chart-3)'
  }
} satisfies ChartConfig

const data = [
  {
    icon: <DollarSignIcon className='size-5' />,
    title: 'Total revenue',
    status: 'Successful payments',
    value: '+$250'
  },
  {
    icon: <ShoppingCartIcon className='size-5' />,
    title: 'Total sales',
    status: 'Refund',
    value: '+$80'
  }
]

const TotalEarningCard = ({ className }: { className?: string }) => {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className='flex justify-between'>
        <div className='flex flex-col gap-4'>
          <span className='text-lg font-semibold'>Total earning</span>
          <div className='flex items-center gap-3'>
            <span className='text-4xl font-semibold'>87%</span>
            <div className='flex items-center gap-1'>
              <ChevronUpIcon className='size-4' />
              <span className='text-sm'>+38%</span>
            </div>
          </div>
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
      <CardContent className='flex flex-col justify-between gap-4'>
        <ChartContainer config={totalEarningChartConfig} className='min-h-37.5 w-full'>
          <BarChart
            data={totalEarningChartData}
            stackOffset='sign'
            margin={{
              right: 0,
              left: 0
            }}
            barSize={12}
          >
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey='pv' fill='var(--color-pv)' stackId='stack' radius={[12, 12, 0, 0]} />
            <Bar dataKey='uv' fill='var(--color-uv)' stackId='stack' radius={[12, 12, 0, 0]} />
          </BarChart>
        </ChartContainer>

        <div className='space-y-4'>
          {data.map((earning, index) => (
            <div key={index} className='flex items-center justify-between gap-2'>
              <div className='flex items-center gap-3'>
                <Avatar className='size-10 rounded-sm'>
                  <AvatarFallback className='bg-primary/10 text-primary shrink-0 rounded-sm'>
                    {earning.icon}
                  </AvatarFallback>
                </Avatar>
                <div className='flex flex-col gap-0.5'>
                  <span className='text-lg font-medium'>{earning.title}</span>
                  <span className='text-muted-foreground text-sm'>{earning.status}</span>
                </div>
              </div>
              <span className='text-sm'>{earning.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default TotalEarningCard
