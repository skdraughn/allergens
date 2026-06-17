import { type LucideIcon } from "lucide-react-native";
import { type ComponentType } from "react";
import { Image, type ImageSourcePropType } from "react-native";
import Svg, { Circle, Text as SvgText } from "react-native-svg";

type AllergyIconProps = {
  color?: string;
  size?: number;
  strokeWidth?: number;
};

type AllergyIcon = LucideIcon | ComponentType<AllergyIconProps>;

export type AllergyOption = {
  id: string;
  label: string;
  detail: string;
  Icon: AllergyIcon;
  accent: string;
  surface: string;
};

function makeFsaIcon(source: ImageSourcePropType) {
  return function FsaAllergyIcon({ size = 24 }: AllergyIconProps) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={source}
        style={{ height: size, width: size }}
      />
    );
  };
}

const fsaIcons = {
  egg: require("../../assets/allergens/fsa/egg.png"),
  fish: require("../../assets/allergens/fsa/fish.png"),
  milk: require("../../assets/allergens/fsa/milk.png"),
  mustard: require("../../assets/allergens/fsa/mustard.png"),
  peanut: require("../../assets/allergens/fsa/peanut.png"),
  sesame: require("../../assets/allergens/fsa/sesame.png"),
  shellfish: require("../../assets/allergens/fsa/shellfish.png"),
  soy: require("../../assets/allergens/fsa/soy.png"),
  sulfites: require("../../assets/allergens/fsa/sulfites.png"),
  treeNut: require("../../assets/allergens/fsa/tree-nut.png"),
  wheat: require("../../assets/allergens/fsa/wheat.png"),
} satisfies Record<string, ImageSourcePropType>;

function GlutenIcon({ color = "#A66A20", size = 24 }: AllergyIconProps) {
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Circle cx="12" cy="12" fill={color} r="10.2" />
      <Circle
        cx="12"
        cy="12"
        fill="none"
        r="8.3"
        stroke="#FFFFFF"
        strokeOpacity={0.92}
        strokeWidth={1.35}
      />
      <Circle cx="12" cy="12" fill="none" r="7" stroke="#FFFFFF" strokeOpacity={0.35} />
      <SvgText
        fill="#FFFFFF"
        fontSize="12"
        fontWeight="800"
        textAnchor="middle"
        x="12"
        y="16.2"
      >
        G
      </SvgText>
    </Svg>
  );
}

export const allergyOptions: AllergyOption[] = [
  {
    id: "shellfish",
    label: "Shellfish",
    detail: "Shrimp, crab, lobster, mollusks",
    Icon: makeFsaIcon(fsaIcons.shellfish),
    accent: "#D75E63",
    surface: "#FFF0F1",
  },
  {
    id: "milk",
    label: "Milk",
    detail: "Milk, butter, cheese, cream",
    Icon: makeFsaIcon(fsaIcons.milk),
    accent: "#00A7D8",
    surface: "#E8F9FF",
  },
  {
    id: "peanut",
    label: "Peanut",
    detail: "Peanut oil, sauces, mixed nuts",
    Icon: makeFsaIcon(fsaIcons.peanut),
    accent: "#9A5A15",
    surface: "#FFF1E2",
  },
  {
    id: "tree-nut",
    label: "Tree nuts",
    detail: "Almond, cashew, walnut, pistachio",
    Icon: makeFsaIcon(fsaIcons.treeNut),
    accent: "#8D5A14",
    surface: "#FFF2DE",
  },
  {
    id: "egg",
    label: "Egg",
    detail: "Whole egg, yolks, whites",
    Icon: makeFsaIcon(fsaIcons.egg),
    accent: "#00A7D8",
    surface: "#E8F9FF",
  },
  {
    id: "fish",
    label: "Fish",
    detail: "Fin fish, sauces, broths",
    Icon: makeFsaIcon(fsaIcons.fish),
    accent: "#1F78BF",
    surface: "#F1F7FA",
  },
  {
    id: "wheat",
    label: "Wheat",
    detail: "Buns, breading, flour, tortillas",
    Icon: makeFsaIcon(fsaIcons.wheat),
    accent: "#F69B1D",
    surface: "#FFF4DF",
  },
  {
    id: "soy",
    label: "Soy",
    detail: "Soybean, tofu, soy sauce, oils",
    Icon: makeFsaIcon(fsaIcons.soy),
    accent: "#2DB34A",
    surface: "#EAF8EE",
  },
  {
    id: "sesame",
    label: "Sesame",
    detail: "Seeds, buns, tahini, seasoning",
    Icon: makeFsaIcon(fsaIcons.sesame),
    accent: "#DFB46B",
    surface: "#FFF1DA",
  },
  {
    id: "gluten",
    label: "Gluten",
    detail: "Wheat, barley, rye, shared fryers",
    Icon: GlutenIcon,
    accent: "#B36F18",
    surface: "#FFF2DE",
  },
  {
    id: "mustard",
    label: "Mustard",
    detail: "Mustard seed, sauces, dressings",
    Icon: makeFsaIcon(fsaIcons.mustard),
    accent: "#D0A12A",
    surface: "#FFF7DD",
  },
  {
    id: "sulfites",
    label: "Sulfites",
    detail: "Preservatives, sauces, dried toppings",
    Icon: makeFsaIcon(fsaIcons.sulfites),
    accent: "#7867B8",
    surface: "#F2EFFF",
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
