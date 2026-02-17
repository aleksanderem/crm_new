import { type ReactNode, useId, useState } from 'react'

import { BookOpenIcon, ChevronLeftIcon, ChevronRightIcon, UserRoundIcon, VideoIcon } from '@/lib/ez-icons'

import type { Column, ColumnDef, ColumnFiltersState, PaginationState } from '@tanstack/react-table'
import {
  flexRender,
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getPaginationRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from '@/components/ui/pagination'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { usePagination } from '@/hooks/use-pagination'

import { cn } from '@/lib/utils'

export type Item = {
  id: string
  course: string
  courseIcon: ReactNode
  courseIconColor?: string
  tutor: string
  tutorImage: string
  tutorFallback: string
  time: string
  totalModules: number
  completedModules: number
  stats: { users: number; textMaterial: number; videos: number }
}

const columns: ColumnDef<Item>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
        onCheckedChange={value => table.toggleAllRowsSelected(!!value)}
        aria-label='Select all'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={value => row.toggleSelected(!!value)}
        aria-label='Select row'
      />
    )
  },
  {
    header: 'Course',
    accessorKey: 'course',
    cell: ({ row }) => (
      <div className='flex items-center gap-4'>
        <Avatar className='size-9 rounded-md'>
          <AvatarFallback
            className={cn('bg-primary/10 text-primary rounded-md [&>svg]:size-6', row.original.courseIconColor)}
          >
            {row.original.courseIcon}
          </AvatarFallback>
        </Avatar>
        <div className='flex flex-col gap-1'>
          <span>{row.getValue('course')}</span>
          <div className='flex items-center gap-2'>
            <Avatar className='size-6'>
              <AvatarImage src={row.original.tutorImage} alt='Hallie Richards' />
              <AvatarFallback className='text-xs'>{row.original.tutorFallback}</AvatarFallback>
            </Avatar>
            <span className='text-muted-foreground text-xs'>{row.original.tutor}</span>
          </div>
        </div>
      </div>
    )
  },
  {
    header: 'Time',
    accessorKey: 'time',
    cell: ({ row }) => <span className='text-muted-foreground'>{row.getValue('time')}</span>
  },
  {
    header: 'Progress',
    accessorKey: 'totalModules',
    cell: ({ row }) => (
      <div className='flex items-center gap-3'>
        <span className='text-muted-foreground'>
          {((row.original.completedModules * 100) / row.original.totalModules).toFixed(0)}%
        </span>
        <Progress value={(row.original.completedModules * 100) / row.original.totalModules} className='w-43' />
        <span>
          {row.original.completedModules}/{row.original.totalModules}
        </span>
      </div>
    )
  },
  {
    header: 'Statistics',
    accessorKey: 'stats',
    cell: ({ row }) => (
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <UserRoundIcon className='size-4' />
          <span>{row.original.stats.users}</span>
        </div>
        <div className='flex items-center gap-2'>
          <BookOpenIcon className='size-4' />
          <span>{row.original.stats.textMaterial}</span>
        </div>
        <div className='flex items-center gap-2'>
          <VideoIcon className='size-4' />
          <span>{row.original.stats.videos}</span>
        </div>
      </div>
    ),
    meta: {
      filterVariant: 'range'
    }
  }
]

const CourseDatatable = ({ data }: { data: Item[] }) => {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const pageSize = 5

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSize
  })

  const table = useReactTable({
    data,
    columns,
    state: {
      columnFilters,
      pagination
    },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    enableSortingRemoval: false,
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination
  })

  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage: table.getState().pagination.pageIndex + 1,
    totalPages: table.getPageCount(),
    paginationItemsToDisplay: 2
  })

  return (
    <div className='w-full'>
      <div className='border-b'>
        <div className='flex min-h-17 flex-wrap items-center justify-between gap-3 px-6 py-3'>
          <span className='font-medium'>Course you are taking</span>
          <Filter column={table.getColumn('course')!} />
        </div>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className='h-17 border-t'>
                {headerGroup.headers.map(header => {
                  return (
                    <TableHead key={header.id} className='text-muted-foreground first:w-12.5 first:pl-4 last:px-4'>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className='h-17 first:w-12.5 first:pl-4 last:px-4'>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className='h-24 text-center'>
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className='flex items-center justify-between gap-3 px-6 py-4 max-sm:flex-col md:max-lg:flex-col'>
        <p className='text-muted-foreground text-sm whitespace-nowrap' aria-live='polite'>
          Showing{' '}
          <span>
            {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
            {Math.min(
              Math.max(
                table.getState().pagination.pageIndex * table.getState().pagination.pageSize +
                  table.getState().pagination.pageSize,
                0
              ),
              table.getRowCount()
            )}
          </span>{' '}
          of <span>{table.getRowCount().toString()} entries</span>
        </p>

        <div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <Button
                  className='disabled:pointer-events-none disabled:opacity-50'
                  variant={'ghost'}
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  aria-label='Go to previous page'
                >
                  <ChevronLeftIcon aria-hidden='true' />
                  Previous
                </Button>
              </PaginationItem>

              {showLeftEllipsis && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}

              {pages.map(page => {
                const isActive = page === table.getState().pagination.pageIndex + 1

                return (
                  <PaginationItem key={page}>
                    <Button
                      size='icon'
                      className={`${!isActive && 'bg-primary/10 text-primary hover:bg-primary/20 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40'}`}
                      onClick={() => table.setPageIndex(page - 1)}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {page}
                    </Button>
                  </PaginationItem>
                )
              })}

              {showRightEllipsis && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}

              <PaginationItem>
                <Button
                  className='disabled:pointer-events-none disabled:opacity-50'
                  variant={'ghost'}
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  aria-label='Go to next page'
                >
                  Next
                  <ChevronRightIcon aria-hidden='true' />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  )
}

export default CourseDatatable

function Filter({ column }: { column: Column<any, unknown> }) {
  const id = useId()
  const columnFilterValue = column.getFilterValue()
  const columnHeader = typeof column.columnDef.header === 'string' ? column.columnDef.header : ''

  return (
    <div>
      <Label htmlFor={`${id}-input`} className='sr-only'>
        {columnHeader}
      </Label>
      <Input
        id={`${id}-input`}
        value={(columnFilterValue ?? '') as string}
        onChange={e => column.setFilterValue(e.target.value)}
        placeholder={`Search ${columnHeader.toLowerCase()}`}
        type='text'
      />
    </div>
  )
}
