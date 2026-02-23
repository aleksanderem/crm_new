import type { SVGAttributes } from 'react'

const VueSvg = (props: SVGAttributes<SVGElement>) => {
  return (
    <svg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg' {...props}>
      <path
        d='M18.5 4L12 14L5.5 4M15 4L12 8.5L9 4H2L12 20L22 4H15Z'
        stroke='currentColor'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}

export default VueSvg
