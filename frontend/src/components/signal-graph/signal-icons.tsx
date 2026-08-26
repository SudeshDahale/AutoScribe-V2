import {
  Mail,
  MessageSquare,
  CalendarDays,
  Mic,
  Bookmark,
  GitBranch,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";
import type { SignalCategory } from "./signal-graph-data";

export const CATEGORY_ICONS: Record<SignalCategory, LucideIcon> = {
  documentation: Mail,
  workflow: MessageSquare,
  api: CalendarDays,
  agent: Mic,
  dependency: Bookmark,
  code: GitBranch,
  architecture: UploadCloud,
};

export const CATEGORY_LABELS: Record<SignalCategory, string> = {
  documentation: "Inbox",
  workflow: "Slack",
  api: "Calendar",
  agent: "Voice Notes",
  dependency: "Web Clips",
  code: "Repository",
  architecture: "Uploads",
};

export const CATEGORY_SHORT_LABELS: Record<SignalCategory, string> = {
  documentation: "Inbox",
  workflow: "Slack",
  api: "Calendar",
  agent: "Voice Notes",
  dependency: "Web Clips",
  code: "Repository",
  architecture: "Uploads",
};

export const CATEGORY_SUBTITLES: Record<SignalCategory, string> = {
  documentation: "mail.autoscribe",
  workflow: "12 channels",
  api: "3 workspaces",
  agent: "device capture",
  dependency: "extension",
  code: "autoscribe/core",
  architecture: "drop folder",
};
