export const normalizeLicensePlate = (value: string): string => {
  return value.replace(/\s+/g, '').toUpperCase().slice(0, 8);
};
