/**
 * The Jobs page's hand-drawn icon set — one bespoke SVG per concept, drawn
 * by the icon agents (2026-11-13) under a shared family contract: 24×24
 * viewBox, generous margin, legible from 12px to 36px. STROKED icons draw
 * with `color` at `strokeWidth` (round caps/joins); the all-FILL icons
 * (Plus, Users) bake their ink weight into the geometry — they accept
 * `strokeWidth` only for the shared prop shape and ignore its value, so
 * passing a tuned value there is a no-op, not a style control. They
 * replace the lucide icons this feature used.
 */
export type IconComponent = (props: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) => React.ReactElement;

export { BellIcon } from './BellIcon';
export { CalendarClockIcon } from './CalendarClockIcon';
export { CheckIcon } from './CheckIcon';
export { ChevronRightIcon } from './ChevronRightIcon';
export { CircleAlertIcon } from './CircleAlertIcon';
export { CircleCheckIcon } from './CircleCheckIcon';
export { CircleXIcon } from './CircleXIcon';
export { ClipboardListIcon } from './ClipboardListIcon';
export { ClockIcon } from './ClockIcon';
export { LightbulbIcon } from './LightbulbIcon';
export { PlusIcon } from './PlusIcon';
export { UsersIcon } from './UsersIcon';
export { WrenchIcon } from './WrenchIcon';
