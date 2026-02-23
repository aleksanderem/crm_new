import type { SVGAttributes } from 'react'

const HtmlSvg = (props: SVGAttributes<SVGElement>) => {
  return (
    <svg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg' {...props}>
      <path
        fillRule='evenodd'
        clipRule='evenodd'
        d='M20 4L18 18.5L12 20.5L6 18.5L4 4H20Z'
        stroke='currentColor'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path
        d='M15.5 8H8.5L9 12H15L14.5 15.5L12 16.25L9.5 15.5L9.4 15'
        stroke='currentColor'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}

export default HtmlSvg
