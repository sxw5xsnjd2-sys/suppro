export function getRatingStyle(score) {
    if (score < 50) {
        return {
            gradient: ["#EF4444", "#EF4444", "#EF4444"],
            border: "#C53030",
        };
    }
    if (score < 75) {
        return {
            gradient: ["#F59E0B", "#F59E0B", "#F59E0B"],
            border: "#C2410C",
        };
    }
    return {
        gradient: ["#22C55E", "#22C55E", "#22C55E"],
        border: "#15803D",
    };
}
