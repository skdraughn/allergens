import { StyleSheet, View } from "react-native";

import { SereneLoader } from "@/components/serene-loader";

export function RestaurantDetailLoader() {
  return (
    <View style={styles.container}>
      <SereneLoader />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
});
