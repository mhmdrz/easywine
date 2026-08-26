import type { CSSProperties } from "react";

export interface IconProps {
  name: string;
  filled?: boolean;
  weight?: number;
  grade?: number;
  opticalSize?: number;
  className?: string;
  style?: CSSProperties;
}

function Icon({
  name,
  filled = false,
  weight = 400,
  grade = 0,
  opticalSize = 24,
  className = "",
  style,
}: IconProps): React.JSX.Element {
  const fontVariationSettings = `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' ${grade}, 'opsz' ${opticalSize}`;

  return (
    <span
      className={`material-symbols-outlined ${className}`.trim()}
      style={{ fontVariationSettings, ...style }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

export default Icon;
