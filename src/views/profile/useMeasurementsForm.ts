import React, { useState } from 'react';
import { calculateRussianPattern } from '../../utils/russianSizing';
import { UserProfile } from '../../types';
import { useDialogA11y } from '../../utils/useDialogA11y';

import type { ProfileScreenProps } from '../ProfileScreen';

/** The form of body measurements: the sliders' values, the live Russian pattern (ГОСТ) and saving to the profile */
export function useMeasurementsForm(
  profile: UserProfile,
  onUpdateProfile: ProfileScreenProps['onUpdateProfile'],
  onShowToast: ProfileScreenProps['onShowToast']
) {
  // Body measurements modal state
  const [isEditingMeasurements, setIsEditingMeasurements] = useState(false);
  const measurementsDialog = useDialogA11y(isEditingMeasurements, () => setIsEditingMeasurements(false));
  const [showGostTable, setShowGostTable] = useState(false);
  const [measHeight, setMeasHeight] = useState(profile.bodyMeasurements?.height ?? 184);
  const [measWeight, setMeasWeight] = useState(profile.bodyMeasurements?.weight ?? 94);
  const [measChest, setMeasChest] = useState(profile.bodyMeasurements?.chest ?? 104);
  const [measWaist, setMeasWaist] = useState(profile.bodyMeasurements?.waist ?? 95);
  const [measHips, setMeasHips] = useState(profile.bodyMeasurements?.hips ?? 98);
  const [measFit, setMeasFit] = useState<'tight' | 'regular' | 'loose'>(
    profile.bodyMeasurements?.fitPreference ?? 'regular'
  );

  // Synchronize state when profile measurements change
  React.useEffect(() => {
    if (profile.bodyMeasurements) {
      if (profile.bodyMeasurements.height !== undefined) setMeasHeight(profile.bodyMeasurements.height);
      if (profile.bodyMeasurements.weight !== undefined) setMeasWeight(profile.bodyMeasurements.weight);
      if (profile.bodyMeasurements.chest !== undefined) setMeasChest(profile.bodyMeasurements.chest);
      if (profile.bodyMeasurements.waist !== undefined) setMeasWaist(profile.bodyMeasurements.waist);
      if (profile.bodyMeasurements.hips !== undefined) setMeasHips(profile.bodyMeasurements.hips);
      if (profile.bodyMeasurements.fitPreference !== undefined) setMeasFit(profile.bodyMeasurements.fitPreference);
    }
  }, [profile.bodyMeasurements]);

  // Dynamic real-time calculation of Russian sizing pattern (ГОСТ 31399-2009)
  const currentRussianPattern = calculateRussianPattern(
    measHeight,
    measWeight,
    measChest,
    measWaist,
    measHips,
    measFit
  );

  const handleSaveMeasurements = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({
      ...profile,
      bodyMeasurements: {
        height: measHeight,
        weight: measWeight,
        chest: measChest,
        waist: measWaist,
        hips: measHips,
        fitPreference: measFit,
        preferredSize: currentRussianPattern.topInternationalSize,
        russianSizeTop: currentRussianPattern.topSizeLabel,
        russianSizeBottom: currentRussianPattern.bottomSizeLabel,
        heightGroup: currentRussianPattern.heightGroupLabel,
        bodyType: currentRussianPattern.fullnessLabel,
      },
    });
    setIsEditingMeasurements(false);
    onShowToast(`Параметры сохранены: ${currentRussianPattern.topSizeLabel}, ${currentRussianPattern.heightRange}`, 'success');
  };

  return {
    isEditingMeasurements,
    setIsEditingMeasurements,
    measurementsDialog,
    showGostTable,
    setShowGostTable,
    measHeight,
    setMeasHeight,
    measWeight,
    setMeasWeight,
    measChest,
    setMeasChest,
    measWaist,
    setMeasWaist,
    measHips,
    setMeasHips,
    measFit,
    setMeasFit,
    currentRussianPattern,
    handleSaveMeasurements,
  };
}

export type MeasurementsForm = ReturnType<typeof useMeasurementsForm>;
