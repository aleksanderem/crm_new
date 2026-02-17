import type { ComponentType } from 'react'

import { EllipsisVerticalIcon } from '@/lib/ez-icons'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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

type Props = {
  salesTitle: string
  productsBySalesData: {
    icon: ComponentType
    productName: string
    productBrand: string
    sales: string
    iconClassName?: string
  }[]
  volumeTitle: string
  productsByVolumeData: {
    icon: ComponentType
    productName: string
    productBrand: string
    volume: string
    changePercentage: number
    iconClassName?: string
  }[]
  className?: string
}

const TopProductsCard = ({ salesTitle, productsBySalesData, volumeTitle, productsByVolumeData, className }: Props) => {
  return (
    <Card className={cn('gap-x-2 gap-y-6 lg:flex-row', className)}>
      {/* Products by sales card */}
      <div className='flex flex-1 flex-col gap-9'>
        <CardHeader className='flex items-center justify-between'>
          <span className='text-lg font-semibold'>{salesTitle}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' className='text-muted-foreground size-6 rounded-full'>
                <EllipsisVerticalIcon />
                <span className='sr-only'>Edit menu</span>
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
          {productsBySalesData.map((product, index) => (
            <div key={index} className='flex items-center justify-between gap-2'>
              <div className='flex items-center justify-between gap-3'>
                <Avatar className='size-9 rounded-sm'>
                  <AvatarFallback
                    className={cn(
                      'bg-primary/10 text-primary shrink-0 rounded-sm [&>svg]:size-4.5',
                      product.iconClassName
                    )}
                  >
                    <product.icon />
                  </AvatarFallback>
                </Avatar>
                <div className='flex flex-col'>
                  <span>{product.productName}</span>
                  <span className='text-muted-foreground text-sm'>{product.productBrand}</span>
                </div>
              </div>
              <span className='text-sm'>{product.sales}</span>
            </div>
          ))}
        </CardContent>
      </div>
      <div className='max-lg:px-6'>
        <Separator orientation='vertical' className='hidden lg:block' />
        <Separator className='block lg:hidden' />
      </div>
      {/* Products by volume card */}
      <div className='flex flex-1 flex-col gap-9'>
        <CardHeader className='flex items-center justify-between'>
          <span className='text-lg font-semibold'>{volumeTitle}</span>
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
          {productsByVolumeData.map((product, index) => (
            <div key={index} className='flex items-center justify-between gap-2'>
              <div className='flex items-center justify-between gap-3'>
                <Avatar className='size-9 rounded-sm'>
                  <AvatarFallback
                    className={cn(
                      'bg-primary/10 text-primary shrink-0 rounded-sm [&>svg]:size-4.5',
                      product.iconClassName
                    )}
                  >
                    <product.icon />
                  </AvatarFallback>
                </Avatar>
                <div className='flex flex-col'>
                  <span>{product.productName}</span>
                  <span className='text-muted-foreground text-sm'>{product.productBrand}</span>
                </div>
              </div>
              <div className='flex items-center justify-between gap-2 text-sm'>
                <span className='text-sm'>{product.volume}</span>
                <Badge className='bg-primary/10 text-primary rounded-sm'>
                  {product.changePercentage > 0 && '+'}
                  {product.changePercentage}%
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </div>
    </Card>
  )
}

export default TopProductsCard
