// The one harvest listing used in the demo (sample scenario numbers, in pesos).
export const LISTING = {
  crop: "Carrots",
  farmer: "Mang Ramon",
  origin: "Nueva Vizcaya",
  harvestDate: "Nov 20",
  farmerPricePerKg: 45, // what the farmer receives
  transportPerKg: 25, // hauler share
  buyerPricePerKg: 70, // what buyers pay (45 + 25)
  marketPricePerKg: 80,
  middlemanPricePerKg: 20,
  minKg: 150, // one truck trip
} as const;

export type Listing = typeof LISTING;
