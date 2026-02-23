import type { SVGAttributes } from 'react'

const AngularSvg = (props: SVGAttributes<SVGElement>) => {
  return (
    <svg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg' {...props}>
      <path
        fillRule='evenodd'
        clipRule='evenodd'
        d='M5.42781 17.245L11.5038 20.716C11.8112 20.8915 12.1884 20.8915 12.4958 20.716L18.5718 17.245C18.842 17.0906 19.025 16.8193 19.0668 16.511L20.3898 6.80696C20.4538 6.33706 20.179 5.8868 19.7318 5.72896L12.3318 3.11696C12.1166 3.04109 11.882 3.04109 11.6668 3.11696L4.26781 5.72996C3.8206 5.8878 3.54577 6.33806 3.60981 6.80796L4.93281 16.512C4.97462 16.8203 5.15759 17.0916 5.42781 17.246V17.245Z'
        stroke='currentColor'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path d='M9 15L12 7L15 15' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' />
      <path d='M10 13H14' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  )
}

export default AngularSvg
