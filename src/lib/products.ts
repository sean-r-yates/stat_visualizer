export const FAMILY_ORDER = [
  "GALAXY_SOUNDS",
  "SLEEP_POD",
  "OXYGEN_SHAKE",
  "TRANSLATOR",
  "SNACKPACK",
  "PANEL",
  "ROBOT",
  "PEBBLES",
  "MICROCHIP",
  "UV_VISOR",
] as const;

export type FamilyKey = (typeof FAMILY_ORDER)[number];

export type ProductKey =
  | "GALAXY_SOUNDS_BLACK_HOLES"
  | "GALAXY_SOUNDS_DARK_MATTER"
  | "GALAXY_SOUNDS_PLANETARY_RINGS"
  | "GALAXY_SOUNDS_SOLAR_FLAMES"
  | "GALAXY_SOUNDS_SOLAR_WINDS"
  | "SLEEP_POD_COTTON"
  | "SLEEP_POD_LAMB_WOOL"
  | "SLEEP_POD_NYLON"
  | "SLEEP_POD_POLYESTER"
  | "SLEEP_POD_SUEDE"
  | "OXYGEN_SHAKE_CHOCOLATE"
  | "OXYGEN_SHAKE_EVENING_BREATH"
  | "OXYGEN_SHAKE_GARLIC"
  | "OXYGEN_SHAKE_MINT"
  | "OXYGEN_SHAKE_MORNING_BREATH"
  | "TRANSLATOR_ASTRO_BLACK"
  | "TRANSLATOR_ECLIPSE_CHARCOAL"
  | "TRANSLATOR_GRAPHITE_MIST"
  | "TRANSLATOR_SPACE_GRAY"
  | "TRANSLATOR_VOID_BLUE"
  | "SNACKPACK_CHOCOLATE"
  | "SNACKPACK_PISTACHIO"
  | "SNACKPACK_RASPBERRY"
  | "SNACKPACK_STRAWBERRY"
  | "SNACKPACK_VANILLA"
  | "PANEL_1X2"
  | "PANEL_1X4"
  | "PANEL_2X2"
  | "PANEL_2X4"
  | "PANEL_4X4"
  | "ROBOT_DISHES"
  | "ROBOT_IRONING"
  | "ROBOT_LAUNDRY"
  | "ROBOT_MOPPING"
  | "ROBOT_VACUUMING"
  | "PEBBLES_L"
  | "PEBBLES_M"
  | "PEBBLES_S"
  | "PEBBLES_XL"
  | "PEBBLES_XS"
  | "MICROCHIP_CIRCLE"
  | "MICROCHIP_OVAL"
  | "MICROCHIP_RECTANGLE"
  | "MICROCHIP_SQUARE"
  | "MICROCHIP_TRIANGLE"
  | "UV_VISOR_AMBER"
  | "UV_VISOR_MAGENTA"
  | "UV_VISOR_ORANGE"
  | "UV_VISOR_RED"
  | "UV_VISOR_YELLOW";

export type FamilyDefinition = {
  key: FamilyKey;
  title: string;
  color: string;
  products: ProductKey[];
};

export const FAMILIES: FamilyDefinition[] = [
  {
    key: "GALAXY_SOUNDS",
    title: "Galaxy Sounds",
    color: "#2f79ff",
    products: [
      "GALAXY_SOUNDS_BLACK_HOLES",
      "GALAXY_SOUNDS_DARK_MATTER",
      "GALAXY_SOUNDS_PLANETARY_RINGS",
      "GALAXY_SOUNDS_SOLAR_FLAMES",
      "GALAXY_SOUNDS_SOLAR_WINDS",
    ],
  },
  {
    key: "SLEEP_POD",
    title: "Vertical Sleeping Pods",
    color: "#b9adcf",
    products: [
      "SLEEP_POD_COTTON",
      "SLEEP_POD_LAMB_WOOL",
      "SLEEP_POD_NYLON",
      "SLEEP_POD_POLYESTER",
      "SLEEP_POD_SUEDE",
    ],
  },
  {
    key: "OXYGEN_SHAKE",
    title: "Liquid Breath Oxygen Shakes",
    color: "#56b4e9",
    products: [
      "OXYGEN_SHAKE_CHOCOLATE",
      "OXYGEN_SHAKE_EVENING_BREATH",
      "OXYGEN_SHAKE_GARLIC",
      "OXYGEN_SHAKE_MINT",
      "OXYGEN_SHAKE_MORNING_BREATH",
    ],
  },
  {
    key: "TRANSLATOR",
    title: "Instant Translators",
    color: "#14b8a6",
    products: [
      "TRANSLATOR_ASTRO_BLACK",
      "TRANSLATOR_ECLIPSE_CHARCOAL",
      "TRANSLATOR_GRAPHITE_MIST",
      "TRANSLATOR_SPACE_GRAY",
      "TRANSLATOR_VOID_BLUE",
    ],
  },
  {
    key: "SNACKPACK",
    title: "Protein Snack Packs",
    color: "#f47c20",
    products: [
      "SNACKPACK_CHOCOLATE",
      "SNACKPACK_PISTACHIO",
      "SNACKPACK_RASPBERRY",
      "SNACKPACK_STRAWBERRY",
      "SNACKPACK_VANILLA",
    ],
  },
  {
    key: "PANEL",
    title: "Construction Panels",
    color: "#7a8699",
    products: ["PANEL_1X2", "PANEL_1X4", "PANEL_2X2", "PANEL_2X4", "PANEL_4X4"],
  },
  {
    key: "ROBOT",
    title: "Domestic Robots",
    color: "#b6bbc4",
    products: [
      "ROBOT_DISHES",
      "ROBOT_IRONING",
      "ROBOT_LAUNDRY",
      "ROBOT_MOPPING",
      "ROBOT_VACUUMING",
    ],
  },
  {
    key: "PEBBLES",
    title: "Purification Pebbles",
    color: "#b98d68",
    products: ["PEBBLES_L", "PEBBLES_M", "PEBBLES_S", "PEBBLES_XL", "PEBBLES_XS"],
  },
  {
    key: "MICROCHIP",
    title: "Organic Microchips",
    color: "#4caf50",
    products: [
      "MICROCHIP_CIRCLE",
      "MICROCHIP_OVAL",
      "MICROCHIP_RECTANGLE",
      "MICROCHIP_SQUARE",
      "MICROCHIP_TRIANGLE",
    ],
  },
  {
    key: "UV_VISOR",
    title: "UV-Visors",
    color: "#8b5cf6",
    products: [
      "UV_VISOR_AMBER",
      "UV_VISOR_MAGENTA",
      "UV_VISOR_ORANGE",
      "UV_VISOR_RED",
      "UV_VISOR_YELLOW",
    ],
  },
];

export const PRODUCT_KEYS = FAMILIES.flatMap((family) => family.products);

export function productFamily(product: ProductKey): FamilyKey {
  return FAMILIES.find((family) => family.products.includes(product))!.key;
}

export function productLabel(product: ProductKey): string {
  const family = productFamily(product);

  return product
    .replace(`${family}_`, "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
