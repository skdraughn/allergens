import type { RestaurantSearchLocation } from "@/features/restaurants/restaurant-search-service";

export type GooglePlaceSuggestion = {
  id: string;
  mainText: string;
  secondaryText?: string;
};

export type GooglePlaceDetails = {
  addressLine1: string;
  city: string;
  country: string;
  displayAddress: string;
  googleMapsUri?: string;
  id: string;
  lat?: number;
  lng?: number;
  name: string;
  postalCode: string;
  region: string;
  website?: string;
};

type GoogleAutocompleteResponse = {
  suggestions?: {
    placePrediction?: {
      place?: string;
      placeId?: string;
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
      text?: { text?: string };
    };
  }[];
};

type GooglePlaceDetailsResponse = {
  addressComponents?: {
    longText?: string;
    shortText?: string;
    types?: string[];
  }[];
  displayName?: { text?: string };
  formattedAddress?: string;
  googleMapsUri?: string;
  id?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  websiteUri?: string;
};

const placesApiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY?.trim() ?? "";
const autocompleteUrl = "https://places.googleapis.com/v1/places:autocomplete";
const detailsFieldMask = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "websiteUri",
  "addressComponents",
  "googleMapsUri",
].join(",");

export function isGooglePlacesConfigured() {
  return Boolean(placesApiKey);
}

export function createGooglePlacesSessionToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function fetchRestaurantPlaceSuggestions({
  input,
  location,
  sessionToken,
}: {
  input: string;
  location?: RestaurantSearchLocation | null;
  sessionToken: string;
}): Promise<GooglePlaceSuggestion[]> {
  const trimmed = input.trim();

  if (!placesApiKey || trimmed.length < 3) {
    return [];
  }

  const response = await fetch(autocompleteUrl, {
    body: JSON.stringify({
      includedPrimaryTypes: ["restaurant"],
      input: trimmed,
      locationBias: location
        ? {
            circle: {
              center: {
                latitude: location.lat,
                longitude: location.lng,
              },
              radius: 30000,
            },
          }
        : undefined,
      sessionToken,
    }),
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": placesApiKey,
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Restaurant lookup is unavailable right now.");
  }

  const payload = (await response.json()) as GoogleAutocompleteResponse;

  return (payload.suggestions ?? [])
    .map((suggestion) => {
      const prediction = suggestion.placePrediction;
      const id = prediction?.placeId ?? prediction?.place?.replace("places/", "") ?? "";
      const mainText =
        prediction?.structuredFormat?.mainText?.text ?? prediction?.text?.text ?? "";

      return {
        id,
        mainText,
        secondaryText: prediction?.structuredFormat?.secondaryText?.text,
      };
    })
    .filter((suggestion) => suggestion.id && suggestion.mainText)
    .slice(0, 6);
}

export async function fetchRestaurantPlaceDetails({
  placeId,
  sessionToken,
}: {
  placeId: string;
  sessionToken: string;
}): Promise<GooglePlaceDetails> {
  if (!placesApiKey) {
    throw new Error("Restaurant lookup is not configured.");
  }

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`,
    {
      headers: {
        "X-Goog-Api-Key": placesApiKey,
        "X-Goog-FieldMask": detailsFieldMask,
      },
      method: "GET",
    },
  );

  if (!response.ok) {
    throw new Error("Restaurant details are unavailable right now.");
  }

  const payload = (await response.json()) as GooglePlaceDetailsResponse;
  const address = parseAddressComponents(payload.addressComponents ?? []);

  return {
    ...address,
    displayAddress: payload.formattedAddress ?? address.displayAddress,
    googleMapsUri: payload.googleMapsUri,
    id: payload.id ?? placeId,
    lat: payload.location?.latitude,
    lng: payload.location?.longitude,
    name: payload.displayName?.text ?? "",
    website: payload.websiteUri,
  };
}

function parseAddressComponents(
  components: NonNullable<GooglePlaceDetailsResponse["addressComponents"]>,
) {
  const streetNumber = componentLongText(components, "street_number");
  const route = componentLongText(components, "route");
  const city =
    componentLongText(components, "locality") ||
    componentLongText(components, "postal_town") ||
    componentLongText(components, "administrative_area_level_3");
  const region = componentShortText(components, "administrative_area_level_1");
  const postalCode = componentLongText(components, "postal_code");
  const country = componentShortText(components, "country");
  const addressLine1 = [streetNumber, route].filter(Boolean).join(" ");
  const cityLine = [city, region, postalCode].filter(Boolean).join(" ");

  return {
    addressLine1,
    city,
    country,
    displayAddress: [addressLine1, cityLine, country].filter(Boolean).join("\n"),
    postalCode,
    region,
  };
}

function componentLongText(
  components: NonNullable<GooglePlaceDetailsResponse["addressComponents"]>,
  type: string,
) {
  return components.find((component) => component.types?.includes(type))?.longText ?? "";
}

function componentShortText(
  components: NonNullable<GooglePlaceDetailsResponse["addressComponents"]>,
  type: string,
) {
  const component = components.find((nextComponent) => nextComponent.types?.includes(type));

  return component?.shortText ?? component?.longText ?? "";
}
