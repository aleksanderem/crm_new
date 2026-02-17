import { useId } from 'react'

import { HeartHandshakeIcon, UserRoundIcon } from '@/lib/ez-icons'

import { APIProvider, Map } from '@vis.gl/react-google-maps'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

import { cn } from '@/lib/utils'

const mapStyle = [
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#d0d0d2' }]
  },
  {
    featureType: 'landscape',
    elementType: 'geometry',
    stylers: [{ color: '#f4f4f5' }]
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#f4f4f5' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#18181b' }]
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry',
    stylers: [{ color: '#f4f4f5' }, { lightness: -20 }]
  },
  {
    featureType: 'road.local',
    elementType: 'geometry',
    stylers: [{ color: '#f4f4f5' }, { lightness: -17 }]
  },
  {
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#71717b' }, { visibility: 'on' }, { weight: 0.9 }]
  },
  {
    elementType: 'labels.text.fill',
    stylers: [{ visibility: 'on' }, { color: '#71717b' }]
  },
  {
    featureType: 'poi',
    elementType: 'labels',
    stylers: [{ visibility: 'simplified' }]
  },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#f4f4f5' }, { lightness: -10 }]
  },
  {},
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#f4f4f5' }, { weight: 0.7 }]
  }
] as google.maps.MapTypeStyle[]

const countries = [
  { value: '1', label: 'India', flag: 'https://cdn.shadcnstudio.com/ss-assets/flags/india.png', lat: 22.7, lng: 78.7 },
  { value: '2', label: 'China', flag: 'https://cdn.shadcnstudio.com/ss-assets/flags/china.png', lat: 35.7, lng: 104.1 },
  {
    value: '3',
    label: 'Germany',
    flag: 'https://cdn.shadcnstudio.com/ss-assets/flags/germany.png',
    lat: 51.1657,
    lng: 10.4515
  },
  {
    value: '4',
    label: 'UAE',
    zoom: 5,
    flag: 'https://cdn.shadcnstudio.com/ss-assets/flags/united-arab-emirates.png',
    lat: 24.4539,
    lng: 54.3773
  },
  {
    value: '5',
    label: 'Romania',
    flag: 'https://cdn.shadcnstudio.com/ss-assets/flags/romania.png',
    lat: 45.9432,
    lng: 24.9668
  }
]

const AudienceCard = ({ className }: { className?: string }) => {
  const id = useId()

  return (
    <Card className={cn('gap-4 overflow-hidden pb-0', className)}>
      <CardHeader className='flex flex-col'>
        <div className='flex w-full items-center justify-between gap-2'>
          <CardTitle className='items-centre flex gap-2'>
            <Avatar className='size-8 rounded-md'>
              <AvatarFallback className='bg-muted text-muted-foreground shrink-0 rounded-md'>
                <HeartHandshakeIcon className='size-4' />
              </AvatarFallback>
            </Avatar>

            <span className='text-lg font-semibold'>Audience</span>
          </CardTitle>
          <Button variant='outline' className='h-7 rounded-md px-2 has-[>svg]:px-1.5'>
            Details
          </Button>
        </div>
        <div className='flex items-center gap-2'>
          <span className='text-2xl font-semibold'>12K</span>
          <div className='w-full max-w-25 space-y-2'>
            <Label htmlFor={id} className='sr-only'>
              Options with flag
            </Label>
            <Select defaultValue='1'>
              <SelectTrigger
                id={id}
                className='[&>svg]:stroke-muted-foreground h-7! w-full px-2 py-1 [&>_svg]:size-3.5 [&>span]:flex [&>span]:items-center [&>span]:gap-2 [&>span_svg]:shrink-0'
              >
                <SelectValue placeholder='Select framework' />
              </SelectTrigger>
              <SelectContent className='[&_*[role=option]>span>svg]:text-muted-foreground/80 max-h-100 [&_*[role=option]]:pr-8 [&_*[role=option]]:pl-2 [&_*[role=option]>span]:right-2 [&_*[role=option]>span]:left-auto [&_*[role=option]>span]:flex [&_*[role=option]>span]:items-center [&_*[role=option]>span]:gap-2 [&_*[role=option]>span>svg]:shrink-0'>
                {countries.map(country => (
                  <SelectItem key={country.value} value={country.value}>
                    <img src={country.flag} alt={`${country.label} flag`} className='h-3 w-4' />{' '}
                    <span className='text-primary truncate text-xs'>{country.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex flex-col gap-1'>
          <div className='flex items-center justify-between gap-2 py-2'>
            <div className='text-muted-foreground flex items-center gap-2'>
              <UserRoundIcon className='size-4' />
              <span className='text-sm font-medium'>Male</span>
            </div>
            <div className='flex items-center gap-2 text-sm'>
              <span className='text-muted-foreground'>$12,360</span>
              <span>+43%</span>
            </div>
          </div>
          <div className='flex items-center justify-between gap-2 py-2'>
            <div className='text-muted-foreground flex items-center gap-2'>
              <UserRoundIcon className='size-4' />
              <span className='text-sm font-medium'>Female</span>
            </div>
            <div className='flex items-center gap-2 text-sm'>
              <span className='text-muted-foreground'>$220</span>
              <span>-12%</span>
            </div>
          </div>
        </div>
        <Separator />
      </CardContent>
      <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
        <Map
          style={{ width: '340px', minHeight: '205px' }}
          defaultCenter={{ lat: 22.7, lng: 78.7 }}
          defaultZoom={3}
          mapTypeId={'roadmap'}
          styles={mapStyle}
          gestureHandling={'greedy'}
          disableDefaultUI={true}
        />
      </APIProvider>
    </Card>
  )
}

export default AudienceCard
