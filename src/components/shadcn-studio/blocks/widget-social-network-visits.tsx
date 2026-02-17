import { ChevronUpIcon, EllipsisVerticalIcon } from '@/lib/ez-icons'

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

const listItems = ['Share', 'Update', 'Refresh']

type Props = {
  title: string
  visits: string
  trend: 'up' | 'down'
  percentage: number
  comparisonText: string
  visitData: {
    img: string
    platform: string
    socialNetworkType: string
    numberOfVisits: string
    growthPercentage: number
  }[]
  className?: string
}

const SocialNetworkVisitsCard = ({ title, visits, trend, percentage, comparisonText, visitData, className }: Props) => {
  return (
    <Card className={className}>
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
      <CardContent className='flex flex-1 flex-col gap-4'>
        <div className='flex flex-col gap-1'>
          <div className='flex items-center gap-2'>
            <span className='text-2xl font-semibold'>{visits}</span>
            <span className='flex items-center gap-1'>
              {trend === 'up' ? <ChevronUpIcon className='size-4' /> : <ChevronUpIcon className='size-4' />}
              <span className='text-sm'>{percentage}%</span>
            </span>
          </div>
          <span className='text-muted-foreground text-sm'>{comparisonText}</span>
        </div>
        {visitData.map((visit, index) => (
          <div key={index} className='flex flex-1 items-center justify-between gap-2'>
            <div className='flex items-center justify-between gap-2'>
              <img src={visit.img} alt={visit.platform} className='size-10.5' />
              <div className='flex flex-col gap-0.5'>
                <span className='font-medium'>{visit.platform}</span>
                <span className='text-muted-foreground text-sm'>{visit.socialNetworkType}</span>
              </div>
            </div>
            <div className='flex items-center justify-between gap-2 text-sm'>
              <span className='text-sm font-medium'>{visit.numberOfVisits}</span>
              <Badge className='bg-primary/10 text-primary'>
                {visit.growthPercentage > 0 ? '+' : ''}
                {visit.growthPercentage}%
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default SocialNetworkVisitsCard
