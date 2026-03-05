import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface BodyRegion {
  region: string;
  color: string;
  intensity: number;
  note: string;
}

export interface BodyChartProps {
  data?: BodyRegion[];
  onChange?: (data: BodyRegion[]) => void;
  readOnly?: boolean;
}

const REGIONS = [
  { id: "head", label: "Head" },
  { id: "neck", label: "Neck" },
  { id: "chest", label: "Chest" },
  { id: "abdomen", label: "Abdomen" },
  { id: "upper-back", label: "Upper Back" },
  { id: "lower-back", label: "Lower Back" },
  { id: "left-arm", label: "Left Arm" },
  { id: "right-arm", label: "Right Arm" },
  { id: "left-hand", label: "Left Hand" },
  { id: "right-hand", label: "Right Hand" },
  { id: "left-leg", label: "Left Leg" },
  { id: "right-leg", label: "Right Leg" },
  { id: "left-foot", label: "Left Foot" },
  { id: "right-foot", label: "Right Foot" },
];

const COLORS = [
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Yellow", value: "#eab308" },
  { name: "Green", value: "#22c55e" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#a855f7" },
];

const INTENSITIES = [
  { label: "Light", value: 0.25 },
  { label: "Medium", value: 0.5 },
  { label: "Strong", value: 0.75 },
  { label: "Very Strong", value: 1 },
];

export function BodyChart({ data = [], onChange, readOnly = false }: BodyChartProps) {
  const { t } = useTranslation();
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");

  const getRegionData = useCallback(
    (regionId: string) => {
      return data.find((r) => r.region === regionId);
    },
    [data]
  );

  const toggleRegion = useCallback(
    (regionId: string) => {
      if (readOnly) return;

      const existing = getRegionData(regionId);
      if (existing) {
        // Remove region
        onChange?.(data.filter((r) => r.region !== regionId));
        setSelectedRegion(null);
      } else {
        // Add region with defaults
        const newRegion: BodyRegion = {
          region: regionId,
          color: "#ef4444",
          intensity: 0.5,
          note: "",
        };
        onChange?.([...data, newRegion]);
        setSelectedRegion(regionId);
        setEditNote("");
      }
    },
    [data, getRegionData, onChange, readOnly]
  );

  const updateRegion = useCallback(
    (regionId: string, updates: Partial<BodyRegion>) => {
      if (readOnly) return;
      onChange?.(
        data.map((r) => (r.region === regionId ? { ...r, ...updates } : r))
      );
    },
    [data, onChange, readOnly]
  );

  const clearAll = useCallback(() => {
    if (readOnly) return;
    onChange?.([]);
    setSelectedRegion(null);
  }, [onChange, readOnly]);

  const getRegionColor = (regionId: string) => {
    const region = getRegionData(regionId);
    if (!region) return "transparent";
    return region.color;
  };

  const getRegionOpacity = (regionId: string) => {
    const region = getRegionData(regionId);
    if (!region) return 0;
    return region.intensity;
  };

  const selectedData = selectedRegion ? getRegionData(selectedRegion) : null;

  return (
    <div className="flex gap-6">
      {/* Body SVGs */}
      <div className="flex-1 flex justify-center gap-4">
        {/* Front View */}
        <div className="space-y-2">
          <p className="text-center text-sm font-medium text-muted-foreground">{t("gabinet.bodyChart.front")}</p>
          <svg
            viewBox="0 0 100 200"
            className="w-40 h-80"
            style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))" }}
          >
            {/* Body outline */}
            <g fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5">
              {/* Head */}
              <ellipse cx="50" cy="15" rx="12" ry="15" />
              {/* Neck */}
              <rect x="45" y="28" width="10" height="8" />
              {/* Chest */}
              <path d="M30 36 L70 36 L72 70 L28 70 Z" />
              {/* Abdomen */}
              <path d="M28 70 L72 70 L70 110 L30 110 Z" />
              {/* Left Arm */}
              <path d="M28 36 L18 40 L15 90 L20 92 L25 50 L28 50" />
              {/* Right Arm */}
              <path d="M72 36 L82 40 L85 90 L80 92 L75 50 L72 50" />
              {/* Left Hand */}
              <ellipse cx="17" cy="96" rx="5" ry="6" />
              {/* Right Hand */}
              <ellipse cx="83" cy="96" rx="5" ry="6" />
              {/* Left Leg */}
              <path d="M30 110 L35 180 L25 180 L25 110" />
              {/* Right Leg */}
              <path d="M70 110 L65 180 L75 180 L75 110" />
              {/* Left Foot */}
              <ellipse cx="30" cy="186" rx="7" ry="5" />
              {/* Right Foot */}
              <ellipse cx="70" cy="186" rx="7" ry="5" />
            </g>

            {/* Clickable overlays */}
            <g className={cn(readOnly ? "" : "cursor-pointer")}>
              {/* Head */}
              <ellipse
                cx="50" cy="15" rx="12" ry="15"
                fill={getRegionColor("head")}
                opacity={getRegionOpacity("head")}
                onClick={() => toggleRegion("head")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Neck */}
              <rect
                x="45" y="28" width="10" height="8"
                fill={getRegionColor("neck")}
                opacity={getRegionOpacity("neck")}
                onClick={() => toggleRegion("neck")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Chest */}
              <path
                d="M30 36 L70 36 L72 70 L28 70 Z"
                fill={getRegionColor("chest")}
                opacity={getRegionOpacity("chest")}
                onClick={() => toggleRegion("chest")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Abdomen */}
              <path
                d="M28 70 L72 70 L70 110 L30 110 Z"
                fill={getRegionColor("abdomen")}
                opacity={getRegionOpacity("abdomen")}
                onClick={() => toggleRegion("abdomen")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Left Arm */}
              <path
                d="M28 36 L18 40 L15 90 L20 92 L25 50 L28 50"
                fill={getRegionColor("left-arm")}
                opacity={getRegionOpacity("left-arm")}
                onClick={() => toggleRegion("left-arm")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Right Arm */}
              <path
                d="M72 36 L82 40 L85 90 L80 92 L75 50 L72 50"
                fill={getRegionColor("right-arm")}
                opacity={getRegionOpacity("right-arm")}
                onClick={() => toggleRegion("right-arm")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Left Hand */}
              <ellipse
                cx="17" cy="96" rx="5" ry="6"
                fill={getRegionColor("left-hand")}
                opacity={getRegionOpacity("left-hand")}
                onClick={() => toggleRegion("left-hand")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Right Hand */}
              <ellipse
                cx="83" cy="96" rx="5" ry="6"
                fill={getRegionColor("right-hand")}
                opacity={getRegionOpacity("right-hand")}
                onClick={() => toggleRegion("right-hand")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Left Leg */}
              <path
                d="M30 110 L35 180 L25 180 L25 110"
                fill={getRegionColor("left-leg")}
                opacity={getRegionOpacity("left-leg")}
                onClick={() => toggleRegion("left-leg")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Right Leg */}
              <path
                d="M70 110 L65 180 L75 180 L75 110"
                fill={getRegionColor("right-leg")}
                opacity={getRegionOpacity("right-leg")}
                onClick={() => toggleRegion("right-leg")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Left Foot */}
              <ellipse
                cx="30" cy="186" rx="7" ry="5"
                fill={getRegionColor("left-foot")}
                opacity={getRegionOpacity("left-foot")}
                onClick={() => toggleRegion("left-foot")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Right Foot */}
              <ellipse
                cx="70" cy="186" rx="7" ry="5"
                fill={getRegionColor("right-foot")}
                opacity={getRegionOpacity("right-foot")}
                onClick={() => toggleRegion("right-foot")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
            </g>
          </svg>
        </div>

        {/* Back View */}
        <div className="space-y-2">
          <p className="text-center text-sm font-medium text-muted-foreground">{t("gabinet.bodyChart.back")}</p>
          <svg
            viewBox="0 0 100 200"
            className="w-40 h-80"
            style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))" }}
          >
            {/* Body outline */}
            <g fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5">
              {/* Head */}
              <ellipse cx="50" cy="15" rx="12" ry="15" />
              {/* Neck */}
              <rect x="45" y="28" width="10" height="8" />
              {/* Upper Back */}
              <path d="M30 36 L70 36 L72 70 L28 70 Z" />
              {/* Lower Back */}
              <path d="M28 70 L72 70 L70 110 L30 110 Z" />
              {/* Left Arm */}
              <path d="M28 36 L18 40 L15 90 L20 92 L25 50 L28 50" />
              {/* Right Arm */}
              <path d="M72 36 L82 40 L85 90 L80 92 L75 50 L72 50" />
              {/* Left Hand */}
              <ellipse cx="17" cy="96" rx="5" ry="6" />
              {/* Right Hand */}
              <ellipse cx="83" cy="96" rx="5" ry="6" />
              {/* Left Leg */}
              <path d="M30 110 L35 180 L25 180 L25 110" />
              {/* Right Leg */}
              <path d="M70 110 L65 180 L75 180 L75 110" />
              {/* Left Foot */}
              <ellipse cx="30" cy="186" rx="7" ry="5" />
              {/* Right Foot */}
              <ellipse cx="70" cy="186" rx="7" ry="5" />
            </g>

            {/* Clickable overlays */}
            <g className={cn(readOnly ? "" : "cursor-pointer")}>
              {/* Head */}
              <ellipse
                cx="50" cy="15" rx="12" ry="15"
                fill={getRegionColor("head")}
                opacity={getRegionOpacity("head")}
                onClick={() => toggleRegion("head")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Neck */}
              <rect
                x="45" y="28" width="10" height="8"
                fill={getRegionColor("neck")}
                opacity={getRegionOpacity("neck")}
                onClick={() => toggleRegion("neck")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Upper Back */}
              <path
                d="M30 36 L70 36 L72 70 L28 70 Z"
                fill={getRegionColor("upper-back")}
                opacity={getRegionOpacity("upper-back")}
                onClick={() => toggleRegion("upper-back")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Lower Back */}
              <path
                d="M28 70 L72 70 L70 110 L30 110 Z"
                fill={getRegionColor("lower-back")}
                opacity={getRegionOpacity("lower-back")}
                onClick={() => toggleRegion("lower-back")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Left Arm */}
              <path
                d="M28 36 L18 40 L15 90 L20 92 L25 50 L28 50"
                fill={getRegionColor("left-arm")}
                opacity={getRegionOpacity("left-arm")}
                onClick={() => toggleRegion("left-arm")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Right Arm */}
              <path
                d="M72 36 L82 40 L85 90 L80 92 L75 50 L72 50"
                fill={getRegionColor("right-arm")}
                opacity={getRegionOpacity("right-arm")}
                onClick={() => toggleRegion("right-arm")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Left Hand */}
              <ellipse
                cx="17" cy="96" rx="5" ry="6"
                fill={getRegionColor("left-hand")}
                opacity={getRegionOpacity("left-hand")}
                onClick={() => toggleRegion("left-hand")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Right Hand */}
              <ellipse
                cx="83" cy="96" rx="5" ry="6"
                fill={getRegionColor("right-hand")}
                opacity={getRegionOpacity("right-hand")}
                onClick={() => toggleRegion("right-hand")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Left Leg */}
              <path
                d="M30 110 L35 180 L25 180 L25 110"
                fill={getRegionColor("left-leg")}
                opacity={getRegionOpacity("left-leg")}
                onClick={() => toggleRegion("left-leg")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Right Leg */}
              <path
                d="M70 110 L65 180 L75 180 L75 110"
                fill={getRegionColor("right-leg")}
                opacity={getRegionOpacity("right-leg")}
                onClick={() => toggleRegion("right-leg")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Left Foot */}
              <ellipse
                cx="30" cy="186" rx="7" ry="5"
                fill={getRegionColor("left-foot")}
                opacity={getRegionOpacity("left-foot")}
                onClick={() => toggleRegion("left-foot")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
              {/* Right Foot */}
              <ellipse
                cx="70" cy="186" rx="7" ry="5"
                fill={getRegionColor("right-foot")}
                opacity={getRegionOpacity("right-foot")}
                onClick={() => toggleRegion("right-foot")}
                className={cn(!readOnly && "hover:opacity-60")}
              />
            </g>
          </svg>
        </div>
      </div>

      {/* Controls Panel */}
      {!readOnly && (
        <div className="w-64 space-y-4">
          {/* Region Editor */}
          {selectedData ? (
            <div className="space-y-4 p-4 border rounded-lg">
              <h3 className="font-medium">{t(`gabinet.bodyChart.regions.${selectedRegion}`)}</h3>

              {/* Color picker */}
              <div>
                <label className="text-sm text-muted-foreground">{t("gabinet.bodyChart.color")}</label>
                <div className="flex gap-1 mt-1">
                  {COLORS.map((color) => (
                    <button
                      key={color.value}
                      className={cn(
                        "w-6 h-6 rounded border-2",
                        selectedData.color === color.value ? "border-foreground" : "border-transparent"
                      )}
                      style={{ backgroundColor: color.value }}
                      onClick={() => updateRegion(selectedRegion, { color: color.value })}
                    />
                  ))}
                </div>
              </div>

              {/* Intensity slider */}
              <div>
                <label className="text-sm text-muted-foreground">{t("gabinet.bodyChart.intensity")}</label>
                <div className="flex gap-1 mt-1">
                  {INTENSITIES.map((int) => (
                    <button
                      key={int.value}
                      className={cn(
                        "px-2 py-1 text-xs rounded border",
                        selectedData.intensity === int.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-background"
                      )}
                      onClick={() => updateRegion(selectedRegion, { intensity: int.value })}
                    >
                      {int.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="text-sm text-muted-foreground">{t("gabinet.bodyChart.note")}</label>
                <textarea
                  className="w-full mt-1 p-2 text-sm border rounded"
                  rows={3}
                  value={editNote || selectedData.note}
                  onChange={(e) => setEditNote(e.target.value)}
                  onBlur={() => updateRegion(selectedRegion, { note: editNote })}
                  placeholder={t("gabinet.bodyChart.notePlaceholder")}
                />
              </div>

              {/* Remove button */}
              <button
                className="w-full py-2 text-sm text-destructive hover:bg-destructive/10 rounded"
                onClick={() => toggleRegion(selectedRegion)}
              >
                {t("gabinet.bodyChart.removeRegion")}
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground p-4">{t("gabinet.bodyChart.clickToSelect")}</p>
          )}

          {/* Clear All */}
          {data.length > 0 && (
            <button
              className="w-full py-2 text-sm border rounded hover:bg-muted"
              onClick={clearAll}
            >
              {t("gabinet.bodyChart.clearAll")}
            </button>
          )}

          {/* Legend */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t("gabinet.bodyChart.legend")}</h3>
            <div className="grid grid-cols-2 gap-1 text-xs">
              {REGIONS.map((region) => {
                const regionData = getRegionData(region.id);
                return (
                  <div
                    key={region.id}
                    className={cn(
                      "flex items-center gap-1 p-1 rounded cursor-pointer",
                      regionData && "bg-primary/10"
                    )}
                    onClick={() => setSelectedRegion(region.id)}
                  >
                    <div
                      className="w-3 h-3 rounded-sm border"
                      style={{
                        backgroundColor: regionData ? regionData.color : "transparent",
                        opacity: regionData ? regionData.intensity : 1,
                      }}
                    />
                    <span>{t(`gabinet.bodyChart.regions.${region.id}`)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Read-only Legend */}
      {readOnly && data.length > 0 && (
        <div className="w-64 space-y-2">
          <h3 className="text-sm font-medium">{t("gabinet.bodyChart.markedRegions")}</h3>
          <div className="space-y-1">
            {data.map((region) => (
              <div key={region.region} className="p-2 border rounded">
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: region.color, opacity: region.intensity }}
                  />
                  <span className="text-sm font-medium">
                    {t(`gabinet.bodyChart.regions.${region.region}`)}
                  </span>
                </div>
                {region.note && (
                  <p className="text-xs text-muted-foreground mt-1">{region.note}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
