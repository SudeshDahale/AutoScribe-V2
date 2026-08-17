import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute fresh state — prevents re-fetching on every link click
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false, // Prevents sudden lockups when clicking back and forth
        refetchOnMount: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent", // Preloads route components on hover so clicks are instant
    defaultPreloadDelay: 30,
    defaultPreloadStaleTime: 60_000,
  });

  return router;
};
