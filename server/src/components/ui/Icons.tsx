import React from 'react';
import { WardenIcon, WardenIconName } from './WardenIcon';

// Universal wrapper converting legacy Tabler Icon props to Modrinth SVG icons
interface LegacyIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const createModrinthIcon = (iconName: WardenIconName) => {
  const Component: React.FC<LegacyIconProps> = ({ size = 16, className = '', style }) => (
    <WardenIcon name={iconName} size={size} className={className} style={style} />
  );
  Component.displayName = `ModrinthIcon(${iconName})`;
  return Component;
};

export const IconSearch = createModrinthIcon('search');
export const IconDownload = createModrinthIcon('download');
export const IconTrash = createModrinthIcon('trash');
export const IconBox = createModrinthIcon('box');
export const IconPackage = createModrinthIcon('box');
export const IconCheck = createModrinthIcon('check');
export const IconAlertTriangle = createModrinthIcon('triangle-alert');
export const IconAlertOctagon = createModrinthIcon('triangle-alert');
export const IconCpu = createModrinthIcon('cpu');
export const IconServer = createModrinthIcon('server');
export const IconUsers = createModrinthIcon('users');
export const IconClock = createModrinthIcon('clock');
export const IconPlay = createModrinthIcon('play');
export const IconPlayerPlay = createModrinthIcon('play');
export const IconPower = createModrinthIcon('power');
export const IconRefresh = createModrinthIcon('refresh-cw');
export const IconSettings = createModrinthIcon('settings');
export const IconHistory = createModrinthIcon('clock');
export const IconShieldCheck = createModrinthIcon('check');
export const IconKey = createModrinthIcon('binary');
export const IconChevronDown = createModrinthIcon('chevron-down');
export const IconChevronUp = createModrinthIcon('chevron-down');
export const IconDashboard = createModrinthIcon('box');
export const IconLayoutDashboard = createModrinthIcon('box');
export const IconFolder = createModrinthIcon('folder');
export const IconFileText = createModrinthIcon('code');
export const IconTerminal = createModrinthIcon('terminal-square');
export const IconEdit = createModrinthIcon('edit');
export const IconSave = createModrinthIcon('save');
export const IconDeviceFloppy = createModrinthIcon('save');
export const IconX = createModrinthIcon('x');
export const IconArrowBack = createModrinthIcon('arrow-left');
export const IconChevronLeft = createModrinthIcon('arrow-left');
export const IconRestart = createModrinthIcon('rotate-clockwise');
export const IconRotateClockwise = createModrinthIcon('rotate-clockwise');
export const IconStop = createModrinthIcon('power');
export const IconPlayerStop = createModrinthIcon('power');
export const IconBolt = createModrinthIcon('refresh-cw');
export const IconGitBranch = createModrinthIcon('code');
export const IconPlus = createModrinthIcon('plus');
export const IconCode = createModrinthIcon('code');
export const IconCalendarTime = createModrinthIcon('clock');
export const IconAdjustmentsHorizontal = createModrinthIcon('settings');
export const IconListCheck = createModrinthIcon('check');
export const IconHeart = createModrinthIcon('box');
export const IconWorld = createModrinthIcon('box');
export const IconTag = createModrinthIcon('box');
export const IconFilter = createModrinthIcon('settings');
