import type { ComponentType } from 'react'

import { ArrowDownIcon, ArrowUpIcon, EllipsisVerticalIcon } from '@/lib/ez-icons'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
  transactions: {
    icon: ComponentType
    paymentMethod: string
    platform: string
    amount: string
    paymentType: string
    iconClassName?: string
  }[]
  className?: string
}

const TransactionsCard = ({ title, transactions, className }: Props) => {
  return (
    <Card className={cn('gap-8', className)}>
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
      <CardContent className='flex flex-1 flex-col justify-between gap-4'>
        {transactions.map((transaction, index) => {
          return (
            <div key={index} className='flex items-center justify-between gap-2'>
              <div className='flex items-center justify-between gap-4'>
                <Avatar className='size-10 rounded-sm'>
                  <AvatarFallback
                    className={cn(
                      'bg-primary/10 text-primary shrink-0 rounded-sm [&>svg]:size-5',
                      transaction.iconClassName
                    )}
                  >
                    <transaction.icon />
                  </AvatarFallback>
                </Avatar>
                <div className='flex flex-col gap-0.5'>
                  <span className='font-medium'>{transaction.paymentMethod}</span>
                  <span className='text-muted-foreground text-sm'>{transaction.platform}</span>
                </div>
              </div>
              <div className='flex items-center justify-between gap-2 text-sm'>
                <span className='text-sm'>
                  {transaction.paymentType === 'debit' ? '-' : '+'}
                  {transaction.amount}
                </span>
                <div className='bg-muted text-primary flex size-6 shrink-0 items-center justify-center rounded-full'>
                  {transaction.paymentType === 'debit' ? (
                    <ArrowDownIcon className='size-4' />
                  ) : (
                    <ArrowUpIcon className='size-4' />
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export default TransactionsCard
