import Image from "next/image";
import { SHOT, shotSrc, type ShotName } from "@/components/site/content";

// An iPhone-style frame around a real platform screenshot (public/shots, made by scripts/shots.mjs).
// The status bar is drawn here, not captured, so the screenshots stay free of a fake clock.
export function Phone({
  shot,
  alt,
  className = "",
  sizes,
  eager = false,
  crop,
}: {
  shot: ShotName;
  alt: string;
  className?: string;
  sizes: string;
  eager?: boolean;
  crop?: "top" | "bottom";
}) {
  const img = (
    <Image
      src={shotSrc(shot)}
      alt={alt}
      width={SHOT.width}
      height={SHOT.height}
      sizes={sizes}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      draggable={false}
    />
  );
  return (
    <div className={`s-phone ${className}`}>
      <div className="s-body">
        <div className="s-screen">
          <div className="s-status" aria-hidden="true">
            <span>9:41</span>
            <span className="isl" />
            <svg viewBox="0 0 60 14" fill="currentColor">
              <rect x="0" y="9" width="3" height="5" rx="1" />
              <rect x="5" y="6.5" width="3" height="7.5" rx="1" />
              <rect x="10" y="4" width="3" height="10" rx="1" />
              <rect x="15" y="1.5" width="3" height="12.5" rx="1" />
              <rect
                x="32"
                y="2"
                width="22"
                height="11"
                rx="3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                opacity=".5"
              />
              <rect x="34" y="4" width="16" height="7" rx="1.6" />
              <rect x="55.5" y="5.5" width="2" height="4" rx="1" opacity=".5" />
            </svg>
          </div>
          {crop ? <div className={`s-crop ${crop}`}>{img}</div> : img}
        </div>
      </div>
    </div>
  );
}
