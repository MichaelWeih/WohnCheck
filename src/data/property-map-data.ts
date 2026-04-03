import { Neighborhood, Property, neighborhoods, properties } from "@/data/mock-data";

export type MappedProperty = Property & {
  latitude: number;
  longitude: number;
};

export type MapPoint = {
  latitude: number;
  longitude: number;
};

export type MappedNeighborhood = Neighborhood & {
  center: MapPoint;
  polygon: MapPoint[];
};

const propertyCoordinates: Record<string, { latitude: number; longitude: number }> = {
  p1: { latitude: 52.5407, longitude: 13.4126 },
  p2: { latitude: 48.1598, longitude: 11.5867 },
  p3: { latitude: 53.5618, longitude: 9.9627 },
  p4: { latitude: 52.5155, longitude: 13.4478 },
};

const neighborhoodShapes: Record<string, { center: MapPoint; polygon: MapPoint[] }> = {
  n1: {
    center: { latitude: 52.5391, longitude: 13.4246 },
    polygon: [
      { latitude: 52.5468, longitude: 13.4128 },
      { latitude: 52.5485, longitude: 13.4278 },
      { latitude: 52.5416, longitude: 13.4398 },
      { latitude: 52.5316, longitude: 13.4357 },
      { latitude: 52.5302, longitude: 13.4176 },
      { latitude: 52.5386, longitude: 13.4098 },
    ],
  },
  n2: {
    center: { latitude: 48.1644, longitude: 11.5901 },
    polygon: [
      { latitude: 48.1719, longitude: 11.5761 },
      { latitude: 48.1739, longitude: 11.5956 },
      { latitude: 48.1654, longitude: 11.6067 },
      { latitude: 48.1538, longitude: 11.6032 },
      { latitude: 48.1534, longitude: 11.5821 },
      { latitude: 48.1625, longitude: 11.5732 },
    ],
  },
  n3: {
    center: { latitude: 53.5585, longitude: 9.9676 },
    polygon: [
      { latitude: 53.5629, longitude: 9.9551 },
      { latitude: 53.5653, longitude: 9.9689 },
      { latitude: 53.5612, longitude: 9.9789 },
      { latitude: 53.5544, longitude: 9.9803 },
      { latitude: 53.5519, longitude: 9.9651 },
      { latitude: 53.5564, longitude: 9.9542 },
    ],
  },
  n4: {
    center: { latitude: 52.5158, longitude: 13.4542 },
    polygon: [
      { latitude: 52.5218, longitude: 13.4378 },
      { latitude: 52.5224, longitude: 13.4628 },
      { latitude: 52.5163, longitude: 13.4736 },
      { latitude: 52.5091, longitude: 13.4703 },
      { latitude: 52.5084, longitude: 13.4452 },
      { latitude: 52.5142, longitude: 13.4345 },
    ],
  },
};

export function getPropertyAddress(property: Pick<Property, "street" | "house_number">): string {
  return `${property.street} ${property.house_number}`;
}

export function getPropertyAddressFromApi(property: { street: string; houseNumber: string }): string {
  return `${property.street} ${property.houseNumber}`;
}

export function getMappedProperties(): MappedProperty[] {
  return properties.flatMap((property) => {
    const coordinates = propertyCoordinates[property.id];

    if (!coordinates) return [];

    return [{ ...property, ...coordinates }];
  });
}

export function getMappedPropertyById(id: string) {
  return getMappedProperties().find((property) => property.id === id);
}

export function getMappedNeighborhoods(): MappedNeighborhood[] {
  return neighborhoods.flatMap((neighborhood) => {
    const shape = neighborhoodShapes[neighborhood.id];

    if (!shape) return [];

    return [{ ...neighborhood, ...shape }];
  });
}
