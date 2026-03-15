/** Format price with Uzbek so'm: no trailing .00, space as thousands separator */
export function formatPrice(price: number): string {
  const isWhole = Number.isInteger(price) || price === Math.round(price);
  const numStr = isWhole
    ? Math.round(price).toString()
    : parseFloat(price.toFixed(10)).toString();
  const [intPart, decPart] = numStr.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const result = decPart ? `${formattedInt}.${decPart}` : formattedInt;
  return `${result} so'm`;
}
