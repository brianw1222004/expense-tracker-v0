import { HugeiconsIcon } from '@hugeicons/react-native';

import {
  Hamburger01Icon, ShoppingCart01Icon, TaxiIcon, ShoppingBag01Icon,
  GameController01Icon, Medicine01Icon, Invoice01Icon, SparklesIcon,
  ReceiptTextIcon, GridViewIcon, UserCircleIcon,
  Home01Icon, Car01Icon, Airplane01Icon, BookHeadphonesIcon, MusicNote01Icon,
  LaptopIcon, SmartPhone01Icon, TShirtIcon, BlushBrush01Icon, GiftIcon,
  FootprintsIcon, Coffee01Icon, Pizza01Icon, BottleWineIcon, Dumbbell01Icon,
  GraduationCapIcon, Baby01Icon, Briefcase01Icon, Wrench01Icon, Building01Icon,
  Tv01Icon, Leaf01Icon, StarCircleIcon,
  Cancel01Icon, Tick01Icon, ChevronLeftIcon, ChevronRightIcon, CircleDashedIcon,
} from '@hugeicons/core-free-icons';
const REGISTRY = {
  'hamburger-01': Hamburger01Icon,
  'shopping-cart-01': ShoppingCart01Icon,
  'taxi': TaxiIcon,
  'shopping-bag-01': ShoppingBag01Icon,
  'game-controller-01': GameController01Icon,
  'medicine-01': Medicine01Icon,
  'invoice-01': Invoice01Icon,
  'sparkles': SparklesIcon,

  'receipt-text': ReceiptTextIcon,
  'grid-view': GridViewIcon,
  'user-circle': UserCircleIcon,

  'home-01': Home01Icon,
  'car-01': Car01Icon,
  'airplane-01': Airplane01Icon,
  'book-headphones': BookHeadphonesIcon,
  'music-note-01': MusicNote01Icon,
  'laptop': LaptopIcon,
  'smart-phone-01': SmartPhone01Icon,
  't-shirt': TShirtIcon,
  'blush-brush-01': BlushBrush01Icon,
  'gift': GiftIcon,
  'footprints': FootprintsIcon,
  'coffee-01': Coffee01Icon,
  'pizza-01': Pizza01Icon,
  'bottle-wine': BottleWineIcon,
  'dumbbell-01': Dumbbell01Icon,
  'graduation-cap': GraduationCapIcon,
  'baby-01': Baby01Icon,
  'briefcase-01': Briefcase01Icon,
  'wrench-01': Wrench01Icon,
  'building-01': Building01Icon,
  'tv-01': Tv01Icon,
  'leaf-01': Leaf01Icon,
  'star-circle': StarCircleIcon,

  'cancel-01': Cancel01Icon,
  'tick-01': Tick01Icon,
  'chevron-left': ChevronLeftIcon,
  'chevron-right': ChevronRightIcon,
  'circle-dashed': CircleDashedIcon,
};

export function HIcon({ name, size = 24, color = '#000', strokeWidth = 1.5, style }) {
  const icon = REGISTRY[name];
  if (!icon) {
    return (
      <HugeiconsIcon
        icon={GridViewIcon}
        size={size}
        color={color}
        strokeWidth={strokeWidth}
        style={style}
      />
    );
  }
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      style={style}
    />
  );
}
