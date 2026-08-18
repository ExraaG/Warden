import React from 'react';
import { clsx } from 'clsx';

export type WardenIconName =
  | 'box'
  | 'folder'
  | 'code'
  | 'settings'
  | 'search'
  | 'refresh-cw'
  | 'download'
  | 'upload'
  | 'trash'
  | 'check'
  | 'play'
  | 'plus'
  | 'triangle-alert'
  | 'cpu'
  | 'server'
  | 'users'
  | 'clock'
  | 'arrow-left'
  | 'power'
  | 'rotate-clockwise'
  | 'chevron-down'
  | 'edit'
  | 'x'
  | 'terminal-square'
  | 'binary'
  | 'save'
  | 'brush';

export interface WardenIconProps {
  name: WardenIconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  title?: string;
}

export const WardenIcon: React.FC<WardenIconProps> = ({
  name,
  size = 16,
  className,
  style,
  onClick,
  title,
}) => {
  return (
    <div
      title={title}
      onClick={onClick}
      className={clsx(
        'inline-block shrink-0 align-middle transition-colors',
        onClick && 'cursor-pointer',
        className
      )}
      style={{
        width: size,
        height: size,
        mask: `url(/icons/${name}.svg) no-repeat center / contain`,
        WebkitMask: `url(/icons/${name}.svg) no-repeat center / contain`,
        backgroundColor: 'currentColor',
        ...style,
      }}
    />
  );
};
