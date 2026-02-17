import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, ChevronUpIcon, EllipsisVerticalIcon } from '@/lib/ez-icons'

import { Area, AreaChart } from 'recharts'

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

type Props = {
  title: string
  subTitle: string
  totalConversion?: number
  conversionTrend?: 'up' | 'down'
  percentageChange?: number
  conversionData?: {
    title: string
    stat: string
    trend: string
    percentageChange: number
  }[]
  chartData?: {
    month: string
    conversion: number
  }[]
  className?: string
  blurred?: boolean
}

const conversionRateChartConfig = {
  conversion: {
    label: 'Conversion'
  }
} satisfies ChartConfig

const defaultConversionChartData = [
  { month: 'Jan', conversion: 30 },
  { month: 'Feb', conversion: 45 },
  { month: 'Mar', conversion: 35 },
  { month: 'Apr', conversion: 55 },
  { month: 'May', conversion: 40 },
  { month: 'Jun', conversion: 60 },
]

const defaultConversionData = [
  { title: 'Won Deals', stat: '0 deals closed', trend: 'up' as const, percentageChange: 0 },
  { title: 'Lost Deals', stat: '0 deals lost', trend: 'down' as const, percentageChange: 0 },
]

const ConversionRateCard = ({
  title,
  subTitle,
  totalConversion = 0,
  conversionTrend = 'up',
  percentageChange = 0,
  conversionData = defaultConversionData,
  chartData = defaultConversionChartData,
  className,
  blurred = false,
}: Props) => {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className='flex justify-between'>
        <div className='flex flex-col gap-1'>
          <span className='text-lg font-semibold'>{title}</span>
          <span className='text-muted-foreground text-sm'>{subTitle}</span>
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
      <CardContent className='flex flex-1 flex-col justify-between gap-4'>
        <div className='flex items-center gap-4'>
          <div className='flex items-center gap-3'>
            <span className='text-3xl font-semibold'>{totalConversion}%</span>
            <div className='flex items-center gap-1'>
              {conversionTrend === 'up' ? <ChevronUpIcon className='size-4' /> : <ChevronDownIcon className='size-4' />}
              <span className='text-sm'>{percentageChange}%</span>
            </div>
          </div>
          <div className='relative'>
            <ChartContainer config={conversionRateChartConfig} className='h-20 w-full'>
              <AreaChart
                data={chartData}
                margin={{
                  left: 4,
                  right: 4
                }}
                className='stroke-2'
              >
                <defs>
                  <linearGradient id='fillConversion' x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='10%' stopColor='var(--chart-2)' stopOpacity={0.3} />
                    <stop offset='90%' stopColor='var(--chart-2)' stopOpacity={0} />
                  </linearGradient>
                </defs>
                {!blurred && <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />}
                <Area dataKey='conversion' type='natural' fill='url(#fillConversion)' stroke='var(--chart-2)' stackId='a' />
              </AreaChart>
            </ChartContainer>
            {blurred && (
              <div className='absolute inset-0 backdrop-blur-[3px] bg-card/40' />
            )}
          </div>
        </div>

        {conversionData.map((campaign, index) => (
          <div key={index} className='grid grid-cols-5 gap-2'>
            <div className='col-span-4 flex flex-col gap-0.5'>
              <span className='font-medium'>{campaign.title}</span>
              <span className='text-muted-foreground text-sm'>{campaign.stat}</span>
            </div>
            <div className='flex items-center justify-between gap-2'>
              {campaign.trend === 'up' ? <ArrowUpIcon className='size-4' /> : <ArrowDownIcon className='size-4' />}

              <span className='text-sm'>{campaign.percentageChange}%</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default ConversionRateCard
