import type { SVGAttributes } from 'react'

const AwsSvg = (props: SVGAttributes<SVGElement>) => {
  return (
    <svg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg' {...props}>
      <g clipPath='url(#clip0_16479_12099)'>
        <path
          d='M17 12.5C14.7025 13.5889 12.1684 14.084 9.63 13.94C7.20814 13.5324 4.92799 12.5213 3 11'
          stroke='currentColor'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
        <path
          d='M19.5 15C20.407 13.589 20.951 11.677 21 10C19.803 9.227 18.423 9.065 17 9'
          stroke='currentColor'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </g>
      <defs>
        <clipPath id='clip0_16479_12099'>
          <rect width='24' height='24' fill='white' />
        </clipPath>
      </defs>
    </svg>
  )
}

export default AwsSvg
