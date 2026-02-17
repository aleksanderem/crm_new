import { useState, type ReactNode } from 'react'

import { AlertCircleIcon, DollarSignIcon, UploadIcon, XIcon } from '@/lib/ez-icons'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { useFileUpload } from '@/hooks/use-file-upload'

import { cn } from '@/lib/utils'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  className?: string
}

// Product categories
const categories = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'fashion', label: 'Fashion' },
  { value: 'home', label: 'Home' },
  { value: 'toys', label: 'Toys' },
  { value: 'sports', label: 'Sports' },
  { value: 'automotive', label: 'Automotive' }
]

// Initial files for demonstration purposes
const initialFiles = [
  {
    name: 'image-3.png',
    size: 1528737,
    type: 'image/png',
    url: 'https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dashboard-dialog/image-3.png',
    id: 'image-03'
  },
  {
    name: 'image-4.png',
    size: 1528737,
    type: 'image/png',
    url: 'https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dashboard-dialog/image-4.png',
    id: 'image-04'
  },
  {
    name: 'image-5.png',
    size: 1528737,
    type: 'image/png',
    url: 'https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dashboard-dialog/image-5.png',
    id: 'image-05'
  },
  {
    name: 'image-6.png',
    size: 1528737,
    type: 'image/png',
    url: 'https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dashboard-dialog/image-6.png',
    id: 'image-06'
  }
]

const UpdateProductDialog = ({ defaultOpen = false, trigger, className }: Props) => {
  const [open, setOpen] = useState(defaultOpen)

  const maxSizeMB = 5
  const maxSize = maxSizeMB * 1024 * 1024
  const maxFiles = 6

  const [
    { files, isDragging, errors },
    { handleDragEnter, handleDragLeave, handleDragOver, handleDrop, openFileDialog, removeFile, getInputProps }
  ] = useFileUpload({
    accept: 'image/svg+xml,image/png,image/jpeg,image/jpg',
    maxSize,
    multiple: true,
    maxFiles,
    initialFiles
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild onClick={() => setOpen(true)}>
        {trigger}
      </DialogTrigger>
      <DialogContent
        className={cn(
          'flex max-h-[min(920px,95vh)] flex-col gap-0 p-0 max-sm:max-h-[min(650px,80vh)] md:max-w-188 lg:max-w-197.5 [&>[data-slot=dialog-close]>svg]:size-5',
          className
        )}
      >
        <ScrollArea className='flex max-h-full flex-col overflow-hidden'>
          <div className='flex flex-col gap-6 p-6'>
            <DialogHeader>
              <DialogTitle className='leading-7'>Update Product</DialogTitle>
            </DialogHeader>

            <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
              <div className='col-span-2 space-y-1'>
                <Label htmlFor='product-name'>Product Name</Label>
                <Input id='product-name' type='text' placeholder='Product Name' defaultValue='Apple iMac 4' />
              </div>

              <div className='col-span-2 space-y-1'>
                <Label htmlFor='category'>Category</Label>
                <Select defaultValue='electronics'>
                  <SelectTrigger
                    id='category'
                    className='[&>span_svg]:text-muted-foreground/80 w-full [&>span]:flex [&>span]:items-center [&>span]:gap-2 [&>span_svg]:shrink-0'
                  >
                    <SelectValue placeholder='Select category' />
                  </SelectTrigger>
                  <SelectContent className='[&_*[role=option]>span>svg]:text-muted-foreground/80 max-h-100 [&_*[role=option]]:pr-8 [&_*[role=option]]:pl-2 [&_*[role=option]>span]:right-2 [&_*[role=option]>span]:left-auto [&_*[role=option]>span]:flex [&_*[role=option]>span]:items-center [&_*[role=option]>span]:gap-2 [&_*[role=option]>span>svg]:shrink-0'>
                    {categories.map(category => (
                      <SelectItem key={category.value} value={category.value}>
                        <span className='truncate'>{category.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='col-span-2 space-y-1'>
                <Label htmlFor='brand'>Brand</Label>
                <Input id='brand' type='text' placeholder='Brand Name' defaultValue='Apple' />
              </div>

              <div className='col-span-2 space-y-1'>
                <Label htmlFor='price'>Price</Label>
                <div className='relative'>
                  <div className='pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-3 peer-disabled:opacity-50'>
                    <DollarSignIcon className='size-4' />
                    <span className='sr-only'>User</span>
                  </div>
                  <Input id='price' type='number' placeholder='Price' className='peer pl-7' defaultValue={1299} />
                </div>
              </div>

              <div className='space-y-1'>
                <Label htmlFor='weight'>Weight (kg)</Label>
                <Input id='weight' type='number' placeholder='Weight' defaultValue={1.2} />
              </div>

              <div className='space-y-1'>
                <Label htmlFor='length'>Length (cm)</Label>
                <Input id='length' type='number' placeholder='Length' defaultValue={126} />
              </div>

              <div className='space-y-1'>
                <Label htmlFor='breadth'>Breadth (cm)</Label>
                <Input id='breadth' type='number' placeholder='Breadth' defaultValue={121} />
              </div>

              <div className='space-y-1'>
                <Label htmlFor='width'>Width (cm)</Label>
                <Input id='width' type='number' placeholder='Width' defaultValue={953} />
              </div>
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='description'>Description</Label>
              <Textarea placeholder='Type here' id='description' />
            </div>

            <RadioGroup defaultValue='both' className='flex items-center gap-4'>
              <div className='flex items-center gap-2'>
                <RadioGroupItem value='online' id='online' className='size-5 [&_svg]:size-3' />
                <Label htmlFor='online'>Online Store</Label>
              </div>
              <div className='flex items-center gap-2'>
                <RadioGroupItem value='both' id='both' className='size-5 [&_svg]:size-3' />
                <Label htmlFor='both'>Both in-store and online</Label>
              </div>
              <div className='flex items-center gap-2'>
                <RadioGroupItem value='offline' id='offline' className='size-5 [&_svg]:size-3' />
                <Label htmlFor='offline'>Offline Store</Label>
              </div>
            </RadioGroup>

            <div className='flex flex-col gap-6'>
              {files.length > 0 && (
                <div className='grid grid-cols-2 gap-6 sm:grid-cols-4'>
                  {files.map(file => {
                    return (
                      <div key={file.id} className='bg-muted relative rounded-sm p-6 transition-opacity duration-300'>
                        <img src={file.preview} alt={file.file.name} className='mx-auto object-cover' />
                        <Button
                          onClick={() => removeFile(file.id)}
                          variant='secondary'
                          size='icon'
                          className='border-background focus-visible:border-background absolute -top-2 -right-2 size-6 rounded-full border-2'
                          aria-label='Remove image'
                        >
                          <XIcon className='size-3.5' />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}

              <div
                role='button'
                onClick={openFileDialog}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                data-dragging={isDragging || undefined}
                data-files={files.length > 0 || undefined}
                className='border-input data-[dragging=true]:bg-accent/50 has-[input:focus]:border-ring has-[input:focus]:ring-ring/50 flex min-h-50 flex-col items-center justify-center gap-4 overflow-hidden rounded-sm border border-dashed p-6 text-center has-[input:focus]:ring-[3px]'
              >
                <input {...getInputProps()} className='sr-only' aria-label='Upload image file' />
                <UploadIcon className='size-10 stroke-1' />
                <p className='font-medium'>Drag & Drop or Choose file to upload</p>
                <p className='text-muted-foreground text-sm'>
                  Max {maxFiles} files ∙ Up to {maxSizeMB}MB
                </p>
              </div>

              {errors.length > 0 && (
                <div className='text-destructive flex items-center gap-1 text-xs' role='alert'>
                  <AlertCircleIcon className='size-3 shrink-0' />
                  <span>{errors[0]}</span>
                </div>
              )}
            </div>

            <DialogFooter className='flex-row gap-4'>
              <Button size='lg'>Update product</Button>
              <DialogClose asChild>
                <Button
                  variant='outline'
                  size='lg'
                  className='hover:bg-destructive/10! text-destructive! border-destructive! focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40'
                >
                  Delete
                </Button>
              </DialogClose>
            </DialogFooter>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export default UpdateProductDialog
