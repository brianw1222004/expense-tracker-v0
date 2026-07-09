import { HugeiconsIcon } from '@hugeicons/react-native';

// Deep per-icon imports (one file each) so Metro bundles only the icons we use
// instead of the whole 6000-icon barrel. The path is redirected to the ESM data
// file by the scoped resolver in metro.config.js — see that file for why.
import Hamburger01Icon from '@hugeicons/core-free-icons/Hamburger01Icon';
import ShoppingCart01Icon from '@hugeicons/core-free-icons/ShoppingCart01Icon';
import TaxiIcon from '@hugeicons/core-free-icons/TaxiIcon';
import ShoppingBag01Icon from '@hugeicons/core-free-icons/ShoppingBag01Icon';
import GameController01Icon from '@hugeicons/core-free-icons/GameController01Icon';
import Medicine01Icon from '@hugeicons/core-free-icons/Medicine01Icon';
import Invoice01Icon from '@hugeicons/core-free-icons/Invoice01Icon';
import SparklesIcon from '@hugeicons/core-free-icons/SparklesIcon';
import ReceiptTextIcon from '@hugeicons/core-free-icons/ReceiptTextIcon';
import GridViewIcon from '@hugeicons/core-free-icons/GridViewIcon';
import UserCircleIcon from '@hugeicons/core-free-icons/UserCircleIcon';
import Wallet01Icon from '@hugeicons/core-free-icons/Wallet01Icon';
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import Car01Icon from '@hugeicons/core-free-icons/Car01Icon';
import Airplane01Icon from '@hugeicons/core-free-icons/Airplane01Icon';
import BookHeadphonesIcon from '@hugeicons/core-free-icons/BookHeadphonesIcon';
import MusicNote01Icon from '@hugeicons/core-free-icons/MusicNote01Icon';
import LaptopIcon from '@hugeicons/core-free-icons/LaptopIcon';
import SmartPhone01Icon from '@hugeicons/core-free-icons/SmartPhone01Icon';
import TShirtIcon from '@hugeicons/core-free-icons/TShirtIcon';
import BlushBrush01Icon from '@hugeicons/core-free-icons/BlushBrush01Icon';
import GiftIcon from '@hugeicons/core-free-icons/GiftIcon';
import FootprintsIcon from '@hugeicons/core-free-icons/FootprintsIcon';
import Coffee01Icon from '@hugeicons/core-free-icons/Coffee01Icon';
import Pizza01Icon from '@hugeicons/core-free-icons/Pizza01Icon';
import BottleWineIcon from '@hugeicons/core-free-icons/BottleWineIcon';
import Dumbbell01Icon from '@hugeicons/core-free-icons/Dumbbell01Icon';
import GraduationCapIcon from '@hugeicons/core-free-icons/GraduationCapIcon';
import Baby01Icon from '@hugeicons/core-free-icons/Baby01Icon';
import Briefcase01Icon from '@hugeicons/core-free-icons/Briefcase01Icon';
import Wrench01Icon from '@hugeicons/core-free-icons/Wrench01Icon';
import Building01Icon from '@hugeicons/core-free-icons/Building01Icon';
import Tv01Icon from '@hugeicons/core-free-icons/Tv01Icon';
import Leaf01Icon from '@hugeicons/core-free-icons/Leaf01Icon';
import StarCircleIcon from '@hugeicons/core-free-icons/StarCircleIcon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import Tick01Icon from '@hugeicons/core-free-icons/Tick01Icon';
import ChevronLeftIcon from '@hugeicons/core-free-icons/ChevronLeftIcon';
import ChevronRightIcon from '@hugeicons/core-free-icons/ChevronRightIcon';
import CircleDashedIcon from '@hugeicons/core-free-icons/CircleDashedIcon';
import CircleUnlock01Icon from '@hugeicons/core-free-icons/CircleUnlock01Icon';
import Settings01Icon from '@hugeicons/core-free-icons/Settings01Icon';
import LockIcon from '@hugeicons/core-free-icons/LockIcon';
import Calendar01Icon from '@hugeicons/core-free-icons/Calendar01Icon';
import UserGroupIcon from '@hugeicons/core-free-icons/UserGroupIcon';
import PlusSignIcon from '@hugeicons/core-free-icons/PlusSignIcon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import Analytics01Icon from '@hugeicons/core-free-icons/Analytics01Icon';
// Payment-method icons (for split-bill payment methods, mirroring categories).
import Cash01Icon from '@hugeicons/core-free-icons/Cash01Icon';
import CreditCardIcon from '@hugeicons/core-free-icons/CreditCardIcon';
import BankIcon from '@hugeicons/core-free-icons/BankIcon';
import Coins01Icon from '@hugeicons/core-free-icons/Coins01Icon';
import MoneyBag01Icon from '@hugeicons/core-free-icons/MoneyBag01Icon';
import BanknoteIcon from '@hugeicons/core-free-icons/BanknoteIcon';
import DollarCircleIcon from '@hugeicons/core-free-icons/DollarCircleIcon';
import QrCodeIcon from '@hugeicons/core-free-icons/QrCodeIcon';
import MoneySend01Icon from '@hugeicons/core-free-icons/MoneySend01Icon';
import MoneyReceive01Icon from '@hugeicons/core-free-icons/MoneyReceive01Icon';
// Group-avatar icons (minimal glyphs for split-bill groups, mirroring categories).
import UserMultipleIcon from '@hugeicons/core-free-icons/UserMultipleIcon';
import FavouriteIcon from '@hugeicons/core-free-icons/FavouriteIcon';
import Beach02Icon from '@hugeicons/core-free-icons/Beach02Icon';
import MountainIcon from '@hugeicons/core-free-icons/MountainIcon';
import Restaurant01Icon from '@hugeicons/core-free-icons/Restaurant01Icon';
import BirthdayCakeIcon from '@hugeicons/core-free-icons/BirthdayCakeIcon';
import FootballIcon from '@hugeicons/core-free-icons/FootballIcon';
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
  'wallet-01': Wallet01Icon,

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
  'circle-unlock-01': CircleUnlock01Icon,
  'settings-01': Settings01Icon,
  'lock': LockIcon,
  'calendar-01': Calendar01Icon,
  'user-group': UserGroupIcon,
  'plus-sign': PlusSignIcon,
  'search-01': Search01Icon,
  'analytics-01': Analytics01Icon,

  'cash-01': Cash01Icon,
  'credit-card': CreditCardIcon,
  'bank': BankIcon,
  'coins-01': Coins01Icon,
  'money-bag-01': MoneyBag01Icon,
  'banknote': BanknoteIcon,
  'dollar-circle': DollarCircleIcon,
  'qr-code': QrCodeIcon,
  'money-send-01': MoneySend01Icon,
  'money-receive-01': MoneyReceive01Icon,

  'user-multiple': UserMultipleIcon,
  'favourite': FavouriteIcon,
  'beach-02': Beach02Icon,
  'mountain': MountainIcon,
  'restaurant-01': Restaurant01Icon,
  'birthday-cake': BirthdayCakeIcon,
  'football': FootballIcon,
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
