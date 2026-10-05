import { describe, expect, it } from 'vitest';
import { merchantBrand, merchantKind } from '../src/lib/merchants';
import { BRAND_ICONS } from '../src/lib/brand-icons';
import { demoState } from '../src/lib/demo';
describe('local merchant recognition', () => {
  it('matches well-known brands to bundled logos', () => {
    for (const [name, slug] of [
      ['STARBUCKS STORE #1234', 'starbucks'],
      ['McDonald’s 0921', 'mcdonalds'],
      ['UBER EATS help.uber.com', 'ubereats'],
      ['Uber Trip', 'uber'],
      ['NETFLIX.COM', 'netflix'],
      ['Amex card payment', 'americanexpress'],
      ['Target return', 'target'],
    ])
      expect(merchantBrand(name), name).toBe(slug);
    expect(merchantBrand("Macy's Herald Sq")).toBe('macys');
    for (const plain of ['Corner Café', 'Pharmacy', 'Promotion credit'])
      expect(merchantBrand(plain), plain).toBeNull();
  });
  it('sorts food and everyday places into kinds', () => {
    for (const [name, kind] of [
      ['Corner Café', 'coffee'],
      ['Joe’s Pizza', 'pizza'],
      ['Fresh Market', 'grocery'],
      ['Dinner with friends', 'restaurant'],
      ['Shared dinner reimbursement', 'reimbursement'],
      ['Grubhub order', 'delivery'],
      ['Ramen Noodle Bar', 'asian'],
      ['Metro pass', 'transit'],
      ['Pharmacy', 'pharmacy'],
      ['Apartment rent', 'housing'],
      ['Salary', 'income'],
    ] as const)
      expect(merchantKind(name), name).toBe(kind);
    expect(merchantKind('Desk lamp')).toBeNull();
  });
  it('has artwork for every brand rule and every demo brand', () => {
    for (const t of demoState().transactions) {
      const slug = merchantBrand(t.merchant);
      if (slug) expect(BRAND_ICONS[slug], t.merchant).toBeDefined();
    }
    for (const [, , path] of Object.values(BRAND_ICONS))
      expect(path).toMatch(/^[Mm][\d.\s,-]/);
  });
});
