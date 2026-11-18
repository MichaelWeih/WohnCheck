import { LOCATION_RADII } from "./types";
import { formatRadius } from "./utils";

/** Search radius around the address. Changing it loads the surroundings again; filters do not. */
export function RadiusSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (radius: number) => void;
}) {
  return (
    <label className="location-radius">
      Suchradius
      <select
        aria-label="Suchradius"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {LOCATION_RADII.map((radius) => (
          <option key={radius} value={radius}>
            {formatRadius(radius)}
          </option>
        ))}
      </select>
    </label>
  );
}
