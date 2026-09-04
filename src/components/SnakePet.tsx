import type { CSSProperties } from "react";
import type { WidgetDock } from "../../shared/types";
import type { WidgetStatus } from "../lib/source-model";

export type SnakeMood = WidgetStatus;

export interface SnakePetProps {
  mood: SnakeMood;
  orientation: WidgetDock;
  wrapping?: boolean;
}

/**
 * Columns the crawl pose is cut into. Each one carries ~10px of body, narrow
 * enough that the step between neighbours reads as a curve rather than a seam.
 */
const CRAWL_SLICES = 24;

/** The extended forked tongue, drawn separately from the body in the source art. */
const TONGUE = "./pet/frames/19.png";

/** Docks where the pet owns a whole screen edge and travels along it. */
function isCrawlDock(orientation: WidgetDock): boolean {
  return orientation === "left" || orientation === "right" || orientation === "top";
}

/** Corner docks park in place; only the tongue moves. */
function isCoilDock(orientation: WidgetDock): boolean {
  return orientation === "bottom-left" || orientation === "bottom-right";
}

function basePose(orientation: WidgetDock): string {
  // The straight, tongueless pose: slicing an already S-curved body fights the
  // travelling wave instead of carrying it. Shadow stripped by
  // scripts/derive-crawl-pose.mjs, since a baked one would undulate too.
  if (isCrawlDock(orientation)) return "./pet/frames/09-crawl.png";
  // Tight coil, head up, mouth closed. Shadow stripped the same way so the
  // pale contact blob does not smear on a dark desktop.
  if (isCoilDock(orientation)) return "./pet/frames/12-coil.png";
  return "./pet/frames/06.png";
}

function orientationClass(orientation: WidgetDock): string {
  if (orientation === "left") return "snake-pet--from-left";
  if (orientation === "right") return "snake-pet--from-right";
  if (orientation === "top") return "snake-pet--from-top";
  if (orientation === "bottom-left" || orientation === "bottom-right") {
    return "snake-pet--from-bottom";
  }
  return "snake-pet--from-center";
}

export function SnakePet({ mood, orientation, wrapping = false }: SnakePetProps) {
  const pose = basePose(orientation);
  const crawling = isCrawlDock(orientation);
  const coiling = isCoilDock(orientation);

  return (
    <div
      className={`snake-pet ${orientationClass(orientation)}${
        crawling ? " snake-pet--crawl" : ""
      }${coiling ? " snake-pet--coil" : ""}${wrapping ? " snake-pet--wrapping" : ""}`}
      data-mood={mood}
      aria-hidden="true"
    >
      <div
        className={`snake-pet__motion snake-pet__motion--${mood}`}
        style={crawling ? ({ "--slices": CRAWL_SLICES } as CSSProperties) : undefined}
      >
        {crawling ? (
          <>
            {/* Behind the columns, so the head hides where the tongue leaves the mouth. */}
            <span className="snake-pet__tongue-anchor">
              <img src={TONGUE} alt="" draggable={false} className="snake-pet__tongue" />
            </span>
            {Array.from({ length: CRAWL_SLICES }, (_, index) => (
              <span
                key={index}
                className="snake-pet__slice"
                style={{ "--i": index } as CSSProperties}
              >
                <img src={pose} alt="" draggable={false} className="snake-pet__sprite" />
              </span>
            ))}
          </>
        ) : coiling ? (
          <>
            <span className="snake-pet__tongue-anchor">
              <img src={TONGUE} alt="" draggable={false} className="snake-pet__tongue" />
            </span>
            <img src={pose} alt="" draggable={false} className="snake-pet__sprite" />
          </>
        ) : (
          <img src={pose} alt="" draggable={false} className="snake-pet__sprite" />
        )}
      </div>
    </div>
  );
}
