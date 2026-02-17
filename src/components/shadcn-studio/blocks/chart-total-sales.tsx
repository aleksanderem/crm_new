import { GlobeIcon, StoreIcon, TrendingUpIcon } from '@/lib/ez-icons'

import { Bar, ComposedChart, Line, XAxis } from 'recharts'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Separator } from '@/components/ui/separator'

import { cn } from '@/lib/utils'

const chartData = [
  {
    time: '09:00',
    uv: 88,
    pv: 88
  },
  {
    time: '10:00',
    uv: 88,
    pv: 88
  },
  {
    time: '11:00',
    uv: 144,
    pv: 144
  },
  {
    time: '12:00',
    uv: 144,
    pv: 144
  },
  {
    time: '13:00',
    uv: 109,
    pv: 109
  },
  {
    time: '14:00',
    uv: 102,
    pv: 109
  },
  {
    time: '15:00',
    uv: 62,
    pv: 62
  },
  {
    time: '16:00',
    uv: 62,
    pv: 62
  },
  {
    time: '17:00',
    uv: 128,
    pv: 144
  },
  {
    time: '18:00',
    uv: 144,
    pv: 144
  },
  {
    time: '19:00',
    uv: 183,
    pv: 200
  },
  {
    time: '20:00',
    uv: 200,
    pv: 200
  }
]

const totalEarningChartConfig = {
  uv: {
    label: 'Online Store',
    color: 'color-mix(in oklab, var(--chart-2) 10%, transparent)'
  },
  pv: {
    label: 'Offline Store',
    color: 'var(--chart-2)'
  }
} satisfies ChartConfig

const data = [
  {
    icon: <GlobeIcon className='size-4' />,
    platform: 'Online Store',
    sales: '$20k',
    growth: '+12.6%'
  },
  {
    icon: <StoreIcon className='size-4' />,
    platform: 'Offline Store',
    sales: '$20k',
    growth: '-4.2%'
  }
]

const TotalSalesCard = ({ className }: { className?: string }) => {
  return (
    <Card className={cn('justify-between gap-4', className)}>
      <CardHeader className='flex flex-col'>
        <div className='flex w-full items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <Avatar className='size-8 rounded-sm'>
              <AvatarFallback className='bg-chart-2/10 text-chart-2 shrink-0 rounded-sm'>
                <TrendingUpIcon className='size-4' />
              </AvatarFallback>
            </Avatar>
            <span>Total sales</span>
          </div>
          <Button variant='outline' className='h-7 px-2 py-1 text-xs'>
            Details
          </Button>
        </div>

        <div className='flex items-center gap-2'>
          <span className='text-2xl font-semibold'>$2,150.00</span>
          <Badge className='bg-primary/10 [a&]:hover:bg-primary/5 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40 text-primary rounded-sm focus-visible:outline-none'>
            +5%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <Separator />

        <div className='space-y-1'>
          {data.map((item, index) => (
            <div key={index} className='flex items-center justify-between gap-2 py-2'>
              <div className='text-muted-foreground flex items-center gap-2'>
                {item.icon}
                <span className='text-sm'>{item.platform}</span>
              </div>

              <div className='flex items-center gap-2 text-sm'>
                <span className='text-muted-foreground'>{item.sales}</span>
                <span>{item.growth}</span>
              </div>
            </div>
          ))}
        </div>

        <Separator />

        <ChartContainer config={totalEarningChartConfig} className='h-40 w-full'>
          <ComposedChart data={chartData} margin={{ top: 4, right: 6 }}>
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <XAxis
              dataKey='time'
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={15}
              tick={{ fontSize: 14, fill: 'var(--muted-foreground)' }}
            />
            <Bar dataKey='uv' barSize={16} fill='var(--color-uv)' radius={2} />
            <Line type='linear' dataKey='pv' stroke='var(--color-pv)' dot={false} strokeWidth={3} />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export default TotalSalesCard
