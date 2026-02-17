'use client'

import { useState } from 'react'

import { ChevronDownIcon, PlusIcon } from '@/lib/ez-icons'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

type Props = {
  defaultOpen?: boolean
  align?: 'start' | 'center' | 'end'
  data: {
    id: number
    name: string
    image: string
    workspace: string
  }[]
}

const AppWorkspaceDropdown = ({ defaultOpen, align = 'end', data }: Props) => {
  const [activeApp, setActiveApp] = useState(data[0].id)

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant='secondary' className='h-fit px-4 py-2.5 font-normal'>
          <img src={data.find(app => app.id === activeApp)?.image || ''} alt='App' className='size-9.5' />
          <div className='flex w-37 flex-col items-start'>
            <span className='text-base font-medium'>{data.find(app => app.id === activeApp)?.name || ''}</span>
            <span className='text-muted-foreground text-sm'>
              {data.find(app => app.id === activeApp)?.workspace || ''}
            </span>
          </div>
          <ChevronDownIcon className='size-6' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-75 space-y-1' align={align || 'end'}>
        {data.map(app => (
          <DropdownMenuCheckboxItem
            key={app.id}
            className='data-[state=checked]:bg-muted gap-4 px-4 py-2.5 [&>span]:hidden'
            checked={activeApp === app.id}
            onCheckedChange={() => setActiveApp(app.id)}
          >
            <img src={app.image} alt={app.name} className='size-9.5' />
            <div className='flex flex-col items-start'>
              <span className='text-base font-medium'>{app.name}</span>
              <span className='text-muted-foreground text-sm'>{app.workspace}</span>
            </div>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuItem className='bg-primary/10 focus:bg-primary/15 text-primary justify-center'>
          <span>Add New Workspace</span>
          <PlusIcon className='text-primary' />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default AppWorkspaceDropdown
