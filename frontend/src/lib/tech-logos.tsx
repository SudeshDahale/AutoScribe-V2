import type { CSSProperties } from "react";
import type { IconType } from "react-icons";
import {
  SiReact,
  SiTypescript,
  SiJavascript,
  SiPython,
  SiGo,
  SiFastapi,
  SiPostgresql,
  SiRedis,
  SiApachekafka,
  SiDocker,
  SiKubernetes,
  SiStripe,
  SiNodedotjs,
  SiTailwindcss,
  SiPrisma,
  SiJsonwebtokens,
  SiOpenapiinitiative,
  SiGithub,
  SiNextdotjs,
  SiCloudflare,
  SiVercel,
  SiGraphql,
  SiMongodb,
  SiNginx,
  SiExpress,
  SiElasticsearch,
} from "react-icons/si";
import { TbApi, TbDatabase, TbRouter } from "react-icons/tb";

type LogoDef = { icon: IconType; color: string };

const map: Record<string, LogoDef> = {
  react: { icon: SiReact, color: "#61DAFB" },
  "tanstack router": { icon: TbRouter, color: "#FF4154" },
  tanstack: { icon: TbRouter, color: "#FF4154" },
  typescript: { icon: SiTypescript, color: "#3178C6" },
  javascript: { icon: SiJavascript, color: "#F7DF1E" },
  python: { icon: SiPython, color: "#3776AB" },
  go: { icon: SiGo, color: "#00ADD8" },
  fastapi: { icon: SiFastapi, color: "#009688" },
  postgresql: { icon: SiPostgresql, color: "#4169E1" },
  postgres: { icon: SiPostgresql, color: "#4169E1" },
  redis: { icon: SiRedis, color: "#DC382D" },
  kafka: { icon: SiApachekafka, color: "#F8F8F8" },
  docker: { icon: SiDocker, color: "#2496ED" },
  kubernetes: { icon: SiKubernetes, color: "#326CE5" },
  stripe: { icon: SiStripe, color: "#635BFF" },
  "stripe api": { icon: SiStripe, color: "#635BFF" },
  "node.js": { icon: SiNodedotjs, color: "#5FA04E" },
  nodejs: { icon: SiNodedotjs, color: "#5FA04E" },
  tailwind: { icon: SiTailwindcss, color: "#38BDF8" },
  tailwindcss: { icon: SiTailwindcss, color: "#38BDF8" },
  prisma: { icon: SiPrisma, color: "#2D3748" },
  migrations: { icon: TbDatabase, color: "#94A3B8" },
  jwt: { icon: SiJsonwebtokens, color: "#D63AFF" },
  openapi: { icon: SiOpenapiinitiative, color: "#6BA539" },
  github: { icon: SiGithub, color: "#F8F8F8" },
  nextjs: { icon: SiNextdotjs, color: "#F8F8F8" },
  aws: { icon: SiApachekafka, color: "#FF9900" },
  cloudflare: { icon: SiCloudflare, color: "#F38020" },
  vercel: { icon: SiVercel, color: "#F8F8F8" },
  graphql: { icon: SiGraphql, color: "#E535AB" },
  mongodb: { icon: SiMongodb, color: "#47A248" },
  nginx: { icon: SiNginx, color: "#009639" },
  express: { icon: SiExpress, color: "#F8F8F8" },
  elasticsearch: { icon: SiElasticsearch, color: "#005571" },
  ioredis: { icon: SiRedis, color: "#DC382D" },
};

export function techLogo(name?: string | null): LogoDef {
  if (!name || typeof name !== "string") {
    return {
      icon: TbApi,
      color: "#C4E05B",
    };
  }
  const key = name.trim().toLowerCase();
  return (
    map[key] ?? {
      icon: TbApi,
      color: "#C4E05B",
    }
  );
}

export function TechChip({ name }: { name?: string | null }) {
  const { icon: Icon, color } = techLogo(name);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-surface-2 border border-border">
      <Icon className="w-3.5 h-3.5" style={{ color }} />
      <span className="text-foreground/85">{name || "Code"}</span>
    </span>
  );
}

export function TechIcon({ name, className }: { name?: string | null; className?: string }) {
  const { icon: Icon, color } = techLogo(name);
  return <Icon className={className ?? "w-4 h-4"} style={{ color }} />;
}