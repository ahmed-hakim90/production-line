import { BarChart3, Boxes, Factory, Hammer, Users, type LucideIcon } from 'lucide-react';

const AUTH_ICON_MAP: Record<string, LucideIcon> = {
  factory: Factory,
  precision_manufacturing: Hammer,
  inventory_2: Boxes,
  groups: Users,
  bar_chart: BarChart3,
};

export function renderAuthIcon(name: string, className?: string, size = 20) {
  const Icon = AUTH_ICON_MAP[name] ?? Factory;
  return <Icon size={size} className={className} />;
}
