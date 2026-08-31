import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  children,
  className = '',
  variant = 'primary',
  type = 'button',
  ...props
}: PropsWithChildren<ButtonProps>) {
  return (
    <button className={`button button--${variant} ${className}`.trim()} type={type} {...props}>
      {children}
    </button>
  );
}
