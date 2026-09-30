import { useState } from 'react';
import type { Product } from '../../../../../../../home/user/Wasatofficial-Shop-/src/types';
function Card({ product, onBuy }: { product: Product; onBuy: (id: string) => void }) { return <div>{product.name}</div>; }
export function Probe() {
  const [count, setCount] = useState<number>(0);
  setCount('не число');
  const x: string = count.nonexistentMethod();
  return <Card product={42} onBuy={(n: number) => n} wrongProp />;
}
