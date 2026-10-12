import { createContext, useContext } from 'react';
import type { Order } from '../types';

/**
 * The signed-in customer's own orders (`App` state), for the review form: a review is written for a received order
 * with the product (`reviewableOrders`). A context, so the product page and the section of reviews need no prop passed
 * through every screen between; empty outside the provider.
 */
export const ReviewOrdersContext = createContext<readonly Order[]>([]);

export const useReviewOrders = () => useContext(ReviewOrdersContext);
