import { UserProfile } from '../types';

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


