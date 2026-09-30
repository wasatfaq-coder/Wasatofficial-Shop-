import { useState, useEffect } from 'react';
type Product = { id: string; price: number };
function Card({ product }: { product: Product }) { return <div>{product.id}</div>; }
export function Probe() {
  const [count, setCount] = useState(0);
  setCount('не число');
  const x: string = count.nonexistentMethod();
  const [items] = useState<Product[]>([]);
  items.forEach(p => p.pricee.toFixed());
  useEffect(() => 42, [count]);
  return <Card product={{ id: 'a', price: 1 }} />;
}
