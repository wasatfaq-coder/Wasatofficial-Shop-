import React, { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import type { Order, Product, StoredReview, UserProfile } from '../../types';
import { LazyMount } from '../../components/LazyMount';
import { ModalPortal } from '../../components/ModalPortal';
import { ReviewFormModal } from '../../components/lazyWindows';
import { loadReviewFormModal } from '../../customerLoaders';
import { reviewableOrders } from '../../utils/reviewModeration';

interface OrderLineReviewButtonProps {
  order: Order;
  /** The product of the order line as the catalog has it now; none (the product was deleted) — no button */
  product: Product | undefined;
  uid: string;
  /** All the customer's orders: the form offers every received order with this product, this one preselected */
  orders: readonly Order[];
  /** The customer's review of this product, if there is one */
  ownReview: StoredReview | undefined;
  userProfile?: UserProfile;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/**
 * «Оставить отзыв» / «Изменить отзыв» under a line of a received order («История и трекинг заказов»): opens the review
 * form of the product with this order chosen. The form is its own chunk (Base UI), loaded on the first tap or hover and
 * drawn over the order window (a portal: the window has a `transform`).
 */
export const OrderLineReviewButton: React.FC<OrderLineReviewButtonProps> = ({
  order,
  product,
  uid,
  orders,
  ownReview,
  userProfile,
  onShowToast,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  if (!product) return null;
  const label = ownReview ? 'Изменить отзыв' : 'Оставить отзыв';
  const preload = () => void loadReviewFormModal().catch(() => {});

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        onPointerEnter={preload}
        onFocus={preload}
        aria-label={`${label}: ${product.title}`}
        className="mt-1.5 neu-button px-2.5 py-1 rounded-xl text-[11px] font-bold text-accent inline-flex items-center gap-1.5 cursor-pointer"
      >
        <MessageSquarePlus className="w-3.5 h-3.5" aria-hidden="true" />
        {label}
      </button>
      <LazyMount when={isOpen}>
        <ModalPortal>
          <ReviewFormModal
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            product={product}
            myReview={ownReview ? { ...ownReview, fromCollection: true } : undefined}
            orders={reviewableOrders(orders, product.id, uid)}
            initialOrderId={order.id}
            uid={uid}
            userProfile={userProfile}
            onShowToast={onShowToast}
          />
        </ModalPortal>
      </LazyMount>
    </>
  );
};
