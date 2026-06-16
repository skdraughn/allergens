import { Image, StyleSheet, Text, View } from "react-native";
import { SvgUri } from "react-native-svg";

import { type RestaurantBrand } from "@/data/brand-assets";

type RestaurantLogoProps = {
  borderRadius?: number;
  brand: RestaurantBrand;
  size: number;
};

export function RestaurantLogo({ borderRadius = 0, brand, size }: RestaurantLogoProps) {
  if (brand.logoMonogram) {
    return (
      <View
        style={[
          styles.monogramFrame,
          {
            backgroundColor: brand.color,
            borderRadius,
            height: size,
            width: size,
          },
        ]}
      >
        <Text
          style={[
            styles.monogramText,
            {
              fontSize: Math.max(13, size * 0.42),
              lineHeight: Math.max(15, size * 0.46),
            },
          ]}
        >
          {brand.logoMonogram}
        </Text>
      </View>
    );
  }

  if (brand.logoSvgUrl) {
    const logoHeight = brand.logoAspectRatio ? size / brand.logoAspectRatio : size;

    return (
      <View style={[styles.svgFrame, { borderRadius, height: size, width: size }]}>
        <SvgUri height={logoHeight} uri={brand.logoSvgUrl} width={size} />
      </View>
    );
  }

  return (
    <Image source={{ uri: brand.logoUrl }} style={{ borderRadius, height: size, width: size }} />
  );
}

const styles = StyleSheet.create({
  monogramFrame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  monogramText: {
    color: "#FFFFFF",
    fontWeight: "900",
    includeFontPadding: false,
    letterSpacing: 0,
  },
  svgFrame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
