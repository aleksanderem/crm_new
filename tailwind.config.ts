import type { Config } from "tailwindcss";

/**
 * Enable Tailwind opacity modifiers (e.g. bg-primary/10) for oklch CSS variables.
 * Uses CSS relative color syntax: oklch(from <color> l c h / <alpha>)
 */
function withAlpha(cssVar: string) {
  return ({ opacityValue }: { opacityValue?: string }) => {
    if (opacityValue !== undefined) {
      return `oklch(from var(${cssVar}) l c h / ${opacityValue})`
    }
    return `var(${cssVar})`
  }
}

const config = {
  darkMode: ["selector", "class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		spacing: {
  			'1.25': '0.3125rem',
  			'2.25': '0.5625rem',
  			'2.75': '0.6875rem',
  			'4.25': '1.0625rem',
  			'4.5': '1.125rem',
  			'5.5': '1.375rem',
  			'6.5': '1.625rem',
  			'7.5': '1.875rem',
  			'7.75': '1.9375rem',
  			'8.5': '2.125rem',
  			'9.5': '2.375rem',
  			'10.5': '2.625rem',
  			'12.5': '3.125rem',
  			'13': '3.25rem',
  			'15': '3.75rem',
  			'17': '4.25rem',
  			'18': '4.5rem',
  			'20.5': '5.125rem',
  			'21': '5.25rem',
  			'25': '6.25rem',
  			'28.75': '7.1875rem',
  			'29': '7.25rem',
  			'30': '7.5rem',
  			'31': '7.75rem',
  			'32.5': '8.125rem',
  			'33': '8.25rem',
  			'35': '8.75rem',
  			'37': '9.25rem',
  			'37.5': '9.375rem',
  			'38.5': '9.625rem',
  			'43': '10.75rem',
  			'45': '11.25rem',
  			'47.5': '11.875rem',
  			'50': '12.5rem',
  			'55': '13.75rem',
  			'65': '16.25rem',
  			'65.5': '16.375rem',
  			'70': '17.5rem',
  			'71': '17.75rem',
  			'73': '18.25rem',
  			'75': '18.75rem',
  			'76': '19rem',
  			'83': '20.75rem',
  			'89': '22.25rem',
  			'95': '23.75rem',
  			'100': '25rem',
  			'112': '28rem',
  			'115': '28.75rem',
  			'122': '30.5rem',
  			'145': '36.25rem',
  			'155': '38.75rem',
  			'162.5': '40.625rem',
  			'185': '46.25rem',
  			'188': '47rem',
  			'197.5': '49.375rem',
  		},
  		colors: {
  			border: withAlpha('--border'),
  			input: withAlpha('--input'),
  			ring: withAlpha('--ring'),
  			background: withAlpha('--background'),
  			foreground: withAlpha('--foreground'),
  			primary: {
  				DEFAULT: withAlpha('--primary'),
  				foreground: withAlpha('--primary-foreground')
  			},
  			secondary: {
  				DEFAULT: withAlpha('--secondary'),
  				foreground: withAlpha('--secondary-foreground')
  			},
  			destructive: {
  				DEFAULT: withAlpha('--destructive'),
  				foreground: withAlpha('--destructive-foreground')
  			},
  			muted: {
  				DEFAULT: withAlpha('--muted'),
  				foreground: withAlpha('--muted-foreground')
  			},
  			accent: {
  				DEFAULT: withAlpha('--accent'),
  				foreground: withAlpha('--accent-foreground')
  			},
  			popover: {
  				DEFAULT: withAlpha('--popover'),
  				foreground: withAlpha('--popover-foreground')
  			},
  			card: {
  				DEFAULT: withAlpha('--card'),
  				foreground: withAlpha('--card-foreground')
  			},
  			sidebar: {
  				DEFAULT: withAlpha('--sidebar'),
  				foreground: withAlpha('--sidebar-foreground'),
  				primary: withAlpha('--sidebar-primary'),
  				'primary-foreground': withAlpha('--sidebar-primary-foreground'),
  				accent: withAlpha('--sidebar-accent'),
  				'accent-foreground': withAlpha('--sidebar-accent-foreground'),
  				border: withAlpha('--sidebar-border'),
  				ring: withAlpha('--sidebar-ring')
  			}
  		},
  		boxShadow: {
  			xs: 'var(--shadow-xs)',
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

export default config;
