"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 20_000 } } }));
  return <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster position="bottom-right" toastOptions={{ classNames: { toast: "!rounded-md !border-border !bg-raised !text-fg !shadow-md", description: "!text-fg-secondary", actionButton: "!bg-accent !text-fg-on-accent" } }} />
    </ThemeProvider>
  </QueryClientProvider>;
}
