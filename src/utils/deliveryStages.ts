import { Order, DeliveryStage, OrderStatusHistoryStep } from '../types';

/**
 * Checks if order is delivered via Russian Post (Почта России / Почтой России).
 */
export function isRussianPostDelivery(
  deliveryMethodOrOrder?: string | { deliveryMethod?: string; trackingCompany?: string },
  trackingCompanyParam?: string
): boolean {
  if (!deliveryMethodOrOrder) return false;
  let dm = '';
  let tc = trackingCompanyParam || '';
  if (typeof deliveryMethodOrOrder === 'object') {
    dm = deliveryMethodOrOrder.deliveryMethod || '';
    tc = tc || deliveryMethodOrOrder.trackingCompany || '';
  } else {
    dm = deliveryMethodOrOrder;
  }
  const dmLower = dm.toLowerCase().trim();
  const tcLower = tc.toLowerCase().trim();
  return (
    tcLower === 'pochta' ||
    tcLower === 'post' ||
    dmLower.includes('почт') ||
    dmLower.includes('post') ||
    dmLower.includes('отправление 1-го класса')
  );
}

/**
 * Checks if order is pickup from boutique/store.
 */
export function isPickupDelivery(
  deliveryMethodOrOrder?: string | { deliveryMethod?: string; trackingCompany?: string }
): boolean {
  if (!deliveryMethodOrOrder) return false;
  let dm = '';
  if (typeof deliveryMethodOrOrder === 'object') {
    dm = deliveryMethodOrOrder.deliveryMethod || '';
  } else {
    dm = deliveryMethodOrOrder;
  }
  const dmLower = dm.toLowerCase().trim();
  return (
    dmLower.includes('самовывоз') ||
    dmLower.includes('пункт выдачи') ||
    dmLower.includes('бутик') ||
    dmLower.includes('шоурум') ||
    dmLower.includes('pickup')
  );
}

/**
 * Checks if order is delivered via Courier (Курьером до двери, Экспресс день в день, курьерская служба).
 * Explicitly returns FALSE for Russian Post (Почта России) and Pickup (Самовывоз).
 */
export function isCourierDelivery(
  deliveryMethodOrOrder?: string | { deliveryMethod?: string; trackingCompany?: string },
  trackingCompanyParam?: string
): boolean {
  if (!deliveryMethodOrOrder) return false;
  // Russian Post and Boutique Pickup are strictly NOT courier deliveries
  if (isRussianPostDelivery(deliveryMethodOrOrder, trackingCompanyParam)) return false;
  if (isPickupDelivery(deliveryMethodOrOrder)) return false;

  let dm = '';
  let tc = trackingCompanyParam || '';
  if (typeof deliveryMethodOrOrder === 'object') {
    dm = deliveryMethodOrOrder.deliveryMethod || '';
    tc = tc || deliveryMethodOrOrder.trackingCompany || '';
  } else {
    dm = deliveryMethodOrOrder;
  }
  const dmLower = dm.toLowerCase().trim();
  const tcLower = tc.toLowerCase().trim();

  return (
    dmLower.includes('курьер') ||
    dmLower.includes('courier') ||
    dmLower.includes('до двери') ||
    dmLower.includes('экспресс') ||
    dmLower.includes('express') ||
    dmLower.includes('срочн') ||
    dmLower.includes('яндекс') ||
    tcLower.includes('courier') ||
    tcLower.includes('express') ||
    dmLower === '' // default fallback
  );
}

/**
 * Checks if a delivery method belongs to a Transport Company or Postal Service (ТК / Почта).
 * Tracking numbers are ONLY assigned and displayed for Transport Companies (СДЭК, Почта России, Boxberry, DPD, etc.).
 * For Courier service, Pickup (самовывоз), and Express delivery, tracking numbers must NOT be assigned or displayed.
 */
export function isTransportCompanyDelivery(
  deliveryMethodOrOrder?: string | { deliveryMethod?: string; trackingCompany?: string },
  trackingCompanyParam?: string
): boolean {
  if (!deliveryMethodOrOrder) return false;

  let deliveryMethod = '';
  let trackingCompany = trackingCompanyParam || '';

  if (typeof deliveryMethodOrOrder === 'object') {
    deliveryMethod = deliveryMethodOrOrder.deliveryMethod || '';
    trackingCompany = trackingCompany || deliveryMethodOrOrder.trackingCompany || '';
  } else {
    deliveryMethod = deliveryMethodOrOrder;
  }

  const dm = deliveryMethod.toLowerCase().trim();
  const tc = trackingCompany.toLowerCase().trim();

  // Explicit Transport Companies & Postal indicators
  const hasTKCompany =
    ['cdek', 'pochta', 'post', 'boxberry', 'dpd', 'dhl', 'dellin', 'pek'].includes(tc) ||
    dm.includes('сдэк') ||
    dm.includes('cdek') ||
    dm.includes('почта') ||
    dm.includes('почтой') ||
    dm.includes('post') ||
    dm.includes('boxberry') ||
    dm.includes('боксберри') ||
    dm.includes('деловые линии') ||
    dm.includes('пэк') ||
    dm.includes('dpd') ||
    dm.includes('dhl') ||
    dm.includes('сберлогистика') ||
    dm.includes('транспортн') ||
    dm.includes(' тк') ||
    dm.startsWith('тк ');

  if (hasTKCompany) return true;

  // Courier, pickup, express or quick orders are strictly non-TK
  const isNonTK =
    dm.includes('курьер') ||
    dm.includes('courier') ||
    dm.includes('самовывоз') ||
    dm.includes('пункт выдачи') ||
    dm.includes('pickup') ||
    dm.includes('бутик') ||
    dm.includes('шоурум') ||
    dm.includes('экспресс') ||
    dm.includes('express') ||
    dm.includes('срочн') ||
    dm.includes('1 клик') ||
    dm.includes('быстрый заказ');

  if (isNonTK) return false;

  return false;
}

export const supportsTrackingNumber = isTransportCompanyDelivery;

/**
 * Formats a date into a clean Russian timestamp like "21 сент., 17:30"
 */
export function formatDeliveryTimestamp(dateInput?: Date | string): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) {
    return typeof dateInput === 'string' && dateInput.trim() ? dateInput : 'Сегодня';
  }
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ORDER_STATUS_LABELS: Record<Order['status'], string> = {
  accepted: 'Принят',
  assembling: 'Собирается',
  in_transit: 'В пути',
  ready: 'Готов к выдаче',
  delivered: 'Доставлен',
};

/**
 * Generates initial realistic delivery stages for an order based on its current status and data.
 * Guarantees that completed stages strictly match the order's actual lifecycle status.
 */
export function getDefaultDeliveryStages(order: Order): DeliveryStage[] {
  return getSynchronizedDeliveryStages(order);
}

/**
 * Returns strictly synchronized delivery stages for an order based on its status and delivery method.
 * Accurately formats Russian Post («Почта России»), Pickup, Courier, Express and TK stages.
 */
export function getSynchronizedDeliveryStages(
  order: Order,
  overrideStatus?: Order['status']
): DeliveryStage[] {
  const currentStatus = overrideStatus || order.status || 'accepted';
  const existingStages = Array.isArray(order.deliveryStages) && order.deliveryStages.length >= 5
    ? order.deliveryStages
    : [];

  const orderDate = order.date || formatDeliveryTimestamp();
  const isPost = isRussianPostDelivery(order.deliveryMethod, order.trackingCompany);
  const isTK = isTransportCompanyDelivery(order.deliveryMethod, order.trackingCompany);
  const isPickup = isPickupDelivery(order.deliveryMethod);
  const isCourier = isCourierDelivery(order.deliveryMethod, order.trackingCompany);
  const isExpress = (order.deliveryMethod || '').toLowerCase().includes('экспресс') || (order.deliveryMethod || '').toLowerCase().includes('express');
  const hasTrack = isTK && !!order.trackingNumber;

  // Case 1: Order is Cancelled
  if (order.isCancelled) {
    return existingStages.map((stage, idx) => {
      if (idx === 0) {
        return {
          ...stage,
          id: stage.id || 'stage-accepted',
          title: 'Заказ принят и зарегистрирован',
          desc: 'Заявка была создана в интернет-магазине',
          status: 'completed',
          time: stage.time && !stage.time.includes('Ожидает') ? stage.time : orderDate,
        };
      }
      return {
        ...stage,
        status: 'pending',
        time: 'Заказ отменен',
        desc: 'Этап отменен в связи с отменой заказа',
      };
    });
  }

  // Generate Method-Aware Titles & Descriptions
  const getStage3Title = (status: Order['status']) => {
    if (isPost) {
      if (status === 'accepted' || status === 'assembling') {
        return hasTrack ? `Ожидает передачи в Почту России (${order.trackingNumber})` : 'Ожидает передачи в Почту России';
      }
      if (status === 'in_transit') {
        return hasTrack ? `Передан в Почту России (${order.trackingNumber})` : 'Передан в Почту России';
      }
      return 'Посылка принята Почтой России';
    }
    if (isTK) {
      if (status === 'accepted' || status === 'assembling') {
        return hasTrack ? `Ожидает передачи в ТК (${order.trackingNumber})` : 'Ожидает передачи в транспортную компанию';
      }
      return hasTrack ? `Передан в транспортную компанию (${order.trackingNumber})` : 'Передан в транспортную компанию';
    }
    if (isPickup) {
      if (status === 'accepted' || status === 'assembling') {
        return 'Подготовка к отправке в пункт выдачи';
      }
      return 'Перемещен в пункт выдачи';
    }
    if (isExpress) {
      if (status === 'accepted' || status === 'assembling') {
        return 'Ожидает назначения экспресс-курьера';
      }
      return 'Передан экспресс-курьеру';
    }
    // Standard Courier
    if (status === 'accepted' || status === 'assembling') {
      return 'Ожидает передачи курьеру';
    }
    return 'Передан штатному курьеру';
  };

  const getStage3Desc = (status: Order['status']) => {
    if (isPost) {
      if (status === 'accepted' || status === 'assembling') {
        return hasTrack
          ? `Сформирована почтовая накладная ${order.trackingNumber}. Заказ ожидает передачи в отделение Почты России`
          : 'Продавец готовит отправление 1-го класса для Почты России';
      }
      return hasTrack
        ? `Посылка с трек-номером ${order.trackingNumber} зарегистрирована в сортировочном центре Почты России`
        : 'Посылка принята к пересылке Почтой России';
    }
    if (isTK) {
      return hasTrack
        ? `Присвоен трек-номер ${order.trackingNumber} и сформирована накладная ТК`
        : 'Заказ готовится к передаче в транспортную компанию';
    }
    if (isPickup) {
      return 'Заказ перемещается со склада в выбранный пункт выдачи';
    }
    if (isExpress) {
      return 'Срочный заказ передан курьеру для экспресс-доставки';
    }
    return 'Заказ передан курьеру для доставки по адресу';
  };

  const getStage4Title = (status: Order['status']) => {
    if (isPost) {
      if (status === 'ready') return 'Посылка прибыла в почтовое отделение';
      if (status === 'delivered') return 'Посылка поступила в отделение выдачи';
      if (status === 'in_transit') return 'Посылка в пути в почтовое отделение';
      return 'Доставка Почтой России';
    }
    if (isPickup) {
      if (status === 'ready') return 'Ожидает в пункте выдачи';
      if (status === 'delivered') return 'Поступил в пункт выдачи';
      if (status === 'in_transit') return 'В пути в пункт выдачи';
      return 'Доставка в пункт выдачи';
    }
    if (isExpress) {
      if (status === 'ready') return 'Экспресс-курьер прибыл по адресу';
      if (status === 'delivered') return 'Экспресс-курьер доставил заказ';
      return 'Экспресс-курьер доставляет по адресу';
    }
    if (isTK) {
      if (status === 'ready') return 'Посылка в пункте выдачи ТК';
      if (status === 'delivered') return 'Посылка доставлена ТК';
      return 'В пути в город назначения';
    }
    // Courier
    if (status === 'ready') return 'Курьер прибыл по адресу';
    if (status === 'delivered') return 'Курьер доставил заказ';
    return 'Курьер доставляет по адресу';
  };

  const getStage4Desc = (status: Order['status']) => {
    if (isPost) {
      if (status === 'ready') return `Посылка ожидает получения по адресу: ${order.deliveryAddress || 'Почтовое отделение'}`;
      return `Доставка в почтовое отделение по адресу: ${order.deliveryAddress || 'Почтовый индекс'}`;
    }
    if (isPickup) {
      return `Адрес пункта выдачи: ${order.deliveryAddress || 'бутик магазина'}`;
    }
    if (isTK) {
      return `Адрес доставки: ${order.deliveryAddress || 'Город назначения'}`;
    }
    return `Доставка по адресу: ${order.deliveryAddress || 'Адрес клиента'}`;
  };

  const getStage5Title = (status: Order['status']) => {
    if (isPost) {
      if (status === 'delivered') return 'Посылка вручена в отделении Почты России';
      if (status === 'ready') return 'Готов к выдаче в отделении Почты России';
      return 'Получение посылки в отделении Почты России';
    }
    if (isPickup) {
      if (status === 'delivered') return 'Заказ получен в пункте выдачи';
      return 'Получение заказа в пункте выдачи';
    }
    if (status === 'delivered') return 'Заказ успешно вручен клиенту';
    return 'Вручение заказа клиенту';
  };

  const getStage5Desc = (status: Order['status']) => {
    if (isPost) {
      return 'Предъявите паспорт или штрихкод из приложения Почты России для получения';
    }
    if (isPickup) {
      return 'Примерка в комфортных залах бутика, проверка и получение чека';
    }
    return 'Проверка содержимого, примерка и получение чека';
  };

  // Case 2: Order is "accepted" (Заказ принят)
  if (currentStatus === 'accepted') {
    return [
      {
        id: 'stage-accepted',
        title: 'Заказ принят и подтвержден',
        desc: isPost
          ? 'Магазин принял заявку для отправки Почтой России'
          : isPickup
          ? 'Магазин зарезервировал позиции для самовывоза'
          : 'Магазин принял заявку и зарезервировал позиции',
        status: 'completed',
        time: existingStages[0]?.status === 'completed' && existingStages[0]?.time && !existingStages[0]?.time.includes('Ожидает')
          ? existingStages[0].time
          : orderDate,
      },
      {
        id: 'stage-assembled',
        title: 'Скомплектован на складе',
        desc: isPost
          ? 'Товары будут проверены и упакованы по стандарту Почты России'
          : 'Товары будут проверены контроллером качества и упакованы',
        status: 'pending',
        time: 'Ожидает сборки',
      },
      {
        id: 'stage-carrier',
        title: getStage3Title('accepted'),
        desc: getStage3Desc('accepted'),
        status: 'pending',
        time: hasTrack ? 'Трек присвоен' : 'Ожидает передачи',
      },
      {
        id: 'stage-transit',
        title: getStage4Title('accepted'),
        desc: getStage4Desc('accepted'),
        status: 'pending',
        time: 'Ожидает отправки',
      },
      {
        id: 'stage-delivered',
        title: getStage5Title('accepted'),
        desc: getStage5Desc('accepted'),
        status: 'pending',
        time: order.estimatedDelivery || 'Ожидает вручения',
      },
    ];
  }

  // Case 3: Order is "assembling" (Сборка на складе)
  if (currentStatus === 'assembling') {
    return [
      {
        id: 'stage-accepted',
        title: 'Заказ принят и подтвержден',
        desc: isPost
          ? 'Магазин принял заявку для отправки Почтой России'
          : 'Магазин принял заявку и зарезервировал позиции',
        status: 'completed',
        time: existingStages[0]?.time || orderDate,
      },
      {
        id: 'stage-assembled',
        title: 'Скомплектован на складе',
        desc: isPost
          ? 'Сборщик комплектует товары и упаковывает посылку'
          : 'Сборщик комплектует товары согласно заказу',
        status: 'active',
        time: 'В процессе сборки',
      },
      {
        id: 'stage-carrier',
        title: getStage3Title('assembling'),
        desc: getStage3Desc('assembling'),
        status: 'pending',
        time: hasTrack ? 'Трек присвоен' : 'Ожидает передачи',
      },
      {
        id: 'stage-transit',
        title: getStage4Title('assembling'),
        desc: getStage4Desc('assembling'),
        status: 'pending',
        time: 'Ожидает отправки',
      },
      {
        id: 'stage-delivered',
        title: getStage5Title('assembling'),
        desc: getStage5Desc('assembling'),
        status: 'pending',
        time: order.estimatedDelivery || 'Ожидает вручения',
      },
    ];
  }

  // Case 4: Order is "in_transit" (В пути)
  if (currentStatus === 'in_transit') {
    return [
      {
        id: 'stage-accepted',
        title: 'Заказ принят и подтвержден',
        desc: 'Магазин принял заявку и зарезервировал позиции',
        status: 'completed',
        time: existingStages[0]?.time || orderDate,
      },
      {
        id: 'stage-assembled',
        title: 'Скомплектован на складе',
        desc: 'Товары проверены контроллером качества и упакованы',
        status: 'completed',
        time: existingStages[1]?.time && !existingStages[1].time.includes('Ожидает')
          ? existingStages[1].time
          : 'Скомплектован',
      },
      {
        id: 'stage-carrier',
        title: getStage3Title('in_transit'),
        desc: getStage3Desc('in_transit'),
        status: 'completed',
        time: isPost ? 'Принято в отделении связи' : 'Передан в доставку',
      },
      {
        id: 'stage-transit',
        title: getStage4Title('in_transit'),
        desc: getStage4Desc('in_transit'),
        status: 'active',
        time: isPost ? 'В пути в отделение' : isPickup ? 'В пути в пункт' : isExpress ? 'Экспресс в пути' : 'Курьер в пути',
      },
      {
        id: 'stage-delivered',
        title: getStage5Title('in_transit'),
        desc: getStage5Desc('in_transit'),
        status: 'pending',
        time: order.estimatedDelivery || 'Ожидает вручения',
      },
    ];
  }

  // Case 5: Order is "ready" (Готов к выдаче)
  if (currentStatus === 'ready') {
    return [
      {
        id: 'stage-accepted',
        title: 'Заказ принят и подтвержден',
        desc: 'Магазин принял заявку и зарезервировал позиции',
        status: 'completed',
        time: existingStages[0]?.time || orderDate,
      },
      {
        id: 'stage-assembled',
        title: 'Скомплектован на складе',
        desc: 'Товары проверены контроллером качества и упакованы',
        status: 'completed',
        time: existingStages[1]?.time || 'Скомплектован',
      },
      {
        id: 'stage-carrier',
        title: getStage3Title('ready'),
        desc: getStage3Desc('ready'),
        status: 'completed',
        time: isPost ? 'Доставлено в отделение' : isPickup ? 'Поступило в бутик' : 'Доставлено в город',
      },
      {
        id: 'stage-transit',
        title: getStage4Title('ready'),
        desc: getStage4Desc('ready'),
        status: 'completed',
        time: isPost ? 'Прибыло в отделение' : isPickup ? 'Поступил в бутик' : 'Прибыл по адресу',
      },
      {
        id: 'stage-delivered',
        title: getStage5Title('ready'),
        desc: getStage5Desc('ready'),
        status: 'active',
        time: isPost ? 'Ожидает в отделении' : isPickup ? 'Готов к выдаче' : 'Ожидает вручения',
      },
    ];
  }

  // Case 6: Order is "delivered" (Вручен)
  return [
    {
      id: 'stage-accepted',
      title: 'Заказ принят и подтвержден',
      desc: 'Магазин принял заявку и зарезервировал позиции',
      status: 'completed',
      time: existingStages[0]?.time || orderDate,
    },
    {
      id: 'stage-assembled',
      title: 'Скомплектован на складе',
      desc: 'Товары проверены контроллером качества и упакованы',
      status: 'completed',
      time: existingStages[1]?.time && !existingStages[1].time.includes('Ожидает')
        ? existingStages[1].time
        : 'Скомплектован',
    },
    {
      id: 'stage-carrier',
      title: getStage3Title('delivered'),
      desc: getStage3Desc('delivered'),
      status: 'completed',
      time: isPost ? 'Доставлено Почтой' : 'Передан в доставку',
    },
    {
      id: 'stage-transit',
      title: getStage4Title('delivered'),
      desc: getStage4Desc('delivered'),
      status: 'completed',
      time: isPost ? 'Прибыло в отделение' : 'Доставлен',
    },
    {
      id: 'stage-delivered',
      title: getStage5Title('delivered'),
      desc: getStage5Desc('delivered'),
      status: 'completed',
      time: existingStages[4]?.time && !existingStages[4].time.includes('Ожидает')
        ? existingStages[4].time
        : 'Вручено получателю',
    },
  ];
}

/**
 * Generates unified status history steps for an order based on current status and lifecycle fields.
 */
export function getDefaultHistorySteps(order: {
  status?: Order['status'];
  date?: string;
  isCancelled?: boolean;
  cancelledAt?: string;
  cancelReason?: string;
  trackingNumber?: string;
  trackingCompany?: string;
  deliveryMethod?: string;
  estimatedDelivery?: string;
}): OrderStatusHistoryStep[] {
  const status = order.status || 'accepted';
  const orderDate = order.date || 'Сегодня';

  if (order.isCancelled) {
    return [
      {
        title: 'Заказ принят',
        date: orderDate,
        completed: true,
        description: 'Заказ зарегистрирован в магазине',
      },
      {
        title: 'Заказ отменен',
        date: order.cancelledAt || 'Отменен',
        completed: true,
        description: order.cancelReason || 'Заказ отменен. Зарезервированные товары возвращены на склад.',
      },
    ];
  }

  const isDelivered = status === 'delivered';
  const isReady = status === 'ready' || isDelivered;
  const isTransit = status === 'in_transit' || isReady;
  const isAssembling = status === 'assembling' || isTransit;

  const isPost = isRussianPostDelivery(order.deliveryMethod, order.trackingCompany);
  const isTK = isTransportCompanyDelivery(order.deliveryMethod, order.trackingCompany);
  const isPickup = isPickupDelivery(order.deliveryMethod);
  const isCourier = isCourierDelivery(order.deliveryMethod, order.trackingCompany);
  const isExpress = (order.deliveryMethod || '').toLowerCase().includes('экспресс') || (order.deliveryMethod || '').toLowerCase().includes('express');

  const transitTitle = isPost
    ? 'Доставка Почтой России'
    : isPickup
    ? 'Доставка в пункт выдачи'
    : isExpress
    ? 'Срочная экспресс-доставка'
    : isTK
    ? 'Доставка транспортной компанией'
    : 'В пути курьером';

  const transitDesc = isPost
    ? (order.trackingNumber ? `Отправление 1-го класса Почты России (трек ${order.trackingNumber})` : 'Отправление 1-го класса Почты России в отделение')
    : isTK && order.trackingNumber
    ? `Транспортная компания (трек-номер ${order.trackingNumber})`
    : isPickup
    ? 'Самовывоз из бутика магазина'
    : isExpress
    ? 'Срочная доставка экспресс-курьером'
    : 'Курьерская служба магазина';

  const readyTitle = isPost
    ? (isDelivered ? 'Посылка получена в отделении' : 'Прибыло в отделение связи / Готово к выдаче')
    : isPickup
    ? (isDelivered ? 'Заказ получен в бутике' : 'Готов к выдаче в бутике')
    : isTK
    ? (isDelivered ? 'Заказ получен' : 'Готов к выдаче / Доставлен')
    : (isDelivered ? 'Заказ вручен курьером' : 'Курьер прибыл / Вручение');

  return [
    {
      title: 'Заказ принят',
      date: orderDate,
      completed: true,
      description: isPost ? 'Заказ принят для отправки Почтой России' : 'Заказ успешно создан и подтвержден',
    },
    {
      title: 'Собирается на складе',
      date: isAssembling
        ? status === 'assembling'
          ? 'В процессе сборки'
          : 'Скомплектован'
        : 'Ожидает сборки',
      completed: isAssembling,
      description: isPost ? 'Комплектация и надежная упаковка по стандартам Почты' : 'Комплектация и бережная упаковка',
    },
    {
      title: transitTitle,
      date: isTransit
        ? status === 'in_transit'
          ? isPost ? 'В пути в отделение' : isPickup ? 'В пути в пункт' : 'Курьер в пути'
          : isPost ? 'Прибыло в отделение' : isPickup ? 'Доставлен в бутик' : 'Доставлен в город'
        : 'Ожидает передачи',
      completed: isTransit,
      description: transitDesc,
    },
    {
      title: readyTitle,
      date: isDelivered ? 'Вручено получателю' : order.estimatedDelivery || 'Ожидается',
      completed: isDelivered,
      description: isDelivered
        ? (isPost ? 'Посылка успешно получена адресатом в отделении связи' : 'Заказ успешно получен покупателем')
        : isPost
        ? 'Ожидает получения адресатом в отделении Почты России'
        : isPickup
        ? 'Ожидает получения в пункте выдачи'
        : 'Ожидает вручения клиенту курьером',
    },
  ];
}

/**
 * Returns an appropriate estimated delivery text based on the order status
 */
export function getEstimatedDeliveryForStatus(
  status: Order['status'],
  currentEstimate?: string,
  isCancelled?: boolean
): string {
  if (isCancelled) return 'Заказ отменен';
  switch (status) {
    case 'delivered':
      return 'Вручен получателю';
    case 'ready':
      return 'Готов к выдаче сегодня';
    case 'in_transit':
      return 'Ожидается сегодня / завтра';
    case 'assembling':
      return 'Через 1-2 дня';
    case 'accepted':
    default:
      return currentEstimate && !currentEstimate.includes('Вручен') && !currentEstimate.includes('Готов')
        ? currentEstimate
        : 'Через 1-3 дня';
  }
}

/**
 * Updates stage statuses when order main status changes in Admin
 */
export function syncStagesWithOrderStatus(
  currentStages: DeliveryStage[] | undefined,
  order: Order,
  newStatus: Order['status']
): DeliveryStage[] {
  return getSynchronizedDeliveryStages(
    {
      ...order,
      deliveryStages: currentStages,
    },
    newStatus
  );
}
