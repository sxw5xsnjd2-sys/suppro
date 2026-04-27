import React from "react";
import Svg, { Path, Circle, Rect } from "react-native-svg";

export function MetricGlyph({ metricKey, size = 18, color = "#5E76A8" }) {
  const c = color;
  const p = { width: size, height: size, viewBox: "0 0 16 16" };
  const st = { stroke: c, strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };

  switch (metricKey) {
    case "sleep":
      return (
        <Svg {...p}>
          <Path d="M11 2.5a4.5 4.5 0 1 0 2.5 8.5A5.5 5.5 0 0 1 8 13 5.5 5.5 0 0 1 11 2.5z" fill={c} />
        </Svg>
      );
    case "physical_resilience":
      return (
        <Svg {...p}>
          <Path d="M8 1.5L3 3.5v4.2c0 3 2.2 5.6 5 6.8 2.8-1.2 5-3.8 5-6.8V3.5L8 1.5z" {...st} fill="none" />
          <Path d="M5.8 8l1.6 1.6L10.5 6.5" {...st} fill="none" />
        </Svg>
      );
    case "sleep_quality":
      return (
        <Svg {...p}>
          <Path d="M10.5 3a4 4 0 1 0 2.5 7.2A5 5 0 0 1 8 12 5 5 0 0 1 10.5 3z" fill={c} />
          <Circle cx="3.5" cy="4" r="0.6" fill={c} />
          <Circle cx="5" cy="7" r="0.5" fill={c} />
        </Svg>
      );
    case "exercise_recovery":
      return (
        <Svg {...p}>
          <Path d="M3 8a5 5 0 0 1 8.5-3.5L13 3v3.5H9.5" {...st} fill="none" />
          <Path d="M13 8a5 5 0 0 1-8.5 3.5L3 13V9.5h3.5" {...st} fill="none" />
        </Svg>
      );
    case "cardiovascular_health":
      return (
        <Svg {...p}>
          <Circle cx="10" cy="3.2" r="1.4" fill={c} />
          <Path d="M5 8l2.5-1.5 2 1 2 2.5M9.5 7.5L8 11.5l-2 .5M11.5 10l1.5 2" {...st} fill="none" />
        </Svg>
      );
    case "endurance_enhancing":
      return (
        <Svg {...p}>
          <Path d="M2 13l3.5-6 2 3 2.5-4.5L14 13H2z" fill={c} />
        </Svg>
      );
    case "workout_intensity":
      return (
        <Svg {...p}>
          <Rect x="1.5" y="6" width="2.2" height="4" rx="0.7" fill={c} />
          <Rect x="12.3" y="6" width="2.2" height="4" rx="0.7" fill={c} />
          <Rect x="3.7" y="7" width="8.6" height="2" fill={c} />
        </Svg>
      );
    case "energy":
      return (
        <Svg {...p}>
          <Path d="M9 1.5L3.5 9h3L7 14.5 12.5 7h-3L9 1.5z" fill={c} />
        </Svg>
      );
    case "mood":
      return (
        <Svg {...p}>
          <Circle cx="8" cy="8" r="6" {...st} fill="none" />
          <Circle cx="6" cy="7" r="0.8" fill={c} />
          <Circle cx="10" cy="7" r="0.8" fill={c} />
          <Path d="M5.5 10c.8 1 1.7 1.5 2.5 1.5s1.7-.5 2.5-1.5" {...st} fill="none" />
        </Svg>
      );
    case "motivation":
      return (
        <Svg {...p}>
          <Path d="M8 1.5C10 3 11.5 5 11.5 7.5V11L8 13l-3.5-2V7.5C4.5 5 6 3 8 1.5z" {...st} fill="none" />
          <Circle cx="8" cy="6.5" r="1.2" fill={c} />
          <Path d="M5 11l-1.5 2.5M11 11l1.5 2.5" {...st} fill="none" />
        </Svg>
      );
    case "productivity":
      return (
        <Svg {...p}>
          <Rect x="2.5" y="2.5" width="11" height="11" rx="2" {...st} fill="none" />
          <Path d="M5.5 6l1.2 1.2 2.4-2.4M5.5 10l1.2 1.2 2.4-2.4" {...st} fill="none" />
        </Svg>
      );
    case "sociability":
      return (
        <Svg {...p}>
          <Circle cx="5.5" cy="5.5" r="1.8" fill={c} />
          <Circle cx="11" cy="6" r="1.6" fill={c} />
          <Path d="M2 13c0-1.8 1.6-3 3.5-3s3.5 1.2 3.5 3M8 13c.2-1.5 1.4-2.5 3-2.5s2.8 1 3 2.5" {...st} fill="none" />
        </Svg>
      );
    case "concentration_enhancing":
      return (
        <Svg {...p}>
          <Circle cx="8" cy="8" r="6" {...st} fill="none" />
          <Circle cx="8" cy="8" r="3" {...st} fill="none" />
          <Circle cx="8" cy="8" r="1" fill={c} />
        </Svg>
      );
    case "cognitive_support":
      return (
        <Svg {...p}>
          <Path d="M8 2.5c-1.5 0-2.5 1-2.5 2 0 .3-1 .3-1 1.5s1 1.5 1 2c0 1 .5 2 1.5 2.5L7 13h2l.2-2.5c1-.5 1.6-1.5 1.6-2.5 0-.5 1-.8 1-2s-1-1.2-1-1.5c0-1-1-2-2.5-2z" {...st} fill="none" />
          <Path d="M8 5v8" {...st} fill="none" />
        </Svg>
      );
    case "stress":
      return (
        <Svg {...p}>
          <Path d="M2 8 Q4 4 6 8 T10 8 T14 8" {...st} fill="none" />
          <Path d="M2 12 Q4 8 6 12 T10 12 T14 12" {...st} strokeOpacity={0.5} fill="none" />
        </Svg>
      );
    case "anxiety":
      return (
        <Svg {...p}>
          <Path d="M8 2.5a5.5 5.5 0 1 1-3.9 9.4M8 5a3 3 0 1 0 2.1 5.1" {...st} fill="none" />
        </Svg>
      );
    case "cravings_intensity":
      return (
        <Svg {...p}>
          <Path d="M8 1.5C9.5 4.5 12 5.5 12 9a4 4 0 0 1-8 0c0-1.5 1-2.5 2-3 0 1 0.5 2 1 2 0.5-1 .5-2 0-3.5-1-2 0-3 1-3z" fill={c} />
        </Svg>
      );
    case "headache_severity":
      return (
        <Svg {...p}>
          <Path d="M3 9c0-3 2-5.5 5-5.5s5 2.5 5 5.5c0 1.5-.5 2.5-1.5 3.5H4.5C3.5 11.5 3 10.5 3 9z" {...st} fill="none" />
          <Path d="M6 9.5l1 1 2-2 2 2" {...st} fill="none" />
        </Svg>
      );
    case "anti_inflammatory":
      return (
        <Svg {...p}>
          <Path d="M8 1.5c1 1.5 3 3 3 5.5a3 3 0 0 1-6 0c0-.8.3-1.4.7-2 .3.7.8 1 1.3 1 0-1.5-.5-3 1-4.5z" {...st} fill="none" />
        </Svg>
      );
    case "joint_health":
      return (
        <Svg {...p}>
          <Rect x="1.5" y="6" width="6" height="4" rx="1.5" {...st} fill="none" />
          <Rect x="8.5" y="6" width="6" height="4" rx="1.5" {...st} fill="none" />
          <Path d="M6 8h4" {...st} fill="none" />
        </Svg>
      );
    case "skin_health":
      return (
        <Svg {...p}>
          <Circle cx="8" cy="8" r="3" {...st} fill="none" />
          <Path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" {...st} fill="none" />
        </Svg>
      );
    case "digestive_health":
      return (
        <Svg {...p}>
          <Path d="M4 3v3a2 2 0 0 0 2 2 2 2 0 0 1 2 2v3M8 3v3a2 2 0 0 0 2 2 2 2 0 0 1 2 2v1" {...st} fill="none" />
        </Svg>
      );
    case "allergies_severity":
      return (
        <Svg {...p}>
          <Circle cx="8" cy="8" r="1.5" fill={c} />
          <Circle cx="8" cy="3.5" r="1.7" {...st} fill="none" />
          <Circle cx="8" cy="12.5" r="1.7" {...st} fill="none" />
          <Circle cx="3.5" cy="8" r="1.7" {...st} fill="none" />
          <Circle cx="12.5" cy="8" r="1.7" {...st} fill="none" />
        </Svg>
      );
    case "bloating":
      return (
        <Svg {...p}>
          <Circle cx="8" cy="9" r="4.5" {...st} fill="none" />
          <Path d="M8 4.5V2M5.5 5L4 3.5M10.5 5L12 3.5" {...st} fill="none" />
        </Svg>
      );
    case "brain_fog":
      return (
        <Svg {...p}>
          <Path d="M3.5 10a2 2 0 0 1 .5-3.9A3 3 0 0 1 10 6a2.2 2.2 0 0 1 2 4H4a1.5 1.5 0 0 1-.5 0z" {...st} fill="none" />
          <Path d="M5 13h2M8.5 13h2.5" {...st} fill="none" />
        </Svg>
      );
    case "sex_drive":
      return (
        <Svg {...p}>
          <Path d="M8 13.5S2.5 10 2.5 6.2A2.7 2.7 0 0 1 5.2 3.5C6.5 3.5 7.4 4.3 8 5.3 8.6 4.3 9.5 3.5 10.8 3.5a2.7 2.7 0 0 1 2.7 2.7c0 3.8-5.5 7.3-5.5 7.3z" fill={c} />
        </Svg>
      );
    case "weight":
      return (
        <Svg {...p}>
          <Rect x="1.5" y="3.5" width="13" height="9" rx="2" {...st} fill="none" />
          <Path d="M5 7.5L8 5.5l3 2" {...st} fill="none" />
          <Path d="M8 5.5v3.5" {...st} fill="none" />
        </Svg>
      );
    case "blood_pressure_control":
      return (
        <Svg {...p}>
          <Path d="M8 14C5 14 3 11.5 3 9c0-3 5-7.5 5-7.5S13 6 13 9c0 2.5-2 5-5 5z" fill={c} />
        </Svg>
      );
    case "blood_sugar_control":
      return (
        <Svg {...p}>
          <Path d="M8 2s-3 4-3 6.5a3 3 0 0 0 6 0C11 6 8 2 8 2z" {...st} fill="none" />
          <Path d="M6 13.5h4" {...st} fill="none" />
        </Svg>
      );
    case "cholesterol_support":
      return (
        <Svg {...p}>
          <Path d="M8 13.5S2.5 10 2.5 6.2A2.7 2.7 0 0 1 5.2 3.5C6.5 3.5 7.4 4.3 8 5.3 8.6 4.3 9.5 3.5 10.8 3.5a2.7 2.7 0 0 1 2.7 2.7c0 3.8-5.5 7.3-5.5 7.3z" {...st} fill="none" />
          <Path d="M2 9h2l1-1.5L7 11l1.5-3 1 1.5H14" {...st} fill="none" />
        </Svg>
      );
    case "strength_enhancing":
      return (
        <Svg {...p}>
          <Rect x="0.8" y="5" width="1.4" height="6" rx="0.5" fill={c} />
          <Rect x="13.8" y="5" width="1.4" height="6" rx="0.5" fill={c} />
          <Rect x="2.5" y="6.5" width="1.6" height="3" rx="0.4" fill={c} />
          <Rect x="11.9" y="6.5" width="1.6" height="3" rx="0.4" fill={c} />
          <Rect x="4.2" y="7.3" width="7.6" height="1.4" fill={c} />
        </Svg>
      );
    case "testosterone_enhancing":
      return (
        <Svg {...p}>
          <Circle cx="6.5" cy="9.5" r="3.5" {...st} fill="none" />
          <Path d="M9 7L13.5 2.5M10.5 2.5h3v3" {...st} fill="none" />
        </Svg>
      );
    default:
      return (
        <Svg {...p}>
          <Circle cx="8" cy="8" r="5.5" {...st} fill="none" />
          <Circle cx="8" cy="8" r="1.5" fill={c} />
        </Svg>
      );
  }
}
