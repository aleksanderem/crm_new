'use client'

import { CircleDollarSignIcon, EllipsisVerticalIcon, WalletIcon } from '@/lib/ez-icons'

import { Bar, BarChart, LabelList, XAxis } from 'recharts'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { Separator } from '@/components/ui/separator'

import { cn } from '@/lib/utils'

const listItems = ['Share', 'Update', 'Refresh']

const transactionsChartData = [
  { month: 'January', transaction: '38000', fill: 'color-mix(in oklab, var(--chart-2) 20%, transparent)' },
  { month: 'February', transaction: '52000', fill: 'var(--chart-2)' },
  { month: 'March', transaction: '32000', fill: 'color-mix(in oklab, var(--chart-2) 20%, transparent)' },
  { month: 'April', transaction: '12000', fill: 'color-mix(in oklab, var(--chart-2) 20%, transparent)' },
  { month: 'May', transaction: '35000', fill: 'color-mix(in oklab, var(--chart-2) 20%, transparent)' },
  { month: 'June', transaction: '28000', fill: 'color-mix(in oklab, var(--chart-2) 20%, transparent)' },
  { month: 'July', transaction: '33000', fill: 'color-mix(in oklab, var(--chart-2) 20%, transparent)' },
  { month: 'August', transaction: '25000', fill: 'color-mix(in oklab, var(--chart-2) 20%, transparent)' }
]

const transactionsChartConfig = {
  transaction: {
    label: 'Transaction'
  }
} satisfies ChartConfig

const TotalTransactionCard = ({ className }: { className?: string }) => {
  return (
    <Card className={cn('grid grid-cols-1 gap-4 md:grid-cols-5', className)}>
      <div className='max-md:border-b md:col-span-3 md:border-r md:pr-4'>
        <CardHeader className='flex justify-between'>
          <div className='flex flex-col gap-1'>
            <span className='text-lg font-semibold'>Total Transaction</span>
            <span className='text-muted-foreground text-sm'>Weekly overview</span>
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
        <CardContent className='max-md:pb-6'>
          <ChartContainer config={transactionsChartConfig} className='h-83 w-full'>
            <BarChart
              accessibilityLayer
              data={transactionsChartData}
              barSize={35}
              margin={{
                top: 7
              }}
            >
              <XAxis
                dataKey='month'
                tickLine={false}
                tickMargin={5.5}
                axisLine={false}
                tickFormatter={value => value.slice(0, 3)}
                className='text-sm'
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey='transaction' radius={10}>
                <LabelList
                  position='top'
                  offset={12}
                  className='fill-card-foreground font-semibold'
                  fontSize={16}
                  formatter={(value: string) => `${value.slice(0, 2)}K`}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </div>
      <div className='flex flex-col gap-8 md:col-span-2'>
        <CardHeader className='flex justify-between'>
          <div className='flex flex-col gap-1'>
            <span className='text-lg font-semibold'>Report</span>
            <span className='text-muted-foreground text-sm'>Last month transactions $23.4K</span>
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
        <CardContent className='flex flex-1 items-center'>
          <div className='flex flex-1 justify-around gap-1'>
            <div className='flex flex-col items-center gap-4 p-2'>
              <Avatar className='size-12 rounded-sm'>
                <AvatarFallback className='bg-chart-5/10 text-chart-5 shrink-0 rounded-sm'>
                  <CircleDollarSignIcon className='size-6' />
                </AvatarFallback>
              </Avatar>
              <div className='flex flex-col items-center gap-1'>
                <span className='text-muted-foreground'>This week</span>
                <span className='text-2xl font-medium'>+82.46%</span>
              </div>
            </div>
            <Separator orientation='vertical' className='!h-[inherit]' />
            <div className='flex flex-col items-center gap-4 p-2'>
              <Avatar className='size-12 rounded-sm'>
                <AvatarFallback className='bg-chart-2/10 text-chart-2 shrink-0 rounded-sm'>
                  <WalletIcon className='size-6' />
                </AvatarFallback>
              </Avatar>
              <div className='flex flex-col items-center gap-1'>
                <span className='text-muted-foreground'>This week</span>
                <span className='text-2xl font-medium'>-24.8%</span>
              </div>
            </div>
          </div>
        </CardContent>
        <div className='px-6'>
          <Separator />
        </div>
        <CardFooter className='justify-between gap-2'>
          <div className='flex flex-col gap-2'>
            <span className='text-muted-foreground'>Performance</span>
            <span className='text-xl font-medium'>+94.13%</span>
          </div>
          <Button asChild>
            <a href='#'>View Report</a>
          </Button>
        </CardFooter>
      </div>
    </Card>
  )
}

export default TotalTransactionCard
