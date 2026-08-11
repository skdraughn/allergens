import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { SvgUri } from "react-native-svg";

import { type RestaurantBrand } from "@/data/brand-assets";

type RestaurantLogoProps = {
  borderRadius?: number;
  brand: RestaurantBrand;
  size: number;
};

export function RestaurantLogo({ borderRadius = 0, brand, size }: RestaurantLogoProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const monogram = brand.logoMonogram ?? fallbackMonogram(brand.name ?? brand.domain);

  useEffect(() => {
    setImageFailed(false);
  }, [brand.logoUrl, brand.logoSvgUrl]);

  if (brand.logoMonogram || imageFailed) {
    return (
      <View
        style={[
          styles.monogramFrame,
          {
            backgroundColor: colorWithAlpha(brand.color, 0.1),
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
              color: brand.color,
              fontSize: Math.max(13, size * 0.42),
              lineHeight: Math.max(15, size * 0.46),
            },
          ]}
        >
          {monogram}
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

  const imageSize = brand.logoSource === "fallback-favicon" ? Math.round(size * 0.72) : size;

  return (
    <View style={[styles.imageFrame, { borderRadius, height: size, width: size }]}>
      <Image
        onError={() => setImageFailed(true)}
        resizeMode="contain"
        source={{ uri: brand.logoUrl }}
        style={{ height: imageSize, width: imageSize }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  imageFrame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  monogramFrame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  monogramText: {
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

function fallbackMonogram(value: string) {
  const words = value
    .replace(/^www\./, "")
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
  const letters = words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

  return letters || "?";
}

function colorWithAlpha(color: string, alpha: number) {
  const hex = color.trim();

  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    const red = Number.parseInt(hex.slice(1, 3), 16);
    const green = Number.parseInt(hex.slice(3, 5), 16);
    const blue = Number.parseInt(hex.slice(5, 7), 16);

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  return "rgba(118, 118, 128, 0.1)";
}
