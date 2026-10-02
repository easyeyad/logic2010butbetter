import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Variant = 'default' | 'primary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm';
  icon?: IconName;
  iconRight?: IconName;
  /** Icon-only button: children are ignored visually; `label` is required. */
  iconOnly?: boolean;
  label?: string;
  block?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', icon, iconRight, iconOnly, label, block, className, children, type = 'button', ...rest },
  ref,
) {
  const cls = [
    'btn',
    variant !== 'default' && `btn--${variant}`,
    size === 'sm' && 'btn--sm',
    iconOnly && 'btn--icon',
    block && 'btn--block',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      ref={ref}
      type={type}
      className={cls}
      aria-label={iconOnly ? label : rest['aria-label']}
      title={iconOnly ? label : rest.title}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {!iconOnly && children}
      {iconRight && <Icon name={iconRight} />}
    </button>
  );
});
