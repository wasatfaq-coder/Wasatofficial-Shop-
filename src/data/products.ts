import { UserProfile } from '../types';

export const CATEGORIES = [
  { id: 'all', name: 'Все', icon: 'Sparkles' },
  { id: 'shirts', name: 'Рубашки', icon: 'Shirt' },
  { id: 'tshirts', name: 'Футболки', icon: 'Shirt' },
  { id: 'jackets', name: 'Куртки', icon: 'Overcoat' },
  { id: 'trousers', name: 'Брюки', icon: 'Pants' },
  { id: 'sweatshirts', name: 'Свитшоты', icon: 'Layers' },
];

/**
 * Profile of a visitor who has not filled anything in yet. Must stay free of personal
 * data: it is what every guest sees in the profile and at checkout.
 */
export const GUEST_USER_PROFILE: UserProfile = {
  name: '',
  email: '',
  phone: '',
  avatar: '',
  address: { street: '', city: 'Москва', postalCode: '' },
  savedAddresses: [],
  savedCards: [],
  notificationsEnabled: true,
  bonusPoints: 0,
};


