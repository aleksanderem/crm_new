import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { bodyFront, BODY_FRONT_VIEWBOX, type BodyPartPath } from "./body-parts/body-front";
import { bodyBack, BODY_BACK_VIEWBOX } from "./body-parts/body-back";

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

// Map old simple region names to new anatomical regions
const REGION_MAPPING: Record<string, string[]> = {
  head: ["head"],
  neck: ["neck"],
  chest: ["chest", "trapezius", "deltoids"],
  abdomen: ["abs", "obliques"],
  "upper-back": ["upper-back", "trapezius"],
  "lower-back": ["lower-back", "gluteal"],
  "left-arm": ["biceps", "triceps", "deltoids"],
  "right-arm": ["biceps", "triceps", "deltoids"],
  "left-hand": ["hands"],
  "right-hand": ["hands"],
  "left-leg": ["quadriceps", "adductors", "knees", "tibialis", "calves", "ankles"],
  "right-leg": ["quadriceps", "adductors", "knees", "tibialis", "calves", "ankles"],
  "left-foot": ["feet"],
  "right-foot": ["feet"],
};

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

// All available regions for the legend
const ALL_REGIONS = [
  { id: "head", label: "Head" },
  { id: "neck", label: "Neck" },
  { id: "chest", label: "Chest" },
  { id: "abs", label: "Abdomen" },
  { id: "upper-back", label: "Upper Back" },
  { id: "lower-back", label: "Lower Back" },
  { id: "biceps", label: "Biceps" },
  { id: "triceps", label: "Triceps" },
  { id: "deltoids", label: "Shoulders" },
  { id: "forearm", label: "Forearm" },
  { id: "hands", label: "Hands" },
  { id: "quadriceps", label: "Quadriceps" },
  { id: "hamstring", label: "Hamstrings" },
  { id: "adductors", label: "Adductors" },
  { id: "knees", label: "Knees" },
  { id: "calves", label: "Calves" },
  { id: "ankles", label: "Ankles" },
  { id: "feet", label: "Feet" },
  { id: "gluteal", label: "Glutes" },
  { id: "obliques", label: "Obliques" },
];

interface BodyViewProps {
  parts: BodyPartPath[];
  viewBox: string;
  data: BodyRegion[];
  onRegionClick?: (slug: string) => void;
  readOnly?: boolean;
  side: "left" | "right";
}

function BodyView({ parts, viewBox, data, onRegionClick, readOnly, side }: BodyViewProps) {
  const getRegionColor = useCallback(
    (slug: string) => {
      const region = data.find((r) => r.region === slug);
      if (!region) return "transparent";
      return region.color;
    },
    [data]
  );

  const getRegionOpacity = useCallback(
    (slug: string) => {
      const region = data.find((r) => r.region === slug);
      if (!region) return 0;
      return region.intensity;
    },
    [data]
  );

  const hasRegion = useCallback(
    (slug: string) => {
      return data.some((r) => r.region === slug);
    },
    [data]
  );

  return (
    <svg
      viewBox={viewBox}
      className="w-full h-auto max-h-[600px]"
      style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" }}
    >
      {/* Background body fill */}
      <g fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="2">
        {parts.map((part) => {
          const paths: string[] = [];
          if (part.path.common) paths.push(...part.path.common);
          if (part.path.left && (side === "left" || !part.path.right)) {
            paths.push(...part.path.left);
          }
          if (part.path.right && (side === "right" || !part.path.left)) {
            paths.push(...part.path.right);
          }

          return paths.map((d, idx) => (
            <path key={`${part.slug}-bg-${idx}`} d={d} />
          ));
        })}
      </g>

      {/* Clickable colored overlays */}
      <g className={cn(readOnly ? "" : "cursor-pointer")}>
        {parts.map((part) => {
          const paths: { d: string; side: "left" | "right" | "common" }[] = [];
          
          if (part.path.common) {
            part.path.common.forEach((d) => paths.push({ d, side: "common" }));
          }
          
          if (part.path.left) {
            if (side === "left") {
              part.path.left.forEach((d) => paths.push({ d, side: "left" }));
            } else if (!part.path.right) {
              part.path.left.forEach((d) => paths.push({ d, side: "left" }));
            }
          }
          
          if (part.path.right) {
            if (side === "right") {
              part.path.right.forEach((d) => paths.push({ d, side: "right" }));
            } else if (!part.path.left) {
              part.path.right.forEach((d) => paths.push({ d, side: "right" }));
            }
          }

          const isHighlighted = hasRegion(part.slug);
          const color = getRegionColor(part.slug);
          const opacity = getRegionOpacity(part.slug);

          return paths.map((pathData, idx) => (
            <path
              key={`${part.slug}-overlay-${idx}`}
              d={pathData.d}
              fill={isHighlighted ? color : "transparent"}
              opacity={isHighlighted ? opacity : 0}
              onClick={() => !readOnly && onRegionClick?.(part.slug)}
              className={cn(
                "transition-all duration-200",
                !readOnly && !isHighlighted && "hover:fill-primary/20 hover:opacity-100",
                !readOnly && isHighlighted && "hover:opacity-80"
              )}
              stroke={isHighlighted ? color : "transparent"}
              strokeWidth={isHighlighted ? 2 : 0}
            />
          ));
        })}
      </g>
    </svg>
  );
}

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

  const selectedData = selectedRegion ? getRegionData(selectedRegion) : null;

  // Group regions by body part for easier selection
  const groupedRegions = useMemo(() => {
    return {
      upper: ALL_REGIONS.filter((r) =>
        ["head", "neck", "shoulders", "chest", "upper-back", "trapezius", "deltoids", "biceps", "triceps", "forearm", "hands"].includes(r.id)
      ),
      core: ALL_REGIONS.filter((r) =>
        ["abs", "obliques", "lower-back", "gluteal"].includes(r.id)
      ),
      lower: ALL_REGIONS.filter((r) =>
        ["quadriceps", "hamstring", "adductors", "knees", "calves", "ankles", "feet"].includes(r.id)
      ),
    };
  }, []);

  return (
    <div className="flex gap-6 flex-col lg:flex-row">
      {/* Body SVGs */}
      <div className="flex-1 flex flex-col md:flex-row justify-center gap-4">
        {/* Front View */}
        <div className="space-y-2 flex-1">
          <p className="text-center text-sm font-medium text-muted-foreground">
            {t("gabinet.bodyChart.front")}
          </p>
          <div className="bg-card rounded-lg p-4 border">
            <BodyView
              parts={bodyFront}
              viewBox={BODY_FRONT_VIEWBOX}
              data={data}
              onRegionClick={toggleRegion}
              readOnly={readOnly}
              side="left"
            />
          </div>
        </div>

        {/* Back View */}
        <div className="space-y-2 flex-1">
          <p className="text-center text-sm font-medium text-muted-foreground">
            {t("gabinet.bodyChart.back")}
          </p>
          <div className="bg-card rounded-lg p-4 border">
            <BodyView
              parts={bodyBack}
              viewBox={BODY_BACK_VIEWBOX}
              data={data}
              onRegionClick={toggleRegion}
              readOnly={readOnly}
              side="right"
            />
          </div>
        </div>
      </div>

      {/* Controls Panel */}
      {!readOnly && (
        <div className="w-full lg:w-72 space-y-4">
          {/* Region Editor */}
          {selectedData ? (
            <div className="space-y-4 p-4 border rounded-lg bg-card">
              <h3 className="font-medium text-lg">
                {t(`gabinet.bodyChart.regions.${selectedRegion}`, selectedRegion)}
              </h3>

              {/* Color picker */}
              <div>
                <label className="text-sm text-muted-foreground">
                  {t("gabinet.bodyChart.color")}
                </label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {COLORS.map((color) => (
                    <button
                      key={color.value}
                      className={cn(
                        "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                        selectedData.color === color.value
                          ? "border-foreground ring-2 ring-primary ring-offset-2"
                          : "border-transparent"
                      )}
                      style={{ backgroundColor: color.value }}
                      onClick={() => updateRegion(selectedRegion, { color: color.value })}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              {/* Intensity selector */}
              <div>
                <label className="text-sm text-muted-foreground">
                  {t("gabinet.bodyChart.intensity")}
                </label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {INTENSITIES.map((int) => (
                    <button
                      key={int.value}
                      className={cn(
                        "px-3 py-1.5 text-xs rounded border transition-colors",
                        selectedData.intensity === int.value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted"
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
                <label className="text-sm text-muted-foreground">
                  {t("gabinet.bodyChart.note")}
                </label>
                <textarea
                  className="w-full mt-2 p-2 text-sm border rounded resize-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  rows={3}
                  value={editNote || selectedData.note}
                  onChange={(e) => setEditNote(e.target.value)}
                  onBlur={() => updateRegion(selectedRegion, { note: editNote })}
                  placeholder={t("gabinet.bodyChart.notePlaceholder")}
                />
              </div>

              {/* Remove button */}
              <button
                className="w-full py-2 text-sm text-destructive hover:bg-destructive/10 rounded border border-destructive/20 transition-colors"
                onClick={() => toggleRegion(selectedRegion)}
              >
                {t("gabinet.bodyChart.removeRegion")}
              </button>
            </div>
          ) : (
            <div className="p-4 border rounded-lg bg-muted/50 text-center">
              <p className="text-sm text-muted-foreground">
                {t("gabinet.bodyChart.clickToSelect")}
              </p>
            </div>
          )}

          {/* Clear All */}
          {data.length > 0 && (
            <button
              className="w-full py-2 text-sm border rounded hover:bg-muted transition-colors"
              onClick={clearAll}
            >
              {t("gabinet.bodyChart.clearAll")}
            </button>
          )}

          {/* Region Legend - Grouped */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{t("gabinet.bodyChart.allRegions")}</h3>
            
            {/* Upper Body */}
            <div>
              <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Upper Body</p>
              <div className="grid grid-cols-2 gap-1">
                {groupedRegions.upper.map((region) => {
                  const regionData = getRegionData(region.id);
                  return (
                    <button
                      key={region.id}
                      className={cn(
                        "flex items-center gap-1.5 p-1.5 rounded text-left text-xs transition-colors",
                        regionData ? "bg-primary/10 border border-primary/20" : "hover:bg-muted"
                      )}
                      onClick={() => setSelectedRegion(region.id)}
                    >
                      <div
                        className="w-3 h-3 rounded-sm border flex-shrink-0"
                        style={{
                          backgroundColor: regionData ? regionData.color : "transparent",
                          opacity: regionData ? regionData.intensity : 0.5,
                        }}
                      />
                      <span className="truncate">
                        {t(`gabinet.bodyChart.regions.${region.id}`, region.label)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Core */}
            <div>
              <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Core</p>
              <div className="grid grid-cols-2 gap-1">
                {groupedRegions.core.map((region) => {
                  const regionData = getRegionData(region.id);
                  return (
                    <button
                      key={region.id}
                      className={cn(
                        "flex items-center gap-1.5 p-1.5 rounded text-left text-xs transition-colors",
                        regionData ? "bg-primary/10 border border-primary/20" : "hover:bg-muted"
                      )}
                      onClick={() => setSelectedRegion(region.id)}
                    >
                      <div
                        className="w-3 h-3 rounded-sm border flex-shrink-0"
                        style={{
                          backgroundColor: regionData ? regionData.color : "transparent",
                          opacity: regionData ? regionData.intensity : 0.5,
                        }}
                      />
                      <span className="truncate">
                        {t(`gabinet.bodyChart.regions.${region.id}`, region.label)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lower Body */}
            <div>
              <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Lower Body</p>
              <div className="grid grid-cols-2 gap-1">
                {groupedRegions.lower.map((region) => {
                  const regionData = getRegionData(region.id);
                  return (
                    <button
                      key={region.id}
                      className={cn(
                        "flex items-center gap-1.5 p-1.5 rounded text-left text-xs transition-colors",
                        regionData ? "bg-primary/10 border border-primary/20" : "hover:bg-muted"
                      )}
                      onClick={() => setSelectedRegion(region.id)}
                    >
                      <div
                        className="w-3 h-3 rounded-sm border flex-shrink-0"
                        style={{
                          backgroundColor: regionData ? regionData.color : "transparent",
                          opacity: regionData ? regionData.intensity : 0.5,
                        }}
                      />
                      <span className="truncate">
                        {t(`gabinet.bodyChart.regions.${region.id}`, region.label)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Read-only Summary */}
      {readOnly && data.length > 0 && (
        <div className="w-full lg:w-72 space-y-2">
          <h3 className="text-sm font-medium">{t("gabinet.bodyChart.markedRegions")}</h3>
          <div className="space-y-2">
            {data.map((region) => (
              <div key={region.region} className="p-3 border rounded-lg bg-card">
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: region.color, opacity: region.intensity }}
                  />
                  <span className="text-sm font-medium">
                    {t(`gabinet.bodyChart.regions.${region.region}`, region.region)}
                  </span>
                </div>
                {region.note && (
                  <p className="text-xs text-muted-foreground mt-2 pl-6">{region.note}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
