'use client'
import { useState } from 'react'
import {
  AlertCircleIcon,
  FileTextIcon,
  UploadIcon,
  XIcon,
  LoaderIcon,
  CircleXIcon,
  CircleAlertIcon
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatBytes, useFileUpload, type FileWithPreview } from '@/hooks/use-file-upload'
import { Progress } from '@/components/ui/progress'

type UploadProgress = {
  fileId: string
  progress: number
  completed: boolean
}

// Simulates file upload with realistic progress reporting and variable timing
const simulateUpload = (totalBytes: number, onProgress: (progress: number) => void, onComplete: () => void) => {
  let timeoutId: NodeJS.Timeout
  let uploadedBytes = 0
  let lastProgressReport = 0

  const simulateChunk = () => {
    const chunkSize = Math.floor(Math.random() * 300000) + 2000
    uploadedBytes = Math.min(totalBytes, uploadedBytes + chunkSize)
    const progressPercent = Math.floor((uploadedBytes / totalBytes) * 100)

    if (progressPercent > lastProgressReport) {
      lastProgressReport = progressPercent
      onProgress(progressPercent)
    }

    if (uploadedBytes < totalBytes) {
      const delay = Math.floor(Math.random() * 450) + 50
      const extraDelay = Math.random() < 0.05 ? 500 : 0
      timeoutId = setTimeout(simulateChunk, delay + extraDelay)
    } else {
      onComplete()
    }
  }

  timeoutId = setTimeout(simulateChunk, 100)

  return () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

// Returns a file icon component for non-image files, or false for image files
const getFileIcon = (file: { file: File | { type: string; name: string } }) => {
  const fileName = file.file instanceof File ? file.file.name : file.file.name
  const fileType = file.file instanceof File ? file.file.type : file.file.type
  const extension = fileName.split('.').pop()?.toLowerCase()

  const isImage = fileType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'svg'].includes(extension || '')

  return isImage ? false : <FileTextIcon className='size-5' />
}

function FileUpload() {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([])
  const [activeUploads, setActiveUploads] = useState([
    { id: 'demo-1', name: 'hero-image-1.png', size: '2.3MB', progress: 40 },
    { id: 'demo-2', name: 'shadcn-studio-og.png', size: '3.7MB', progress: 80 }
  ] as { id: string; name: string; size: string; progress: number }[])

  const [failedUploads] = useState([{ id: 'demo-1', name: 'hero-image-2.png', size: '12 MB', progress: 10 }] as {
    id: string
    name: string
    size: string
    progress: number
  }[])

  const handleRemoveUpload = (id: string) => {
    setActiveUploads(prev => prev.filter(u => u.id !== id))
  }

  const handleFilesAdded = (addedFiles: FileWithPreview[]) => {
    const newProgressItems = addedFiles.map(file => ({
      fileId: file.id,
      progress: 0,
      completed: false
    }))

    setUploadProgress(prev => [...prev, ...newProgressItems])

    const cleanupFunctions: Array<() => void> = []

    addedFiles.forEach(file => {
      const fileSize = file.file instanceof File ? file.file.size : file.file.size

      const cleanup = simulateUpload(
        fileSize,
        progress => {
          setUploadProgress(prev => prev.map(item => (item.fileId === file.id ? { ...item, progress } : item)))
        },
        () => {
          setUploadProgress(prev => prev.map(item => (item.fileId === file.id ? { ...item, completed: true } : item)))
        }
      )

      cleanupFunctions.push(cleanup)
    })

    return () => {
      cleanupFunctions.forEach(cleanup => cleanup())
    }
  }

  const handleFileRemoved = (fileId: string) => {
    setUploadProgress(prev => prev.filter(item => item.fileId !== fileId))
  }

  const maxSizeMB = 5
  const maxSize = maxSizeMB * 1024 * 1024
  const maxFiles = 6

  const [
    { files, isDragging, errors },
    { handleDragEnter, handleDragLeave, handleDragOver, handleDrop, openFileDialog, removeFile, getInputProps }
  ] = useFileUpload({
    maxSize,
    multiple: true,
    maxFiles,
    onFilesAdded: handleFilesAdded
  })

  return (
    <Card className='w-full max-w-lg'>
      <CardContent className='space-y-4'>
        <div className='flex flex-col gap-4'>
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

          {files.length > 0 && (
            <div className='flex w-full flex-col gap-3'>
              <div className='w-full space-y-2'>
                {files.map(file => {
                  const fileProgress = uploadProgress.find(p => p.fileId === file.id)
                  const isUploading = fileProgress && !fileProgress.completed

                  return (
                    <div
                      key={file.id}
                      data-uploading={isUploading || undefined}
                      className='bg-muted flex flex-col gap-1 rounded-lg p-3 transition-opacity duration-300'
                    >
                      <div className='flex justify-between gap-2'>
                        <div className='flex items-center gap-3 overflow-hidden in-data-[uploading=true]:opacity-50'>
                          <div className='bg-accent aspect-square shrink-0 rounded'>
                            {getFileIcon(file) || (
                              <img
                                src={file.preview}
                                alt={file.file.name}
                                className='size-10 rounded-[inherit] object-cover'
                              />
                            )}
                          </div>
                          <div className='flex min-w-0 flex-col gap-0.5 max-sm:max-w-50'>
                            <p className='truncate font-medium'>
                              {file.file instanceof File ? file.file.name : file.file.name}
                            </p>
                            <p className='text-muted-foreground text-sm'>
                              {formatBytes(file.file instanceof File ? file.file.size : file.file.size)}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant='ghost'
                          className='size-6 hover:bg-transparent'
                          onClick={() => {
                            handleFileRemoved(file.id)
                            removeFile(file.id)
                          }}
                          aria-label='Remove file'
                        >
                          <XIcon aria-hidden='true' />
                        </Button>
                      </div>

                      {fileProgress &&
                        (() => {
                          const progress = fileProgress.progress || 0
                          const completed = fileProgress.completed || false

                          if (completed) return null

                          return (
                            <div className='mt-1 flex flex-col gap-2'>
                              <span className='text-muted-foreground self-end text-sm'>{progress}%</span>
                              <div className='bg-primary/10 h-2 w-full overflow-hidden rounded-full'>
                                <div
                                  className='bg-primary h-full transition-all duration-300 ease-out'
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          )
                        })()}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className='text-destructive flex items-center gap-1 text-xs' role='alert'>
              <AlertCircleIcon className='size-3 shrink-0' />
              <span>{errors[0]}</span>
            </div>
          )}
        </div>

        <h3 className='flex items-center gap-2 text-sm uppercase'>
          <LoaderIcon className='size-4 animate-spin' /> Uploading
        </h3>

        {activeUploads.map(item => (
          <div key={item.id} className='bg-muted flex flex-col gap-2 rounded-lg p-3'>
            <div className='flex items-start justify-between gap-6'>
              <div className='flex items-center gap-2'>
                <FileTextIcon className='size-8' />
                <div className='flex flex-col'>
                  <p className='truncate font-medium'>{item.name}</p>
                  <p className='text-muted-foreground text-xs'>{item.size}</p>
                </div>
              </div>
              <Button variant='ghost' size='icon' aria-label='Cancel' onClick={() => handleRemoveUpload(item.id)}>
                <XIcon className='size-4' />
              </Button>
            </div>
            <div className='w-full space-y-2'>
              <span className='text-muted-foreground flex justify-end text-sm'>{item.progress}%</span>
              <Progress value={item.progress} />
            </div>
          </div>
        ))}

        <Separator className='my-6' />

        <h3 className='flex items-center gap-2 text-sm uppercase'>
          <CircleXIcon className='size-4' /> Failed
        </h3>

        {failedUploads.map(item => (
          <div key={item.id} className='bg-muted flex flex-col gap-2 rounded-lg p-3'>
            <div className='flex items-start justify-between gap-6'>
              <div className='flex items-center gap-2'>
                <FileTextIcon className='size-8' />
                <div className='flex flex-col'>
                  <p className='truncate font-medium'>{item.name}</p>
                  <p className='text-destructive text-xs'>{item.size}</p>
                </div>
              </div>
              <Button variant='ghost' size='icon' aria-label='Cancel'>
                <XIcon className='size-4' />
              </Button>
            </div>
            <div className='w-full space-y-2'>
              <div className='text-destructive flex items-center gap-1 text-sm'>
                <CircleAlertIcon className='size-4' /> The file exceeds the 5 MB size limit.
              </div>
              <div className='bg-destructive/10 h-2 w-full overflow-hidden rounded-full'>
                <div className='bg-destructive h-full transition-all duration-300 ease-out' style={{ width: '60%' }} />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default FileUpload
