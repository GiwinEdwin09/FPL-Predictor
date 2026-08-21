import Image from "next/image";

type TeamCrestProps = {
  name: string;
  badgePath: string | null;
  /** Rendered pixel size (square). */
  size?: number;
  className?: string;
};

function initials(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 3).toUpperCase();
}

export function TeamCrest({ name, badgePath, size = 40, className = "" }: TeamCrestProps) {
  const style = { width: size, height: size };

  if (!badgePath) {
    return (
      <span
        className={`crest-fallback ${className}`}
        style={{ ...style, fontSize: Math.max(9, Math.round(size * 0.26)) }}
        role="img"
        aria-label={`${name} crest unavailable`}
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <Image
      src={badgePath}
      alt=""
      width={size}
      height={size}
      className={`crest ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}
