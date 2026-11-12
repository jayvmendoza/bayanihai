// Harvest listings and the (sample) market reference prices the AI uses to suggest fair prices.

export type CropKey = "carrots" | "cabbage" | "tomatoes" | "potatoes";

export type CropInfo = {
  key: CropKey;
  name: string; // shown in the app (Tagalog where common)
  marketPricePerKg: number; // typical retail price in city markets (sample)
  middlemanPricePerKg: number; // typical farmgate price a middleman pays (sample)
};

// Sample reference prices for the demo. Replace with real PSA / DA price data when available.
export const CROPS: Record<CropKey, CropInfo> = {
  carrots: { key: "carrots", name: "Carrots", marketPricePerKg: 80, middlemanPricePerKg: 20 },
  cabbage: { key: "cabbage", name: "Repolyo", marketPricePerKg: 70, middlemanPricePerKg: 15 },
  tomatoes: { key: "tomatoes", name: "Kamatis", marketPricePerKg: 60, middlemanPricePerKg: 18 },
  potatoes: { key: "potatoes", name: "Patatas", marketPricePerKg: 85, middlemanPricePerKg: 25 },
};

export const TRANSPORT_PER_KG = 25; // one shared truck trip, split per kg

export type Listing = {
  crop: CropKey;
  cropName: string;
  farmer: string;
  origin: string;
  harvestDate: string;
  farmerPricePerKg: number; // what the farmer receives
  transportPerKg: number; // hauler share
  buyerPricePerKg: number; // what buyers pay (farmer + transport)
  marketPricePerKg: number;
  middlemanPricePerKg: number;
  minKg: number; // the harvest size = one truck trip
  priceSource: "gemini" | "rules";
  priceReason: string; // why this price (Tagalog, shown to the farmer)
};

export const DEFAULT_LISTING: Listing = {
  crop: "carrots",
  cropName: "Carrots",
  farmer: "Mang Ramon",
  origin: "Nueva Vizcaya",
  harvestDate: "Nov 20",
  farmerPricePerKg: 45,
  transportPerKg: TRANSPORT_PER_KG,
  buyerPricePerKg: 70,
  marketPricePerKg: 80,
  middlemanPricePerKg: 20,
  minKg: 150,
  priceSource: "rules",
  priceReason: "Mas mababa sa presyo sa palengke para sa mamimili, at mahigit doble sa bayad ng middleman para sa magsasaka.",
};
