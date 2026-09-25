import { DeliveryMethod, PickupPoint } from '../types';

// Delivery methods and pickup points are configured in Admin → «Доставка и ПВЗ» (Firestore).
// These helpers only cache the loaded lists in the browser.

export function loadLocalDeliveryMethods(): DeliveryMethod[] {
  try {
    const saved = localStorage.getItem('manstyle_delivery_methods');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Error reading delivery methods from localStorage:', e);
  }
  // No demo fallback: the list comes from Firestore (settings in Admin → «Доставка и ПВЗ»)
  return [];
}

export function saveLocalDeliveryMethods(methods: DeliveryMethod[]) {
  try {
    localStorage.setItem('manstyle_delivery_methods', JSON.stringify(methods));
  } catch (e) {
    console.warn('Error saving delivery methods to localStorage:', e);
  }
}

export function loadLocalPickupPoints(): PickupPoint[] {
  try {
    const saved = localStorage.getItem('manstyle_pickup_points');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Error reading pickup points from localStorage:', e);
  }
  return [];
}

export function saveLocalPickupPoints(points: PickupPoint[]) {
  try {
    localStorage.setItem('manstyle_pickup_points', JSON.stringify(points));
  } catch (e) {
    console.warn('Error saving pickup points to localStorage:', e);
  }
}
