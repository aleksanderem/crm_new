import { EllipsisVerticalIcon } from '@/lib/ez-icons'

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

const listItems = ['Share', 'Update', 'Refresh']

type Props = {
  title: string
  subTitle: string
  chartData: {
    country: string
    sales: number
  }[]
  className?: string
}

const countrySalesChartConfig = {
  sales: {
    label: 'Sales',
    color: 'var(--primary)'
  }
} satisfies ChartConfig

const CountrySalesCard = ({ title, subTitle, chartData, className }: Props) => {
  return (
    <Card className={className}>
      <CardHeader className='flex justify-between border-b'>
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
      <CardContent className='flex flex-1'>
        <ChartContainer config={countrySalesChartConfig} className='min-h-80 max-w-89 max-[400px]:max-w-76'>
          <BarChart
            accessibilityLayer
            data={chartData}
            layout='vertical'
            barSize={24}
            margin={{
              left: -26,
              right: 25
            }}
          >
            <CartesianGrid horizontal={false} strokeDasharray='4' stroke='var(--border)' />
            <XAxis
              type='number'
              dataKey='sales'
              domain={[0, 20000]}
              ticks={[0, 4000, 8000, 12000, 16000, 20000]}
              tickFormatter={value => (value === 0 ? '0K' : `${value / 1000}K`)}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
            />
            <YAxis dataKey='country' type='category' tickLine={false} tickMargin={8} axisLine={false} fontSize={14} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey='sales' fill='var(--color-sales)' radius={6}>
              <LabelList
                dataKey='sales'
                offset={24}
                position='insideLeft'
                fill='var(--primary-foreground)'
                className='text-sm'
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export default CountrySalesCard
