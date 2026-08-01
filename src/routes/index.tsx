import { createFileRoute } from "@tanstack/react-router";
import { GrabberApp } from "@/components/grabber/GrabberApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Grabber — Minimal Video Downloader for PC" },
      {
        name: "description",
        content:
          "Grabber downloads videos from 1000+ sites by link. Bulk URL queue, per-item downloads, custom destination folder. By Sourav.",
      },
      { property: "og:title", content: "Grabber — Minimal Video Downloader for PC" },
      {
        property: "og:description",
        content:
          "Paste a link or a whole list. Bulk queue, per-item control, custom download folder — a polished desktop video downloader.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GrabberApp,
});
