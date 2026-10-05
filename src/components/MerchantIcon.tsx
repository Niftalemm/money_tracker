'use client';
import {
  ArrowLeftRight,
  Banknote,
  Beer,
  Bike,
  Car,
  Coffee,
  Croissant,
  Dumbbell,
  Fuel,
  HandCoins,
  House,
  IceCreamCone,
  PawPrint,
  Pill,
  Pizza,
  Plane,
  Salad,
  Sandwich,
  Shirt,
  ShoppingCart,
  Soup,
  SquareParking,
  Stethoscope,
  Store,
  Hotel,
  TramFront,
  Tv,
  Undo2,
  UtensilsCrossed,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { BRAND_ICONS } from '@/lib/brand-icons';
import {
  merchantBrand,
  merchantKind,
  type MerchantKind,
} from '@/lib/merchants';
import { CategoryIcon } from './ui';
const KIND_ICONS: Record<MerchantKind, LucideIcon> = {
  coffee: Coffee,
  bakery: Croissant,
  dessert: IceCreamCone,
  pizza: Pizza,
  fastfood: Sandwich,
  asian: Soup,
  healthy: Salad,
  bar: Beer,
  delivery: Bike,
  grocery: ShoppingCart,
  restaurant: UtensilsCrossed,
  convenience: Store,
  rideshare: Car,
  transit: TramFront,
  fuel: Fuel,
  parking: SquareParking,
  pharmacy: Pill,
  medical: Stethoscope,
  housing: House,
  internet: Wifi,
  power: Zap,
  streaming: Tv,
  gym: Dumbbell,
  travel: Plane,
  hotel: Hotel,
  clothing: Shirt,
  pets: PawPrint,
  income: Banknote,
  reimbursement: HandCoins,
  cardpayment: ArrowLeftRight,
  return: Undo2,
};
// Very light brand colors (e.g. a yellow mark) sit on a dark tile to stay visible.
function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 170;
}
export function BrandGlyph({
  slug,
  size = 18,
}: {
  slug: string;
  size?: number;
}) {
  const [, color, path] = BRAND_ICONS[slug];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path d={path} fill={color} />
    </svg>
  );
}
export default function MerchantIcon({
  name,
  category,
}: {
  name: string;
  category: string;
}) {
  const brand = merchantBrand(name);
  if (brand && BRAND_ICONS[brand]) {
    const dark = isLight(BRAND_ICONS[brand][1]);
    return (
      <span
        className={dark ? 'merchant-icon brand dark' : 'merchant-icon brand'}
        title={BRAND_ICONS[brand][0]}
        aria-hidden
      >
        <BrandGlyph slug={brand} />
      </span>
    );
  }
  const kind = merchantKind(name);
  if (kind) {
    const Icon = KIND_ICONS[kind];
    return (
      <span className="merchant-icon" aria-hidden>
        <Icon size={18} strokeWidth={1.75} />
      </span>
    );
  }
  return (
    <span className="merchant-icon" aria-hidden>
      <CategoryIcon name={category} bare />
    </span>
  );
}
