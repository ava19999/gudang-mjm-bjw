// FILE: src/utils/dashboardHelpers.ts
import { StockHistory } from '../types';
import { Store } from 'lucide-react';

export const formatRupiah = (num: number) => 
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num || 0);

export const formatCompactNumber = (num: number, isCurrency = true) => { 
  const n = num || 0; 
  if (n >= 1000000000) return (n / 1000000000).toFixed(1) + 'M'; 
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'jt'; 
  return isCurrency ? formatRupiah(n) : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n); 
};

export const getItemCardStyle = (qty: number) => {
  if (qty === 0) return "bg-red-900/30 border-red-800 hover:border-red-600";
  if (qty < 4) return "bg-yellow-500/10 border-yellow-500 hover:border-yellow-400";
  return "bg-gray-800 border-gray-700 hover:border-gray-600";
};

export const parseHistoryReason = (h: StockHistory) => { 
  let resi = h.resi || '-';
  let ecommerce = '-'; 
  let customer = '-'; 
  let text = h.reason || ''; 
  let tempo = h.tempo || '-'; 

  const resiMatch = text.match(/\(Resi: (.*?)\)/); 
  if (resiMatch && resiMatch[1]) { 
      resi = resiMatch[1]; 
      text = text.replace(/\s*\(Resi:.*?\)/, ''); 
  } 
  const viaMatch = text.match(/\(Via: (.*?)\)/); 
  if (viaMatch && viaMatch[1]) { 
      ecommerce = viaMatch[1]; 
      text = text.replace(/\s*\(Via:.*?\)/, ''); 
  } 
  text = text.replace(/\s*\(\-\)/, '').replace(/\s*\(\)/, '').trim();

  let keterangan = '';
  let isRetur = false;

  if (h.customer && h.customer !== '-' && h.customer !== '') {
     customer = h.customer;
  }

  if (h.type === 'out') {
      if (customer === '-' && text) {
         customer = text.replace(/\s*\(.*?\)/g, '').trim();
      }
      keterangan = 'Terjual';
  } else {
      if (text.toLowerCase().includes('retur') || text.toLowerCase().includes('cancel')) {
          isRetur = true;
          keterangan = 'RETUR';
          if (customer === '-') {
               let tempName = text.replace(/\s*\(RETUR\)/i, '').replace(/\s*\(CANCEL\)/i, '');
               customer = tempName.replace(/\s*\(.*?\)/g, '').trim();
          }
      } else {
          const standardTexts = ['Manual Restock', 'Restock', 'Stok Awal', 'System Log', 'Opname', 'Adjustment'];
          const isStandard = standardTexts.some(st => st.toLowerCase() === text.toLowerCase());

          if (isStandard || text === '') {
              keterangan = (text === '' || text === 'Manual Restock') ? 'Restock' : text; 
          } else {
              if (customer === '-') customer = text;
              keterangan = 'Restock';
          }
      }
  }

  let subInfo = '-';
  if (tempo && tempo.includes('/')) {
      const parts = tempo.split('/');
      if (parts.length >= 2) {
          resi = parts[0].trim();
          subInfo = parts[1].trim();
      } else {
          const hasTempo = tempo && tempo !== '-' && tempo !== '' && tempo !== 'AUTO' && tempo !== 'APP';
          if (hasTempo) subInfo = tempo;
      }
  } else {
      const hasTempo = tempo && tempo !== '-' && tempo !== '' && tempo !== 'AUTO' && tempo !== 'APP';
      if (hasTempo) {
          subInfo = tempo;
      } else {
          if (ecommerce !== '-' && ecommerce !== 'Lainnya' && ecommerce !== 'APP' && ecommerce !== 'SYSTEM') {
              subInfo = ecommerce;
          }
      }
  }

  return { resi, subInfo, customer, keterangan, ecommerce, isRetur }; 
};