import { EllipsisVerticalIcon } from '@/lib/ez-icons'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
  productsData: {
    img: string
    productName: string
    price: string
    visits: string
  }[]
  className?: string
}

const PopularProductCard = ({ title, subTitle, productsData, className }: Props) => {
  return (
    <Card className={cn('gap-3', className)}>
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
      <CardContent className='flex flex-1 flex-col justify-between gap-3'>
        {productsData.map((product, index) => (
          <div key={index} className='flex items-center justify-between gap-2'>
            <div className='flex items-center justify-between gap-2'>
              <div className='p-2'>
                <img src={product.img} alt={product.productName} className='size-10.5' />
              </div>
              <div className='flex flex-col gap-0.5'>
                <span className='font-medium'>{product.productName}</span>
                <span className='text-muted-foreground text-xs'>{product.price}</span>
              </div>
            </div>
            <span className='text-muted-foreground text-sm'>{product.visits}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default PopularProductCard
