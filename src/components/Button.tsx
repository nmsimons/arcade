import { type ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'success' | 'danger' | 'warning'
  fullWidth?: boolean
}

const variantStyles = {
  primary: 'bg-blue-600 hover:bg-blue-700',
  success: 'bg-green-600 hover:bg-green-700',
  danger: 'bg-red-600 hover:bg-red-700',
  warning: 'bg-purple-600 hover:bg-purple-700',
}

export function Button({ 
  variant = 'primary', 
  fullWidth = false,
  className = '',
  disabled,
  children,
  ...props 
}: ButtonProps) {
  return (
    <button
      className={`
        px-4 py-2 
        text-white font-medium rounded 
        transition-colors
        disabled:bg-gray-600 disabled:cursor-not-allowed
        ${variantStyles[variant]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
