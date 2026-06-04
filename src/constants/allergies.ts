import {
  Bean,
  Cookie,
  Egg,
  Fish,
  FlaskConical,
  Leaf,
  Milk,
  Nut,
  Salad,
  Shell,
  Wheat,
  WheatOff,
  type LucideIcon,
} from "lucide-react-native";

export type AllergyOption = {
  id: string;
  label: string;
  detail: string;
  Icon: LucideIcon;
  accent: string;
  surface: string;
};

export const allergyOptions: AllergyOption[] = [
  {
    id: "peanut",
    label: "Peanut",
    detail: "Peanut oil, sauces, mixed nuts",
    Icon: Nut,
    accent: "#B0472F",
    surface: "#FFF0EA",
  },
  {
    id: "tree-nut",
    label: "Tree nuts",
    detail: "Almond, cashew, walnut, pistachio",
    Icon: Bean,
    accent: "#7B4E23",
    surface: "#FFF6E6",
  },
  {
    id: "milk",
    label: "Milk",
    detail: "Milk, butter, cheese, cream",
    Icon: Milk,
    accent: "#1E6F83",
    surface: "#EAF8FB",
  },
  {
    id: "egg",
    label: "Egg",
    detail: "Whole egg, yolks, whites",
    Icon: Egg,
    accent: "#A86B14",
    surface: "#FFF7DA",
  },
  {
    id: "wheat",
    label: "Wheat",
    detail: "Buns, breading, flour, tortillas",
    Icon: Wheat,
    accent: "#947032",
    surface: "#FFF8E8",
  },
  {
    id: "gluten",
    label: "Gluten",
    detail: "Wheat, barley, rye, shared fryers",
    Icon: WheatOff,
    accent: "#A66A20",
    surface: "#FFF7E8",
  },
  {
    id: "soy",
    label: "Soy",
    detail: "Soybean, tofu, soy sauce, oils",
    Icon: Salad,
    accent: "#3D7C47",
    surface: "#EDF9EF",
  },
  {
    id: "sesame",
    label: "Sesame",
    detail: "Seeds, buns, tahini, seasoning",
    Icon: Cookie,
    accent: "#8A5B2F",
    surface: "#FFF3E3",
  },
  {
    id: "fish",
    label: "Fish",
    detail: "Fin fish, sauces, broths",
    Icon: Fish,
    accent: "#2870B8",
    surface: "#EDF5FF",
  },
  {
    id: "shellfish",
    label: "Shellfish",
    detail: "Shrimp, crab, lobster, mollusks",
    Icon: Shell,
    accent: "#B84D67",
    surface: "#FFF0F4",
  },
  {
    id: "mustard",
    label: "Mustard",
    detail: "Mustard seed, sauces, dressings",
    Icon: Leaf,
    accent: "#B28512",
    surface: "#FFF8D8",
  },
  {
    id: "sulfites",
    label: "Sulfites",
    detail: "Preservatives, sauces, dried toppings",
    Icon: FlaskConical,
    accent: "#6A5ACD",
    surface: "#F1EEFF",
  },
];

export function normalizeAllergyId(id: string) {
  return id === "dairy" ? "milk" : id;
}

export function normalizeAllergyIds(ids: string[]) {
  return Array.from(new Set(ids.map(normalizeAllergyId)));
}

export function getAllergyLabels(ids: string[]) {
  const normalizedIds = normalizeAllergyIds(ids);

  return allergyOptions
    .filter((option) => normalizedIds.includes(option.id))
    .map((option) => option.label);
}
