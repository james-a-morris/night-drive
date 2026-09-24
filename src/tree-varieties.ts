export type TreeForm =
  | "round"
  | "cactus"
  | "willow"
  | "flower"
  | "blossom"
  | "fern"
  | "succulent"
  | "mushroom"
  | "spiral"
  | "palm";
export interface TreeVariety {
  id: number;
  name: string;
  form: TreeForm;
  leaf: number;
  accent: number;
  bark: number;
  pot: number;
  variant: number;
}
const families: { form: TreeForm; names: string[]; colors: number[] }[] = [
  {
    form: "round",
    names: [
      "Sage oak",
      "Copper beech",
      "Golden elm",
      "Silver birch",
      "Ruby maple",
    ],
    colors: [0x819a67, 0xb27650, 0xc6af59, 0xa8b995, 0xaa5359],
  },
  {
    form: "cactus",
    names: [
      "Saguaro cactus",
      "Golden barrel",
      "Bunny ears",
      "Moon cactus",
      "Star cactus",
    ],
    colors: [0x79a685, 0x91a96a, 0x86af8c, 0x739883, 0x92aa9e],
  },
  {
    form: "willow",
    names: [
      "Jade willow",
      "Golden weeper",
      "Lavender willow",
      "River willow",
      "Rose willow",
    ],
    colors: [0x6b9c79, 0xb7b164, 0xa391b2, 0x82aaa1, 0xb38699],
  },
  {
    form: "flower",
    names: [
      "Moon daisy",
      "Peach tulips",
      "Coral poppies",
      "Little sunflowers",
      "Stargazer lilies",
    ],
    colors: [0xf1e5c9, 0xe0a1b3, 0xdb796d, 0xe3ba57, 0xcba0cf],
  },
  {
    form: "blossom",
    names: [
      "Sakura",
      "Snow magnolia",
      "Coral peach",
      "Lilac jacaranda",
      "Golden laburnum",
    ],
    colors: [0xd9a1b1, 0xe5d9be, 0xdd9b87, 0xa695ce, 0xd8c56b],
  },
  {
    form: "fern",
    names: [
      "Maidenhair fern",
      "Boston fern",
      "Bird’s nest fern",
      "Asparagus fern",
      "Staghorn fern",
    ],
    colors: [0x91af72, 0x78a16d, 0x91b785, 0x9ab982, 0x7faa93],
  },
  {
    form: "succulent",
    names: [
      "Rose echeveria",
      "Blue aloe",
      "Jade plant",
      "Moonstone succulent",
      "Zebra haworthia",
    ],
    colors: [0xaaa3be, 0x8aafaa, 0x789d6c, 0xb7b8c1, 0x699484],
  },
  {
    form: "mushroom",
    names: [
      "Ruby toadstools",
      "Golden chanterelles",
      "Lavender inkcaps",
      "Pearl oyster mushrooms",
      "Honey morels",
    ],
    colors: [0xbf6a61, 0xccac65, 0xa397b6, 0xd1c8b5, 0xad9470],
  },
  {
    form: "spiral",
    names: [
      "Jade corkscrew",
      "Amethyst twist",
      "Golden spiral",
      "Seafoam twist",
      "Garnet corkscrew",
    ],
    colors: [0x79a781, 0xa58ab8, 0xc6b569, 0x91b9ac, 0xab707e],
  },
  {
    form: "palm",
    names: [
      "Lagoon palm",
      "Sunset palm",
      "Moon palm",
      "Fern palm",
      "Peach palm",
    ],
    colors: [0x6aab90, 0xbda366, 0xa2bcb5, 0x749751, 0xc6a17c],
  },
];
export const TREE_VARIETIES: readonly TreeVariety[] = families.flatMap(
  (family, familyIndex) =>
    family.names.map((name, variant) => ({
      id: familyIndex * 5 + variant,
      name,
      form: family.form,
      leaf: family.colors[variant],
      accent:
        family.form === "flower"
          ? variant === 3
            ? 0x76543c
            : 0xe7c779
          : family.form === "mushroom"
            ? 0xeadac0
            : [0xe2cfa0, 0xe6b5ac, 0xf0dba0, 0xc9c0e0, 0xbccc9e][variant],
      bark: ["flower", "fern", "succulent"].includes(family.form)
        ? 0x71885a
        : family.form === "mushroom"
          ? 0xd8c7a7
          : [0x866347, 0x775747, 0x92775a, 0xa29780, 0x6f6253][variant],
      pot: [0xb17957, 0x839b94, 0xbca17a, 0x888798, 0x9b756d][variant],
      variant,
    })),
);
// A full tour of all fifty, alternating silhouettes before repeating.
export const nextTreeVariety = (collected: number) =>
  (collected * 17) % TREE_VARIETIES.length;
export interface CollectedTree {
  id: string;
  variety: number;
}
export interface TreeGarden {
  id: string;
  variety: number;
  seconds: number;
  collection: CollectedTree[];
}

// Hours aboard, in discovery order: exactly 1,000 hours for the first fifty.
export const TREE_GROWTH_HOURS = [
  0.5, 0.5, 0.5, 1.5, 2.0, 2.0, 2.5, 3.5, 3.0, 4.5, 5.5, 5.0, 6.0, 7.0, 6.5,
  8.0, 9.0, 10.5, 10.0, 12.5, 11.5, 14.0, 13.5, 16.0, 18.0, 17.0, 19.5, 21.5,
  18.5, 23.0, 25.0, 22.0, 26.5, 28.5, 26.0, 30.5, 32.0, 29.5, 34.0, 35.5, 33.0,
  37.5, 39.0, 36.5, 41.0, 42.5, 40.0, 44.5, 46.5, 77.0,
] as const;
export const treeDuration = (variety: number) =>
  TREE_GROWTH_HOURS[(variety * 3) % 50] * 3600;
export function treeTimeRemaining(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}

export const gardenComplete = (garden: TreeGarden) =>
  new Set(garden.collection.map((tree) => tree.variety)).size >=
  TREE_VARIETIES.length;
