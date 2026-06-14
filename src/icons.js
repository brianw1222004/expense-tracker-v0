import { HugeiconsIcon } from '@hugeicons/react-native';
import { Text } from 'react-native';

import { Hamburger01Icon } from '@hugeicons/core-free-icons';
import { ShoppingCart01Icon } from '@hugeicons/core-free-icons';
import { TaxiIcon } from '@hugeicons/core-free-icons';
import { ShoppingBag01Icon } from '@hugeicons/core-free-icons';
import { GameController01Icon } from '@hugeicons/core-free-icons';
import { Medicine01Icon } from '@hugeicons/core-free-icons';
import { Invoice01Icon } from '@hugeicons/core-free-icons';
import { SparklesIcon } from '@hugeicons/core-free-icons';

import { ReceiptTextIcon } from '@hugeicons/core-free-icons';
import { GridViewIcon } from '@hugeicons/core-free-icons';
import { UserCircleIcon } from '@hugeicons/core-free-icons';

import { Home01Icon } from '@hugeicons/core-free-icons';
import { Car01Icon } from '@hugeicons/core-free-icons';
import { Airplane01Icon } from '@hugeicons/core-free-icons';
import { BookHeadphonesIcon } from '@hugeicons/core-free-icons';
import { MusicNote01Icon } from '@hugeicons/core-free-icons';
import { LaptopIcon } from '@hugeicons/core-free-icons';
import { SmartPhone01Icon } from '@hugeicons/core-free-icons';
import { TShirtIcon } from '@hugeicons/core-free-icons';
import { BlushBrush01Icon } from '@hugeicons/core-free-icons';
import { GiftIcon } from '@hugeicons/core-free-icons';
import { FootprintsIcon } from '@hugeicons/core-free-icons';
import { Coffee01Icon } from '@hugeicons/core-free-icons';
import { Pizza01Icon } from '@hugeicons/core-free-icons';
import { BottleWineIcon } from '@hugeicons/core-free-icons';
import { Dumbbell01Icon } from '@hugeicons/core-free-icons';
import { GraduationCapIcon } from '@hugeicons/core-free-icons';
import { Baby01Icon } from '@hugeicons/core-free-icons';
import { Briefcase01Icon } from '@hugeicons/core-free-icons';
import { Wrench01Icon } from '@hugeicons/core-free-icons';
import { Building01Icon } from '@hugeicons/core-free-icons';
import { Tv01Icon } from '@hugeicons/core-free-icons';
import { Leaf01Icon } from '@hugeicons/core-free-icons';
import { StarCircleIcon } from '@hugeicons/core-free-icons';

import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { Tick01Icon } from '@hugeicons/core-free-icons';
import { ChevronLeftIcon } from '@hugeicons/core-free-icons';
import { ChevronRightIcon } from '@hugeicons/core-free-icons';
import { CircleDashedIcon } from '@hugeicons/core-free-icons';
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
    return <Text style={[{ fontSize: size }, style]}>{name}</Text>;
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
