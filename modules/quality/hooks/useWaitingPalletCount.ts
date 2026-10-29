import { useEffect, useState } from 'react';
import { qualityPalletService } from '../services/qualityPalletService';

export function useWaitingPalletCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => qualityPalletService.subscribeWaitingCount(setCount), []);
  return count;
}
