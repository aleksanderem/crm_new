import { CircleIcon, EllipsisVerticalIcon } from '@/lib/ez-icons'

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'

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

// Sales chart data
const salesChartData = [
  { sr: 1, service: 'UI design', sales: 99, fill: 'var(--chart-1)' },
  { sr: 2, service: 'UX design', sales: 94, fill: 'var(--chart-2)' },
  { sr: 3, service: 'Music', sales: 80, fill: 'var(--chart-3)' },
  { sr: 4, service: 'Animation', sales: 68, fill: 'var(--chart-4)' },
  { sr: 5, service: 'React', sales: 52, fill: 'var(--chart-5)' },
  { sr: 6, service: 'SEO', sales: 45, fill: 'var(--primary)' }
]

const salesChartConfig = {
  sales: {
    label: 'Sales'
  }
} satisfies ChartConfig

const ServicesBySalesCard = ({ className }: { className?: string }) => {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className='flex justify-between'>
        <span className='text-lg font-semibold'>Top Services by Sales</span>
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
      <CardContent className='grid grid-cols-1 gap-4 px-0 lg:grid-cols-2'>
        <div className='p-6'>
          <ChartContainer config={salesChartConfig} className='h-full min-h-60 w-full max-lg:max-h-70 lg:max-w-95'>
            <BarChart
              accessibilityLayer
              data={salesChartData}
              layout='vertical'
              barSize={24}
              margin={{
                left: -35,
                right: 12
              }}
            >
              <CartesianGrid horizontal={false} strokeDasharray='4' stroke='var(--border)' />
              <XAxis
                type='number'
                dataKey='sales'
                domain={[0, 100]}
                tickFormatter={value => `${value}%`}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              />
              <YAxis dataKey='sr' type='category' tickLine={false} tickMargin={10} axisLine={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey='sales' radius={[0, 10, 10, 0]}>
                <LabelList dataKey='service' position='middle' fill='var(--primary-foreground)' className='text-sm' />
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
        <div className='grid grid-cols-2 gap-x-23 gap-y-12 px-8 max-lg:gap-x-8 lg:py-10'>
          {salesChartData.map((service, index) => (
            <div key={index} className='flex gap-3 px-2'>
              <div className='flex size-4.5 items-center justify-center'>
                <CircleIcon fill={service.fill} stroke={service.fill} className='size-2.5' />
              </div>
              <div className='flex flex-col gap-2'>
                <span className='text-muted-foreground text-sm'>{service.service}</span>
                <span className='text-lg font-medium'>{service.sales}%</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default ServicesBySalesCard
