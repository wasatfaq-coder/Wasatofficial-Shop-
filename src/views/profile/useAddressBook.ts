import React, { useState } from 'react';
import { UserProfile, SavedAddress } from '../../types';
import { useDialogA11y } from '../../utils/useDialogA11y';

import type { ProfileScreenProps } from '../ProfileScreen';

/**
 * Saved addresses of the profile: the add / edit form (its fields, validation, «Основной»), deleting and choosing the
 * main address. Everything is written through `onUpdateProfile`.
 */
export function useAddressBook(
  profile: UserProfile,
  onUpdateProfile: ProfileScreenProps['onUpdateProfile'],
  onShowToast: ProfileScreenProps['onShowToast']
) {
  const [addressToDelete, setAddressToDelete] = useState<string | null>(null);

  // Address edit modal state
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null);
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const addressFormDialog = useDialogA11y(isAddingAddress, () => setIsAddingAddress(false));
  const [addrTitle, setAddrTitle] = useState('Дом');
  const [addrCity, setAddrCity] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrHouse, setAddrHouse] = useState('');
  const [addrEntrance, setAddrEntrance] = useState('');
  const [addrFloor, setAddrFloor] = useState('');
  const [addrApartment, setAddrApartment] = useState('');
  const [addrIntercom, setAddrIntercom] = useState('');
  const [addrPostal, setAddrPostal] = useState('');
  const [addrRegion, setAddrRegion] = useState('');
  const [addrComment, setAddrComment] = useState('');
  const [addrIsDefault, setAddrIsDefault] = useState(false);

  // --- Address Handlers ---
  const handleOpenAddAddress = () => {
    setEditingAddress(null);
    setAddrTitle('Дом');
    setAddrCity('');
    setAddrStreet('');
    setAddrHouse('');
    setAddrEntrance('');
    setAddrFloor('');
    setAddrApartment('');
    setAddrIntercom('');
    setAddrPostal('');
    setAddrRegion('');
    setAddrComment('');
    setAddrIsDefault(profile.savedAddresses.length === 0);
    setIsAddingAddress(true);
  };

  const handleOpenEditAddress = (addr: SavedAddress) => {
    setEditingAddress(addr);
    setAddrTitle(addr.title);
    setAddrCity(addr.city);
    setAddrStreet(addr.street);
    setAddrHouse(addr.house || '');
    setAddrEntrance(addr.entrance || '');
    setAddrFloor(addr.floor || '');
    setAddrApartment(addr.apartment || '');
    setAddrIntercom(addr.intercom || '');
    setAddrPostal(addr.postalCode || '');
    setAddrRegion(addr.region || '');
    setAddrComment(addr.comment || '');
    setAddrIsDefault(addr.isDefault || false);
    setIsAddingAddress(true);
  };

  const handleSaveAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addrStreet.trim()) {
      onShowToast('Укажите название улицы', 'error');
      return;
    }
    if (!addrHouse.trim() && !/\b(д\.|дом|\d)/i.test(addrStreet)) {
      onShowToast('Пожалуйста, укажите номер дома', 'error');
      return;
    }

    let updatedAddresses = [...profile.savedAddresses];

    if (editingAddress) {
      // Edit
      updatedAddresses = updatedAddresses.map((a) => {
        if (a.id === editingAddress.id) {
          return {
            ...a,
            title: addrTitle.trim() || 'Адрес',
            city: addrCity.trim(),
            street: addrStreet.trim(),
            house: addrHouse.trim(),
            entrance: addrEntrance.trim(),
            floor: addrFloor.trim(),
            apartment: addrApartment.trim(),
            intercom: addrIntercom.trim(),
            postalCode: addrPostal.trim(),
            region: addrRegion.trim(),
            comment: addrComment.trim(),
            isDefault: addrIsDefault,
          };
        }
        return addrIsDefault ? { ...a, isDefault: false } : a;
      });
    } else {
      // New
      const newAddr: SavedAddress = {
        id: `addr-${Date.now()}`,
        title: addrTitle.trim() || 'Адрес',
        city: addrCity.trim(),
        street: addrStreet.trim(),
        house: addrHouse.trim(),
        entrance: addrEntrance.trim(),
        floor: addrFloor.trim(),
        apartment: addrApartment.trim(),
        intercom: addrIntercom.trim(),
        postalCode: addrPostal.trim(),
        region: addrRegion.trim(),
        comment: addrComment.trim(),
        isDefault: addrIsDefault || updatedAddresses.length === 0,
      };
      if (addrIsDefault) {
        updatedAddresses = updatedAddresses.map((a) => ({ ...a, isDefault: false }));
      }
      updatedAddresses.push(newAddr);
    }

    onUpdateProfile({ ...profile, savedAddresses: updatedAddresses });
    setIsAddingAddress(false);
    onShowToast(editingAddress ? 'Адрес изменен' : 'Адрес успешно добавлен', 'success');
  };

  const handleDeleteAddress = (id: string) => {
    const updated = profile.savedAddresses.filter((a) => a.id !== id);
    onUpdateProfile({ ...profile, savedAddresses: updated });
    onShowToast('Адрес удален', 'info');
  };

  const handleSetDefaultAddress = (id: string) => {
    const updated = profile.savedAddresses.map((a) => ({
      ...a,
      isDefault: a.id === id,
    }));
    onUpdateProfile({ ...profile, savedAddresses: updated });
    onShowToast('Основной адрес сохранен', 'success');
  };

  return {
    addressToDelete,
    setAddressToDelete,
    editingAddress,
    setEditingAddress,
    isAddingAddress,
    setIsAddingAddress,
    addressFormDialog,
    addrTitle,
    setAddrTitle,
    addrCity,
    setAddrCity,
    addrStreet,
    setAddrStreet,
    addrHouse,
    setAddrHouse,
    addrEntrance,
    setAddrEntrance,
    addrFloor,
    setAddrFloor,
    addrApartment,
    setAddrApartment,
    addrIntercom,
    setAddrIntercom,
    addrPostal,
    setAddrPostal,
    addrRegion,
    setAddrRegion,
    addrComment,
    setAddrComment,
    addrIsDefault,
    setAddrIsDefault,
    handleOpenAddAddress,
    handleOpenEditAddress,
    handleSaveAddress,
    handleDeleteAddress,
    handleSetDefaultAddress,
  };
}

export type AddressBook = ReturnType<typeof useAddressBook>;
