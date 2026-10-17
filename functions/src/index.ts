import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import appConfig from '../../firebase-applet-config.json';
import { FUNCTIONS_REGION, type PlaceOrderResponse } from '../../src/shared/orderApi';
import { OrderError, parsePlaceOrderRequest, placeOrderCore } from './placeOrder';

setGlobalOptions({ region: FUNCTIONS_REGION, maxInstances: 10 });

initializeApp();
// The app uses a named Firestore database (not "(default)")
const db = getFirestore(appConfig.firestoreDatabaseId);

export const placeOrder = onCall(async (request): Promise<PlaceOrderResponse> => {
  try {
    const orderRequest = parsePlaceOrderRequest(request.data);
    const uid = request.auth?.uid ?? null;
    const signInProvider = (request.auth?.token as { firebase?: { sign_in_provider?: string } } | undefined)?.firebase?.sign_in_provider;
    const signedInWithGoogle = Boolean(uid && signInProvider !== 'anonymous');
    const order = await placeOrderCore(db, orderRequest, uid, new Date(), signedInWithGoogle);
    logger.info('Order placed', { orderId: order.id, total: order.totalPrice, uid });
    return { order };
  } catch (err) {
    if (err instanceof OrderError) {
      throw new HttpsError(err.code, err.message);
    }
    logger.error('placeOrder failed', err);
    throw new HttpsError('internal', 'Не удалось оформить заказ. Попробуйте ещё раз.');
  }
});
