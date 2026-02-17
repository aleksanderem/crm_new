import { ChevronDownIcon, ChevronUpIcon, EllipsisVerticalIcon } from '@/lib/ez-icons'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
  salesData: {
    img: string
    sales: string
    country: string
    changePercentage: string
    trend: string
  }[]
  className?: string
}

const SalesByCountryCard = ({ title, subTitle, salesData, className }: Props) => {
  return (
    <Card className={className}>
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
        {salesData.map((sale, index) => (
          <div key={index} className='flex items-center justify-between gap-4'>
            <div className='flex items-center justify-between gap-4'>
              <div className='overflow-hidden rounded-full'>
                <img src={sale.img} alt={sale.country} className='size-10 object-cover' />
              </div>
              <div className='flex flex-col gap-0.5'>
                <span className='font-medium'>{sale.sales}</span>
                <span className='text-muted-foreground text-sm'>{sale.country}</span>
              </div>
            </div>
            <span className='flex items-center gap-1'>
              {sale.trend === 'up' ? <ChevronUpIcon className='size-4' /> : <ChevronDownIcon className='size-4' />}
              <span className='text-sm'>{sale.changePercentage}</span>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default SalesByCountryCard
