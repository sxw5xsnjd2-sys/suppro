import React from "react";
import Svg, { Path, Circle, Line } from "react-native-svg";

export function HealthMetricIcon({ metricKey, size = 16, color }) {
  const c = color || "#5E76A8";
  const props = { width: size, height: size, viewBox: "0 0 16 16" };

  switch (metricKey) {
    case "sleep":
      return (
        <Svg {...props}>
          <Path
            d="M11 2.5a4.5 4.5 0 1 0 2.5 8.5A5.5 5.5 0 0 1 8 13 5.5 5.5 0 0 1 11 2.5z"
            fill={c}
          />
        </Svg>
      );
    case "weight":
      return (
        <Svg {...props}>
          <Circle cx="8" cy="3" r="1.4" fill={c} />
          <Path
            d="M5 14V8.5L3 11M11 14V8.5L13 11M5 8.5h6"
            stroke={c}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case "energy":
      return (
        <Svg {...props}>
          <Path
            d="M8 1.5C5.5 4 4 6 4 8.5a4 4 0 0 0 8 0c0-1-.5-2-1.5-3 .5 2-.5 3.5-2 3.5C7 9 7 7 8 1.5z"
            fill={c}
          />
        </Svg>
      );
    case "mood":
      return (
        <Svg {...props}>
          <Circle cx="8" cy="8" r="6" stroke={c} strokeWidth="1.4" />
          <Circle cx="6" cy="7" r="0.8" fill={c} />
          <Circle cx="10" cy="7" r="0.8" fill={c} />
          <Path
            d="M5.5 10c.8 1 1.7 1.5 2.5 1.5s1.7-.5 2.5-1.5"
            stroke={c}
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      );
    case "concentration_enhancing":
      return (
        <Svg {...props}>
          <Circle cx="8" cy="8" r="6" stroke={c} strokeWidth="1.4" />
          <Circle cx="8" cy="8" r="3" stroke={c} strokeWidth="1.4" />
          <Circle cx="8" cy="8" r="1" fill={c} />
        </Svg>
      );
    case "cognitive_support":
      return (
        <Svg {...props}>
          <Circle cx="8" cy="8" r="6" stroke={c} strokeWidth="1.4" />
          <Circle cx="8" cy="8" r="3" stroke={c} strokeWidth="1.4" />
          <Circle cx="8" cy="8" r="1" fill={c} />
        </Svg>
      );
    case "stress":
    case "anxiety":
    case "cravings_intensity":
      return (
        <Svg {...props}>
          <Path
            d="M2 8 Q4 4 6 8 T10 8 T14 8"
            stroke={c}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M2 12 Q4 8 6 12 T10 12 T14 12"
            stroke={c}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity="0.5"
          />
        </Svg>
      );
    case "headache_severity":
      return (
        <Svg {...props}>
          <Path
            d="M3 9c0-3 2-5.5 5-5.5s5 2.5 5 5.5c0 1.5-.5 2.5-1.5 3.5H4.5C3.5 11.5 3 10.5 3 9z"
            stroke={c}
            strokeWidth="1.4"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M6 9.5l1 1 2-2 2 2"
            stroke={c}
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      );
    case "blood_pressure_control":
      return (
        <Svg {...props}>
          <Path
            d="M8 14C5 14 3 11.5 3 9c0-3 5-7.5 5-7.5S13 6 13 9c0 2.5-2 5-5 5z"
            fill={c}
          />
        </Svg>
      );
    case "anti_inflammatory":
    case "joint_health":
      return (
        <Svg {...props}>
          <Circle cx="8" cy="8" r="5.5" stroke={c} strokeWidth="1.4" fill="none" />
          <Path
            d="M5 8h6M8 5v6"
            stroke={c}
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      );
    case "skin_health":
    case "digestive_health":
    case "allergies_severity":
    case "bloating":
    case "brain_fog":
      return (
        <Svg {...props}>
          <Circle cx="8" cy="8" r="5.5" stroke={c} strokeWidth="1.4" fill="none" />
          <Path
            d="M6 10.5c.5.7 1.2 1 2 1s1.5-.3 2-1"
            stroke={c}
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
          />
          <Circle cx="6.5" cy="7" r="0.8" fill={c} />
          <Circle cx="9.5" cy="7" r="0.8" fill={c} />
        </Svg>
      );
    case "cardiovascular_health":
    case "endurance_enhancing":
      return (
        <Svg {...props}>
          <Path
            d="M8 13C5 11 2 9 2 6a3 3 0 0 1 6 0 3 3 0 0 1 6 0c0 3-3 5-6 7z"
            fill={c}
            opacity="0.5"
          />
          <Path
            d="M2 8h3l1.5-3 2 5 1.5-3H13"
            stroke={c}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      );
    case "workout_intensity":
      return (
        <Svg {...props}>
          <Path
            d="M3 8h10M5 5v6M11 5v6"
            stroke={c}
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      );
    case "motivation":
    case "productivity":
    case "sociability":
      return (
        <Svg {...props}>
          <Path
            d="M8 2l1.5 3.5L13 6l-2.5 2.5.6 3.5L8 10.5 4.9 12l.6-3.5L3 6l3.5-.5L8 2z"
            fill={c}
            opacity="0.9"
          />
        </Svg>
      );
    case "physical_resilience":
    case "sleep_quality":
    case "exercise_recovery":
      return (
        <Svg {...props}>
          <Path
            d="M4 10C4 7 5.5 5 8 5s4 2 4 5"
            stroke={c}
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
          />
          <Path d="M4 10h8" stroke={c} strokeWidth="1.4" strokeLinecap="round" fill="none" />
          <Circle cx="8" cy="11.5" r="1" fill={c} />
        </Svg>
      );
    case "blood_sugar_control":
      return (
        <Svg {...props}>
          <Circle cx="8" cy="8" r="5.5" stroke={c} strokeWidth="1.4" fill="none" />
          <Path
            d="M5.5 8h5M8 5.5v5"
            stroke={c}
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      );
    case "cholesterol_support":
    case "strength_enhancing":
    case "testosterone_enhancing":
      return (
        <Svg {...props}>
          <Path
            d="M3 13L7 8l3 4 2-6 2 3"
            stroke={c}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      );
    case "sex_drive":
      return (
        <Svg {...props}>
          <Path
            d="M8 13C5 11 2 9 2 6a3 3 0 0 1 6 0 3 3 0 0 1 6 0c0 3-3 5-6 7z"
            fill={c}
          />
        </Svg>
      );
    default:
      return (
        <Svg {...props}>
          <Circle cx="8" cy="8" r="6" stroke={c} strokeWidth="1.4" fill="none" />
        </Svg>
      );
  }
}
