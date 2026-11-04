import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { RegionId } from "@/data/generators/regions";
import { fetchScenes, loadSceneImage, NisarPlacementError } from "./nisar";

const HOUR = 3600e3;

/**
 * Scene list and selected image for the map's NISAR layer. Nothing is fetched until the
 * layer is on (images are ~4 MB) and react-query never runs these on the server, so SSR
 * output stays deterministic.
 */
export function useNisar(region: RegionId, enabled: boolean) {
  const [picked, setPicked] = useState<string | null>(null);
  const scenes = useQuery({
    queryKey: ["nisar-scenes", region],
    queryFn: ({ signal }) => fetchScenes(region, signal),
    enabled,
    staleTime: HOUR,
    retry: 1,
  });
  const list = scenes.data ?? [];
  const scene = list.find((s) => s.id === picked) ?? list[0] ?? null;
  const image = useQuery({
    queryKey: ["nisar-image", scene?.id],
    queryFn: ({ signal }) => loadSceneImage(scene!, signal),
    enabled: enabled && scene != null,
    staleTime: Infinity,
    gcTime: 10 * 60e3,
    retry: (count, error) => !(error instanceof NisarPlacementError) && count < 1,
  });
  return {
    scenes: list,
    scene,
    select: setPicked,
    image: image.data ?? null,
    loading: scenes.isFetching || image.isFetching,
    error: scenes.error ?? image.error,
  };
}
