import { useEffect, useState } from 'react';
import type { PaymentTemplate } from '../../types';
import { subscribeToPaymentTemplates } from '../../utils/firebaseSync';

/** Requisites templates (`payment_templates`, admin only); null — not loaded yet */
export function usePaymentTemplates(): PaymentTemplate[] | null {
  const [templates, setTemplates] = useState<PaymentTemplate[] | null>(null);
  useEffect(() => subscribeToPaymentTemplates(setTemplates), []);
  return templates;
}
