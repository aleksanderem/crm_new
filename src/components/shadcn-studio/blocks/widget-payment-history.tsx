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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { cn } from '@/lib/utils'

const listItems = ['Share', 'Update', 'Refresh']

type Props = {
  title: string
  paymentData: {
    img: string
    imgWidth: string
    cardNumber: string
    cardType: string
    date: string
    spend: string
    remaining: string
  }[]
  className?: string
}

const PaymentHistoryCard = ({ title, paymentData, className }: Props) => {
  return (
    <Card className={cn('justify-between gap-2.5', className)}>
      <CardHeader className='flex items-center justify-between'>
        <span className='text-lg font-semibold'>{title}</span>
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
      <CardContent className='px-0'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='pl-6'>Card</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className='pr-6 text-end'>Spend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paymentData.map((payment, index) => (
              <TableRow key={index} className='border-none'>
                <TableCell className='pl-6 first:pt-4'>
                  <div className='flex items-center gap-2'>
                    <div className='bg-muted flex size-10.5 items-center justify-center rounded-sm'>
                      <img src={payment.img} alt={payment.cardType} className={payment.imgWidth} />
                    </div>
                    <div className='flex flex-col gap-0.5'>
                      <span className='text-base font-medium'>*{payment.cardNumber}</span>
                      <span className='text-muted-foreground text-sm'>{payment.cardType}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className='text-muted-foreground text-xs'>{payment.date}</TableCell>
                <TableCell className='pr-6'>
                  <div className='flex flex-col items-end'>
                    <span className='text-sm'>-${payment.spend}</span>
                    <span className='text-muted-foreground text-xs'>${payment.remaining}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export default PaymentHistoryCard
