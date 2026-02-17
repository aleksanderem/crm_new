import { CreditCardIcon, DollarSignIcon, EllipsisVerticalIcon, WalletIcon } from '@/lib/ez-icons'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

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

const financeChartData = [
  { month: 'January', profit: 20, income: 0, expense: 0 },
  { month: 'February', profit: 20, income: 8, expense: 0 },
  { month: 'March', profit: 18, income: 22, expense: 0 },
  { month: 'April', profit: 12, income: 13, expense: 0 },
  { month: 'May', profit: 22, income: 18, expense: 4 },
  { month: 'June', profit: 15, income: 22, expense: 13 },
  { month: 'July', profit: 25, income: 7, expense: 12 }
]

const financeChartConfig = {
  profit: {
    label: 'Profit',
    color: 'var(--chart-2)'
  },
  income: {
    label: 'Income',
    color: 'var(--chart-1)'
  },
  expense: {
    label: 'Expense',
    color: 'var(--chart-4)'
  }
} satisfies ChartConfig

const ReportData = [
  {
    icons: <DollarSignIcon className='size-4.5' />,
    title: 'Total Profit',
    amount: '$48,568.20',
    iconClassName: 'bg-chart-2/10 text-chart-2'
  },
  {
    icons: <WalletIcon className='size-4.5' />,
    title: 'Total Income',
    amount: '$38,453.25',
    iconClassName: 'bg-chart-1/10 text-chart-1'
  },
  {
    icons: <CreditCardIcon className='size-4.5' />,
    title: 'Total Expense',
    amount: '$2,453.45',
    iconClassName: 'bg-chart-4/10 text-chart-4'
  }
]

const FinanceCard = ({ className }: { className?: string }) => {
  return (
    <Card className={cn('grid grid-cols-1 gap-x-2 gap-y-4 lg:grid-cols-5', className)}>
      <div className='flex flex-col gap-10 max-lg:border-b max-lg:pb-6 lg:col-span-3 lg:border-r lg:pr-2'>
        <CardHeader className='flex justify-between'>
          <div className='flex flex-col gap-1'>
            <span className='text-lg font-semibold'>Finance</span>
            <span className='text-muted-foreground text-sm'>Yearly report overview</span>
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
        <CardContent className='flex-1'>
          <ChartContainer config={financeChartConfig} className='h-full min-h-65 w-full'>
            <BarChart accessibilityLayer data={financeChartData} barSize={12} margin={{ left: -30, bottom: -5 }}>
              <CartesianGrid vertical={false} strokeDasharray='4' stroke='var(--border)' />
              <XAxis
                dataKey='month'
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={value => value.slice(0, 3)}
              />
              <YAxis
                domain={[0, 50]}
                ticks={[0, 10, 20, 30, 40, 50]}
                tickFormatter={value => value}
                tickLine={false}
                tickMargin={8}
                axisLine={false}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey='profit' stackId='a' fill='var(--color-profit)' />
              <Bar dataKey='income' stackId='a' fill='var(--color-income)' />
              <Bar dataKey='expense' stackId='a' fill='var(--color-expense)' />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </div>
      <div className='flex flex-col gap-10 lg:col-span-2'>
        <CardHeader className='flex justify-between'>
          <div className='flex flex-col gap-1'>
            <span className='text-lg font-semibold'>Report</span>
            <span className='text-muted-foreground text-sm'>Monthly Avg. $45.578k</span>
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
        <CardContent className='flex flex-1 flex-col justify-between gap-6'>
          {ReportData.map((report, index) => (
            <div key={index} className='flex items-center gap-3'>
              <Avatar className='size-9 rounded-sm'>
                <AvatarFallback
                  className={cn(
                    'bg-primary/10 text-primary shrink-0 rounded-sm [&>svg]:size-4.5',
                    report.iconClassName
                  )}
                >
                  {report.icons}
                </AvatarFallback>
              </Avatar>
              <div className='flex flex-col'>
                <span>{report.title}</span>
                <span className='text-muted-foreground text-sm'>{report.amount}</span>
              </div>
            </div>
          ))}

          <Button>View Report</Button>
        </CardContent>
      </div>
    </Card>
  )
}

export default FinanceCard
