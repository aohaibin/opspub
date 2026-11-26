import { logoUrl } from "@/lib/logo";
import { useSettingsStore } from "@/store/settings";

export function BrandLogo({ size, className }: { size: number; className?: string }) {
  const color = useSettingsStore((state) => state.logoColor);

  return (
    <span className={className} style={{ display: "inline-block", width: size, height: size }} aria-hidden>
      <img className="opspub-logo-dark" src={logoUrl.inApp(color, "dark")} alt="" width={size} height={size} draggable={false} />
      <img className="opspub-logo-light" src={logoUrl.inApp(color, "light")} alt="" width={size} height={size} draggable={false} />
    </span>
  );
}
