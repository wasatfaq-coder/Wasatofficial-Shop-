import React, { useState, useEffect, useRef } from 'react';
import { Home, Grid, ShoppingBag, Heart, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ActiveTab } from '../types';

interface BottomNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  favoritesCount: number;
  cartCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  favoritesCount,
  cartCount = 0,
}) => {
  // Cart micro-animation triggers
  const [cartAnimationCount, setCartAnimationCount] = useState<number>(0);
  const [cartPlusBadge, setCartPlusBadge] = useState<{ id: number; text: string } | null>(null);
  const prevCartCountRef = useRef<number>(cartCount);
  const isInitialMount = useRef<boolean>(true);

  // Favorites micro-animation trigger
  const [favAnimationCount, setFavAnimationCount] = useState<number>(0);
  const prevFavCountRef = useRef<number>(favoritesCount);

  // Trigger animation on cartCount increase
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevCartCountRef.current = cartCount;
      prevFavCountRef.current = favoritesCount;
      return;
    }

    if (cartCount > prevCartCountRef.current) {
      const diff = cartCount - prevCartCountRef.current;
      setCartAnimationCount((c) => c + 1);
      const badgeId = Date.now();
      setCartPlusBadge({ id: badgeId, text: `+${diff}` });
      const timer = setTimeout(() => {
        setCartPlusBadge((current) => (current?.id === badgeId ? null : current));
      }, 1000);
      prevCartCountRef.current = cartCount;
      return () => clearTimeout(timer);
    } else {
      prevCartCountRef.current = cartCount;
    }
  }, [cartCount]);

  // Trigger animation on favoritesCount increase
  useEffect(() => {
    if (favoritesCount > prevFavCountRef.current) {
      setFavAnimationCount((c) => c + 1);
    }
    prevFavCountRef.current = favoritesCount;
  }, [favoritesCount]);

  const tabs = [
    { id: 'home' as ActiveTab, label: 'Главная', icon: Home },
    { id: 'catalog' as ActiveTab, label: 'Каталог', icon: Grid },
    { id: 'cart' as ActiveTab, label: 'Корзина', icon: ShoppingBag, badge: cartCount, isCart: true },
    { id: 'favorites' as ActiveTab, label: 'Избранное', icon: Heart, badge: favoritesCount, isFav: true },
    { id: 'profile' as ActiveTab, label: 'Профиль', icon: User },
  ];

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 w-full max-w-md md:max-w-lg z-40 px-3 pointer-events-none">
      <nav className="pointer-events-auto max-w-sm mx-auto neu-flat rounded-[26px] p-1.5 flex items-center justify-between gap-1 bg-[#E3E8EF] border border-white/70">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            activeTab === tab.id ||
            (tab.id === 'home' && (activeTab === 'product-detail' || activeTab === 'checkout' || activeTab === 'order-success'));

          const isCartTab = tab.isCart;
          const isFavTab = tab.isFav;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 h-11 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-colors duration-200 select-none ${
                isActive
                  ? 'text-[#4B59BB] font-bold'
                  : 'text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95'
              }`}
              title={tab.label}
              aria-label={tab.label}
            >
              {isActive && (
                <motion.div
                  layoutId="bottomNavPill"
                  className="absolute inset-0 rounded-2xl neu-pill-active z-0"
                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                />
              )}

              {/* Ripple Ring Effect for Cart */}
              {isCartTab && (
                <AnimatePresence>
                  {cartAnimationCount > 0 && (
                    <motion.div
                      key={`cart-ripple-${cartAnimationCount}`}
                      initial={{ scale: 0.6, opacity: 0.8 }}
                      animate={{ scale: 2, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="absolute inset-2 rounded-2xl bg-[#5F6ED0]/25 pointer-events-none z-0"
                    />
                  )}
                </AnimatePresence>
              )}

              {/* Floating +1 Indicator for Cart */}
              {isCartTab && (
                <AnimatePresence>
                  {cartPlusBadge && (
                    <motion.span
                      key={`cart-plus-${cartPlusBadge.id}`}
                      initial={{ opacity: 0, y: 2, scale: 0.6 }}
                      animate={{
                        opacity: [0, 1, 1, 0],
                        y: [-2, -18, -26, -32],
                        scale: [0.6, 1.25, 1.1, 0.9],
                      }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.9, times: [0, 0.2, 0.7, 1], ease: 'easeOut' }}
                      className="absolute -top-1 left-1/2 -translate-x-1/2 z-30 bg-[#5F6ED0] text-white text-[11px] font-black px-1.5 py-0.5 rounded-full shadow-[var(--neu-fill-accent-shadow)] pointer-events-none ring-1 ring-white/80"
                    >
                      {cartPlusBadge.text}
                    </motion.span>
                  )}
                </AnimatePresence>
              )}

              <div className="relative z-10 flex flex-col items-center justify-center">
                {/* Icon with micro-animation */}
                {isCartTab ? (
                  <motion.div
                    key={`cart-icon-anim-${cartAnimationCount}`}
                    animate={
                      cartAnimationCount > 0
                        ? {
                            scale: [1, 1.38, 0.86, 1.2, 0.95, 1],
                            rotate: [0, -12, 12, -6, 4, 0],
                            y: [0, -3, 2, -1, 0],
                          }
                        : {}
                    }
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  >
                    <Icon
                      className={`w-5 h-5 transition-colors duration-200 ${
                        isActive ? 'stroke-[2.2] text-[#4B59BB] scale-105' : 'stroke-[1.8]'
                      }`}
                    />
                  </motion.div>
                ) : isFavTab ? (
                  <motion.div
                    key={`fav-icon-anim-${favAnimationCount}`}
                    animate={
                      favAnimationCount > 0
                        ? {
                            scale: [1, 1.4, 0.85, 1.2, 1],
                          }
                        : {}
                    }
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  >
                    <Icon
                      className={`w-5 h-5 transition-colors duration-200 ${
                        isActive ? 'stroke-[2.2] text-[#4B59BB] scale-105' : 'stroke-[1.8]'
                      }`}
                    />
                  </motion.div>
                ) : (
                  <Icon
                    className={`w-5 h-5 transition-transform duration-200 ${
                      isActive ? 'stroke-[2.2] text-[#4B59BB] scale-105' : 'stroke-[1.8]'
                    }`}
                  />
                )}

                {isActive && (
                  <motion.div
                    layoutId="bottomNavDot"
                    className="w-1.5 h-1.5 rounded-full bg-[#5F6ED0] mt-0.5"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
              </div>

              {/* Badge with micro-animation pop */}
              {tab.badge !== undefined && tab.badge > 0 && (
                <motion.span
                  key={`badge-${tab.id}-${tab.badge}`}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: [0.4, 1.3, 0.9, 1.05, 1], opacity: 1 }}
                  transition={{ duration: 0.35, ease: 'backOut' }}
                  className="absolute -top-1 -right-1 z-20 bg-[#5F6ED0] text-white font-bold text-[11px] min-w-[17px] h-[17px] px-1 rounded-full flex items-center justify-center ring-2 ring-[#E3E8EF] shadow-sm shadow-[#5F6ED0]/30"
                >
                  {tab.badge > 99 ? '99+' : tab.badge}
                </motion.span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};


