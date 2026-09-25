export const TRAIN_OPTIONS = [
  { id: "classic", name: "Night Rail", description: "Warm wood, linen & sage seats" },
  { id: "metro", name: "Metro", description: "Cool steel, blue seats & city rail" },
  { id: "steam", name: "Steam Express", description: "Velvet, lanterns & a steam engine" },
] as const;

export type TrainType = (typeof TRAIN_OPTIONS)[number]["id"];

export function isTrainType(value: unknown): value is TrainType {
  return TRAIN_OPTIONS.some(option => option.id === value);
}

export const TRAIN_PALETTES = {
  classic: {
    upholstery: 0xa29377, ceiling: 0xb7aa8c, seat: 0x819583,
    wood: 0xe4d2b3, desk: 0xffffff, panel: 0x59665a, brass: 0xb49b68,
    pocket: 0x927252, linen: 0xd2c5a6, piping: 0xac9b75,
    carpet: 0x536052, runner: 0x8b9277, light: 0xffd2a0,
    exterior: 0x456055, roof: 0xb4b4a0, trim: 0xa79262, end: 0x34483e,
  },
  metro: {
    upholstery: 0xc3cece, ceiling: 0xcfd8d8, seat: 0x43829b,
    wood: 0x9eaeb2, desk: 0xbac9ca, panel: 0x98aeb4, brass: 0xc5d6dc,
    pocket: 0x4c6977, linen: 0xa8c2ce, piping: 0x87a7b4,
    carpet: 0x475a65, runner: 0x7798a3, light: 0xd8edff,
    exterior: 0xc3d2d5, roof: 0x87999e, trim: 0x368da5, end: 0x718990,
  },
  steam: {
    upholstery: 0x795843, ceiling: 0x997e5b, seat: 0x8e514e,
    wood: 0xcfa77d, desk: 0xe7c59c, panel: 0x684833, brass: 0xc7a267,
    pocket: 0xa8784e, linen: 0xe1c795, piping: 0xc6a36c,
    carpet: 0x744747, runner: 0xb09a72, light: 0xffc482,
    exterior: 0x673c38, roof: 0x3e4340, trim: 0xc1a16a, end: 0x443b31,
  },
} satisfies Record<TrainType, Record<string, number>>;
